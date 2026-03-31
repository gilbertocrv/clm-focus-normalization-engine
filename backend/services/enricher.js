const { parse } = require('csv-parse/sync');
const { parseCost, stripBOM } = require('../normalizer');

// ─── Parser de sinais de segurança ────────────────────────────
//
// Aceita CSV no formato genérico (data/samples/security_signals.csv).
// Retorna array de sinais normalizados pelo schema comum de segurança.
//
function parseSecuritySignals(csvText, mapping) {
  const map = mapping['generic'];

  const rows = parse(stripBOM(csvText), {
    columns:          true,
    skip_empty_lines: true,
    trim:             true,
    bom:              true,
  });

  return rows
    .filter(row => (row[map.resource_id] || '').trim())
    .map(row => ({
      resource_id:     (row[map.resource_id]    || '').trim(),
      identity_id:     (row[map.identity_id]    || '').trim(),
      identity_name:   (row[map.identity_name]  || '').trim() || 'unknown',
      action:          (row[map.action]          || '').trim(),
      risk_type:       (row[map.risk_type]       || '').trim(),
      severity:        (row[map.severity]        || 'low').trim().toLowerCase(),
      has_approval:    parseBoolean(row[map.has_approval]),
      public_exposure: parseBoolean(row[map.public_exposure]),
      sensitive_data:  parseBoolean(row[map.sensitive_data]),
      timestamp:       (row[map.timestamp]       || '').trim(),
      source:          (row[map.source]          || '').trim(),
      _native: row,
    }));
}

function parseBoolean(val) {
  if (val === null || val === undefined || val === '') return false;
  return String(val).trim().toLowerCase() === 'true';
}

// ─── Índice de sinais por resource_id ────────────────────────
// Join semântico: resource_id é a chave primária entre billing e segurança
function indexByResourceId(signals) {
  return signals.reduce((acc, s) => {
    if (!acc[s.resource_id]) acc[s.resource_id] = [];
    acc[s.resource_id].push(s);
    return acc;
  }, {});
}

// ─── Cálculo de risco determinístico ─────────────────────────
//
// Regras simples e auditáveis. Cada dimensão contribui independentemente.
// Máximo possível: 10 pontos.
//
function calculateRiskScore(resource, signals, rules) {
  let score = 0;
  const reasons = [];

  const hasApproval    = signals.some(s => s.has_approval === true);
  const isExposed      = signals.some(s => s.public_exposure === true);
  const hasSensitive   = signals.some(s => s.sensitive_data === true);
  const isHighCost     = resource.billed_cost > rules.thresholds.high_cost;

  if (!hasApproval && signals.length > 0) {
    score += rules.weights.no_approval;
    reasons.push('no_approval');
  }
  if (isExposed) {
    score += rules.weights.public_exposure;
    reasons.push('public_exposure');
  }
  if (hasSensitive) {
    score += rules.weights.sensitive_data;
    reasons.push('sensitive_data');
  }
  // high_cost amplifica risco existente — não cria risco sozinho
  if (isHighCost && reasons.length > 0) {
    score += rules.weights.high_cost;
    reasons.push('high_cost');
  }

  return { score: Math.min(score, 10), reasons };
}

function classifyRiskLevel(score, rules) {
  if (score >= rules.thresholds.risk_high)   return 'high';
  if (score >= rules.thresholds.risk_medium) return 'medium';
  if (score >= rules.thresholds.risk_low)    return 'low';
  return 'none';
}

// ─── Extrai owner da lista de sinais ─────────────────────────
//
// Retorna "responsável financeiro provável" — não "owner real".
// Confidence reflete a força da evidência de atribuição.
//
// high   → ação explícita de criação por identidade humana
// medium → ação de criação por role/service-account
// low    → nenhuma ação de criação encontrada (fallback)
//
const CREATION_ACTIONS_DIRECT = [
  'runinstances', 'createdbinstance', 'createcluster', 'createbucket',
  'launchinstance', 'createinstance', 'createfunction', 'createtable',
  'compute.instances.insert', 'storage.buckets.create',
  'microsoft.compute/virtualmachines/write',
  'microsoft.documentdb/databaseaccounts/write',
];

const AUTOMATED_PATTERNS = [
  'role/', '-role', 'serviceaccount', '-sa', 'terraform',
  'cloudformation', 'autoscaling', 'pipeline', 'lambda',
];

function inferConfidence(signal, isCreationAction) {
  if (!isCreationAction) return 'low';
  const id = (signal.identity_id || '').toLowerCase();
  const isAutomated = AUTOMATED_PATTERNS.some(p => id.includes(p));
  return isAutomated ? 'medium' : 'high';
}

function extractOwner(signals) {
  if (!signals.length) return null;

  const creator = signals.find(s =>
    CREATION_ACTIONS_DIRECT.some(a => (s.action || '').toLowerCase().includes(a))
  );
  const signal         = creator || signals[0];
  const isCreation     = !!creator;
  const confidence     = inferConfidence(signal, isCreation);

  return {
    identity_id:    signal.identity_id    || null,
    identity_name:  signal.identity_name  || 'unknown',
    action:         signal.action         || null,
    timestamp:      signal.timestamp      || null,
    source:         signal.source         || null,
    confidence,
    // Nota semântica: atribuição inferida, não garantida
    _note: isCreation
      ? 'atribuído por ação de criação detectada'
      : 'atribuído por fallback — nenhuma ação de criação encontrada',
  };
}

// ─── Constrói security_context completo ──────────────────────
function buildSecurityContext(resource, signals, rules) {
  const { score, reasons } = calculateRiskScore(resource, signals, rules);
  const risk_level = classifyRiskLevel(score, rules);
  const owner      = extractOwner(signals);

  // Custo em risco: proporção do custo atribuída ao risco (score/10)
  // Definição explícita: custo total * (risk_score / 10)
  // Score 0 → cost_at_risk 0; Score 10 → cost_at_risk = billed_cost integral
  const cost_at_risk = parseFloat((resource.billed_cost * (score / 10)).toFixed(2));

  return {
    owner,
    findings:       reasons,
    risk_score:     score,
    risk_level,
    cost_at_risk,
    signal_count:   signals.length,
    has_signals:    signals.length > 0,
    // Trilha de decisão auditável: por que este score?
    _why: reasons.map(r => rules._rationale?.[r] || r),
    // Versionamento: snapshot imutável desta avaliação
    _snapshot: {
      evaluated_at:   new Date().toISOString(),
      rules_version:  rules._version || '1.0.0',
      signal_ids:     signals.map(s => s.resource_id + ':' + (s.timestamp || '')),
    },
  };
}

// ─── Enriquece lista de recursos com contexto de segurança ───
//
// Este é o coração da correlação.
// Faz join por resource_id entre billing normalizado e sinais de segurança.
//
function enrich(resources, securitySignals, rules) {
  const signalIndex = indexByResourceId(securitySignals);

  return resources.map(resource => {
    const signals = signalIndex[resource.resource_id] || [];
    const security_context = buildSecurityContext(resource, signals, rules);

    return {
      ...resource,
      security_context,
    };
  });
}

// ─── Agrega KPIs de segurança financeira ─────────────────────
function aggregateRiskKPIs(enrichedRecords) {
  const total_cost     = enrichedRecords.reduce((s, r) => s + r.billed_cost, 0);
  const cost_at_risk   = enrichedRecords.reduce((s, r) => s + r.security_context.cost_at_risk, 0);
  const high_risk      = enrichedRecords.filter(r => r.security_context.risk_level === 'high');
  const no_approval    = enrichedRecords.filter(r => r.security_context.findings.includes('no_approval'));
  const exposed        = enrichedRecords.filter(r => r.security_context.findings.includes('public_exposure'));

  // Top identidades por custo sem aprovação
  const identity_spend = {};
  for (const r of no_approval) {
    const name = r.security_context.owner?.identity_name || 'unknown';
    if (!identity_spend[name]) identity_spend[name] = 0;
    identity_spend[name] += r.billed_cost;
  }

  const top_identities = Object.entries(identity_spend)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, cost]) => ({ identity_name: name, cost_without_approval: parseFloat(cost.toFixed(2)) }));

  // Custo não atribuído: owner ausente ou confidence baixa
  // "Quanto do meu custo não tem dono?"
  const unattributed = enrichedRecords.filter(r =>
    !r.security_context.owner ||
    r.security_context.owner.confidence === 'low' ||
    r.security_context.owner.identity_name === 'unknown'
  );

  return {
    total_cost:                   parseFloat(total_cost.toFixed(2)),
    cost_at_risk:                 parseFloat(cost_at_risk.toFixed(2)),
    cost_at_risk_pct:             total_cost > 0
                                    ? parseFloat((cost_at_risk / total_cost * 100).toFixed(1))
                                    : 0,
    high_risk_resources:          high_risk.length,
    cost_without_approval:        parseFloat(no_approval.reduce((s, r) => s + r.billed_cost, 0).toFixed(2)),
    cost_publicly_exposed:        parseFloat(exposed.reduce((s, r) => s + r.billed_cost, 0).toFixed(2)),
    unattributed_cost:            parseFloat(unattributed.reduce((s, r) => s + r.billed_cost, 0).toFixed(2)),
    unattributed_resources:       unattributed.length,
    resources_without_signals:    enrichedRecords.filter(r => !r.security_context.has_signals).length,
    top_identities_by_spend:      top_identities,
  };
}

module.exports = {
  parseSecuritySignals,
  indexByResourceId,
  calculateRiskScore,
  classifyRiskLevel,
  extractOwner,
  buildSecurityContext,
  enrich,
  aggregateRiskKPIs,
};
