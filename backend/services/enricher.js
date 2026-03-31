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
// Prioriza sinais com ação de criação para rastrear quem gerou o custo
const CREATION_ACTIONS = [
  'runinstances', 'createdbinstance', 'createcluster', 'createbucket',
  'launchinstance', 'createinstance', 'write', 'insert', 'create',
];

function extractOwner(signals) {
  if (!signals.length) return null;

  // Tenta encontrar quem criou o recurso (ação de criação)
  const creator = signals.find(s =>
    CREATION_ACTIONS.some(a => (s.action || '').toLowerCase().includes(a))
  );
  const signal = creator || signals[0];

  return {
    identity_id:   signal.identity_id   || null,
    identity_name: signal.identity_name || 'unknown',
    action:        signal.action        || null,
    timestamp:     signal.timestamp     || null,
    source:        signal.source        || null,
  };
}

// ─── Constrói security_context completo ──────────────────────
function buildSecurityContext(resource, signals, rules) {
  const { score, reasons } = calculateRiskScore(resource, signals, rules);
  const risk_level = classifyRiskLevel(score, rules);
  const owner      = extractOwner(signals);

  // Custo em risco: custo total do recurso quando risk_score >= threshold
  const cost_at_risk = score >= rules.thresholds.risk_high
    ? resource.billed_cost
    : score >= rules.thresholds.risk_medium
      ? resource.billed_cost * 0.5
      : 0;

  return {
    owner,
    findings:       reasons,
    risk_score:     score,
    risk_level,
    cost_at_risk:   parseFloat(cost_at_risk.toFixed(2)),
    signal_count:   signals.length,
    has_signals:    signals.length > 0,
    // Trilha de decisão: por que este score?
    _why: reasons.map(r => rules._rationale?.[r] || r),
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

  return {
    total_cost:                   parseFloat(total_cost.toFixed(2)),
    cost_at_risk:                 parseFloat(cost_at_risk.toFixed(2)),
    cost_at_risk_pct:             total_cost > 0
                                    ? parseFloat((cost_at_risk / total_cost * 100).toFixed(1))
                                    : 0,
    high_risk_resources:          high_risk.length,
    cost_without_approval:        parseFloat(no_approval.reduce((s, r) => s + r.billed_cost, 0).toFixed(2)),
    cost_publicly_exposed:        parseFloat(exposed.reduce((s, r) => s + r.billed_cost, 0).toFixed(2)),
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
