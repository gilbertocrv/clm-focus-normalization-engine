const path = require('path');
const fs   = require('fs');

const {
  parseSecuritySignals,
  indexByResourceId,
  calculateRiskScore,
  classifyRiskLevel,
  extractOwner,
  buildSecurityContext,
  enrich,
  aggregateRiskKPIs,
} = require('./services/enricher');

const SECURITY_MAPPING = JSON.parse(fs.readFileSync(path.join(__dirname, '../security/mapping.security.json'), 'utf8'));
const SECURITY_RULES   = JSON.parse(fs.readFileSync(path.join(__dirname, '../security/rules.json'), 'utf8'));

// ─── Fixtures ─────────────────────────────────────────────────

const SIGNAL_CSV = fs.readFileSync(
  path.join(__dirname, '../data/samples/security_signals.csv'), 'utf8'
);

const makeResource = (overrides = {}) => ({
  resource_id:  'i-abc123',
  service_name: 'Amazon EC2',
  region:       'us-east-1',
  billed_cost:  4200,
  provider:     'aws',
  ...overrides,
});

const makeSignal = (overrides = {}) => ({
  resource_id:     'i-abc123',
  identity_id:     'arn:aws:iam::123:user/joao.silva',
  identity_name:   'joao.silva',
  action:          'RunInstances',
  risk_type:       'public_exposure',
  severity:        'high',
  has_approval:    false,
  public_exposure: false,
  sensitive_data:  false,
  timestamp:       '2024-03-01T10:00:00Z',
  source:          'aws_securityhub',
  ...overrides,
});

// ─── parseSecuritySignals ──────────────────────────────────────
describe('parseSecuritySignals', () => {
  test('parseia o sample completo sem erros', () => {
    const signals = parseSecuritySignals(SIGNAL_CSV, SECURITY_MAPPING);
    expect(signals.length).toBeGreaterThan(0);
  });

  test('todos os sinais têm resource_id', () => {
    const signals = parseSecuritySignals(SIGNAL_CSV, SECURITY_MAPPING);
    expect(signals.every(s => s.resource_id)).toBe(true);
  });

  test('has_approval é booleano', () => {
    const signals = parseSecuritySignals(SIGNAL_CSV, SECURITY_MAPPING);
    for (const s of signals) {
      expect(typeof s.has_approval).toBe('boolean');
      expect(typeof s.public_exposure).toBe('boolean');
      expect(typeof s.sensitive_data).toBe('boolean');
    }
  });

  test('descarta linhas com resource_id vazio', () => {
    const csv = 'resource_id,identity_id,identity_name,action,risk_type,severity,has_approval,public_exposure,sensitive_data,timestamp,source\n,user,name,action,,low,false,false,false,2024-01-01,test';
    const signals = parseSecuritySignals(csv, SECURITY_MAPPING);
    expect(signals.length).toBe(0);
  });
});

// ─── indexByResourceId ────────────────────────────────────────
describe('indexByResourceId', () => {
  test('agrupa sinais pelo resource_id correto', () => {
    const signals = [
      makeSignal({ resource_id: 'res-1' }),
      makeSignal({ resource_id: 'res-1' }),
      makeSignal({ resource_id: 'res-2' }),
    ];
    const idx = indexByResourceId(signals);
    expect(idx['res-1'].length).toBe(2);
    expect(idx['res-2'].length).toBe(1);
  });

  test('recurso sem sinal retorna undefined (não erro)', () => {
    const idx = indexByResourceId([]);
    expect(idx['qualquer-id']).toBeUndefined();
  });
});

// ─── calculateRiskScore ───────────────────────────────────────
describe('calculateRiskScore', () => {
  test('score zero sem sinais', () => {
    const { score } = calculateRiskScore(makeResource(), [], SECURITY_RULES);
    expect(score).toBe(0);
  });

  test('no_approval adiciona 3 pontos', () => {
    const signals = [makeSignal({ has_approval: false })];
    const { score, reasons } = calculateRiskScore(makeResource(), signals, SECURITY_RULES);
    expect(score).toBeGreaterThanOrEqual(3);
    expect(reasons).toContain('no_approval');
  });

  test('public_exposure adiciona 3 pontos', () => {
    const signals = [makeSignal({ has_approval: true, public_exposure: true })];
    const { score, reasons } = calculateRiskScore(makeResource(), signals, SECURITY_RULES);
    expect(score).toBeGreaterThanOrEqual(3);
    expect(reasons).toContain('public_exposure');
  });

  test('sensitive_data adiciona 2 pontos', () => {
    const signals = [makeSignal({ has_approval: true, sensitive_data: true })];
    const { score, reasons } = calculateRiskScore(makeResource(), signals, SECURITY_RULES);
    expect(reasons).toContain('sensitive_data');
  });

  test('high_cost adiciona 2 pontos quando há risco e custo acima do threshold', () => {
    const resource = makeResource({ billed_cost: 1500 });
    const signals  = [makeSignal({ has_approval: false })]; // no_approval ativa; high_cost amplifica
    const { score, reasons } = calculateRiskScore(resource, signals, SECURITY_RULES);
    expect(reasons).toContain('high_cost');
  });

  test('high_cost NÃO adicionado para custo abaixo do threshold', () => {
    const resource = makeResource({ billed_cost: 50 });
    const signals  = [makeSignal({ has_approval: false })]; // no_approval ativa; high_cost amplifica
    const { reasons } = calculateRiskScore(resource, signals, SECURITY_RULES);
    expect(reasons).not.toContain('high_cost');
  });

  test('score máximo não ultrapassa 10', () => {
    const resource = makeResource({ billed_cost: 9999 });
    const signals  = [makeSignal({
      has_approval: false, public_exposure: true, sensitive_data: true,
    })];
    const { score } = calculateRiskScore(resource, signals, SECURITY_RULES);
    expect(score).toBeLessThanOrEqual(10);
  });

  test('_why explica os motivos do score', () => {
    const signals = [makeSignal({ has_approval: false, public_exposure: true })];
    const ctx = buildSecurityContext(makeResource({ billed_cost: 1500 }), signals, SECURITY_RULES);
    expect(ctx._why.length).toBeGreaterThan(0);
  });
});

// ─── classifyRiskLevel ────────────────────────────────────────
describe('classifyRiskLevel', () => {
  test('score 0 → none', () => {
    expect(classifyRiskLevel(0, SECURITY_RULES)).toBe('none');
  });
  test('score 1-3 → low', () => {
    expect(classifyRiskLevel(2, SECURITY_RULES)).toBe('low');
  });
  test('score 4-6 → medium', () => {
    expect(classifyRiskLevel(5, SECURITY_RULES)).toBe('medium');
  });
  test('score 7-10 → high', () => {
    expect(classifyRiskLevel(8, SECURITY_RULES)).toBe('high');
  });
});

// ─── extractOwner ─────────────────────────────────────────────
describe('extractOwner', () => {
  test('retorna null owner quando sem sinais', () => {
    expect(extractOwner([])).toBeNull();
  });

  test('prioriza sinal com ação de criação', () => {
    const signals = [
      makeSignal({ action: 'DescribeInstances', identity_name: 'viewer' }),
      makeSignal({ action: 'RunInstances',       identity_name: 'joao.silva' }),
    ];
    const owner = extractOwner(signals);
    expect(owner.identity_name).toBe('joao.silva');
  });

  test('fallback para primeiro sinal se nenhuma ação de criação', () => {
    const signals = [
      makeSignal({ action: 'DescribeInstances', identity_name: 'viewer' }),
    ];
    const owner = extractOwner(signals);
    expect(owner.identity_name).toBe('viewer');
  });
});

// ─── enrich ───────────────────────────────────────────────────
describe('enrich', () => {
  let signals;
  beforeAll(() => {
    signals = parseSecuritySignals(SIGNAL_CSV, SECURITY_MAPPING);
  });

  test('todos os recursos recebem security_context', () => {
    const resources = [makeResource(), makeResource({ resource_id: 'outro-id' })];
    const enriched  = enrich(resources, signals, SECURITY_RULES);
    expect(enriched.every(r => r.security_context !== undefined)).toBe(true);
  });

  test('recurso sem sinal correspondente tem has_signals=false e score=0', () => {
    const resources = [makeResource({ resource_id: 'id-sem-sinal-xxx' })];
    const enriched  = enrich(resources, signals, SECURITY_RULES);
    expect(enriched[0].security_context.has_signals).toBe(false);
    expect(enriched[0].security_context.risk_score).toBe(0);
  });

  test('recurso com sinal público tem has_signals=true', () => {
    const resources = [makeResource({ resource_id: 'i-0a1b2c3d4e5f' })];
    const enriched  = enrich(resources, signals, SECURITY_RULES);
    expect(enriched[0].security_context.has_signals).toBe(true);
  });

  test('não remove campos originais do billing', () => {
    const resources = [makeResource()];
    const enriched  = enrich(resources, [], SECURITY_RULES);
    expect(enriched[0].resource_id).toBe('i-abc123');
    expect(enriched[0].billed_cost).toBe(4200);
    expect(enriched[0].provider).toBe('aws');
  });

  test('cost_at_risk é 0 para recursos sem risco', () => {
    const resources = [makeResource({ resource_id: 'clean-resource', billed_cost: 500 })];
    const enriched  = enrich(resources, [], SECURITY_RULES);
    expect(enriched[0].security_context.cost_at_risk).toBe(0);
  });
});

// ─── aggregateRiskKPIs ────────────────────────────────────────
describe('aggregateRiskKPIs', () => {
  test('retorna todos os KPIs esperados', () => {
    const resources = [makeResource()];
    const enriched  = enrich(resources, [], SECURITY_RULES);
    const kpis      = aggregateRiskKPIs(enriched);

    expect(kpis).toHaveProperty('total_cost');
    expect(kpis).toHaveProperty('cost_at_risk');
    expect(kpis).toHaveProperty('cost_at_risk_pct');
    expect(kpis).toHaveProperty('high_risk_resources');
    expect(kpis).toHaveProperty('cost_without_approval');
    expect(kpis).toHaveProperty('cost_publicly_exposed');
    expect(kpis).toHaveProperty('top_identities_by_spend');
  });

  test('cost_at_risk_pct nunca ultrapassa 100', () => {
    const signals  = [makeSignal({ has_approval: false, public_exposure: true })];
    const enriched = enrich([makeResource({ billed_cost: 5000 })], signals, SECURITY_RULES);
    const kpis     = aggregateRiskKPIs(enriched);
    expect(kpis.cost_at_risk_pct).toBeLessThanOrEqual(100);
  });

  test('top_identities_by_spend lista no máximo 5 identidades', () => {
    const kpis = aggregateRiskKPIs(
      enrich([makeResource()], [makeSignal({ has_approval: false })], SECURITY_RULES)
    );
    expect(kpis.top_identities_by_spend.length).toBeLessThanOrEqual(5);
  });

  test('integração com sample real: KPIs > 0 quando há sinais de risco', () => {
    const { normalizeCSV } = require('./normalizer');
    const MAPPING          = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/mapping.json'), 'utf8'));
    const awsCSV           = fs.readFileSync(path.join(__dirname, '../data/samples/aws_sample.csv'), 'utf8');
    const { records }      = normalizeCSV(awsCSV, 'aws', MAPPING);
    const signals          = parseSecuritySignals(SIGNAL_CSV, SECURITY_MAPPING);
    const enriched         = enrich(records, signals, SECURITY_RULES);
    const kpis             = aggregateRiskKPIs(enriched);

    expect(kpis.total_cost).toBeGreaterThan(0);
    expect(kpis.high_risk_resources).toBeGreaterThan(0);
    expect(kpis.cost_at_risk).toBeGreaterThan(0);
  });
});

// ─── Novos testes — gaps identificados no code review ─────────

// Gap 1: conflito de sinais — segurança é OR lógico, nunca majority
describe('calculateRiskScore — conflito de sinais', () => {
  test('public_exposure=true em qualquer sinal prevalece sobre false nos demais', () => {
    const signals = [
      makeSignal({ has_approval: true, public_exposure: true  }),
      makeSignal({ has_approval: true, public_exposure: false }),
      makeSignal({ has_approval: true, public_exposure: false }),
    ];
    const { reasons } = calculateRiskScore(makeResource(), signals, SECURITY_RULES);
    expect(reasons).toContain('public_exposure');
  });

  test('sensitive_data=true em qualquer sinal prevalece', () => {
    const signals = [
      makeSignal({ has_approval: true, sensitive_data: false }),
      makeSignal({ has_approval: true, sensitive_data: true  }),
    ];
    const { reasons } = calculateRiskScore(makeResource(), signals, SECURITY_RULES);
    expect(reasons).toContain('sensitive_data');
  });

  test('no_approval: basta um sinal com has_approval=true para remover o finding', () => {
    const signals = [
      makeSignal({ has_approval: false }),
      makeSignal({ has_approval: true  }),
    ];
    const { reasons } = calculateRiskScore(makeResource(), signals, SECURITY_RULES);
    expect(reasons).not.toContain('no_approval');
  });
});

// Gap 2: confidence no owner
describe('extractOwner — confidence', () => {
  test('ação de criação por humano retorna confidence=high', () => {
    const owner = extractOwner([makeSignal({ action: 'RunInstances', identity_id: 'arn:aws:iam::123:user/joao' })]);
    expect(owner.confidence).toBe('high');
  });

  test('ação de criação por role/terraform retorna confidence=medium', () => {
    const owner = extractOwner([makeSignal({ action: 'RunInstances', identity_id: 'arn:aws:iam::123:role/terraform-role' })]);
    expect(owner.confidence).toBe('medium');
  });

  test('sem ação de criação retorna confidence=low', () => {
    const owner = extractOwner([makeSignal({ action: 'DescribeInstances', identity_id: 'arn:aws:iam::123:user/joao' })]);
    expect(owner.confidence).toBe('low');
  });

  test('owner tem campo _note explicando a atribuição', () => {
    const owner = extractOwner([makeSignal({ action: 'RunInstances' })]);
    expect(typeof owner._note).toBe('string');
    expect(owner._note.length).toBeGreaterThan(0);
  });
});

// Gap 3: cost_at_risk é proporcional ao score
describe('buildSecurityContext — cost_at_risk proporcional', () => {
  test('score 0 → cost_at_risk 0', () => {
    const ctx = buildSecurityContext(makeResource({ billed_cost: 1000 }), [], SECURITY_RULES);
    expect(ctx.cost_at_risk).toBe(0);
  });

  test('score 10 → cost_at_risk = billed_cost integral', () => {
    // max score: no_approval(3) + public_exposure(3) + sensitive_data(2) + high_cost(2) = 10
    const resource = makeResource({ billed_cost: 1000 });
    const signals  = [makeSignal({ has_approval: false, public_exposure: true, sensitive_data: true })];
    const ctx = buildSecurityContext(resource, signals, SECURITY_RULES);
    expect(ctx.cost_at_risk).toBe(parseFloat((1000 * ctx.risk_score / 10).toFixed(2)));
  });

  test('cost_at_risk é sempre <= billed_cost', () => {
    const resource = makeResource({ billed_cost: 500 });
    const signals  = [makeSignal({ has_approval: false, public_exposure: true })];
    const ctx = buildSecurityContext(resource, signals, SECURITY_RULES);
    expect(ctx.cost_at_risk).toBeLessThanOrEqual(resource.billed_cost);
  });
});

// Gap 4: snapshot de versionamento
describe('buildSecurityContext — _snapshot', () => {
  test('_snapshot tem evaluated_at, rules_version e signal_ids', () => {
    const ctx = buildSecurityContext(makeResource(), [makeSignal()], SECURITY_RULES);
    expect(ctx._snapshot).toBeDefined();
    expect(ctx._snapshot.evaluated_at).toBeTruthy();
    expect(ctx._snapshot.rules_version).toBeTruthy();
    expect(Array.isArray(ctx._snapshot.signal_ids)).toBe(true);
  });

  test('evaluated_at é um ISO timestamp válido', () => {
    const ctx = buildSecurityContext(makeResource(), [], SECURITY_RULES);
    expect(() => new Date(ctx._snapshot.evaluated_at)).not.toThrow();
    expect(new Date(ctx._snapshot.evaluated_at).toISOString()).toBe(ctx._snapshot.evaluated_at);
  });
});

// Gap 5: enrich nunca perde registros
describe('enrich — integridade', () => {
  test('enrich nunca perde registros — output.length === input.length', () => {
    const { normalizeCSV } = require('./normalizer');
    const MAPPING = JSON.parse(require('fs').readFileSync(
      require('path').join(__dirname, '../config/mapping.json'), 'utf8'
    ));
    const awsCSV      = require('fs').readFileSync(require('path').join(__dirname, '../data/samples/aws_sample.csv'), 'utf8');
    const { records } = normalizeCSV(awsCSV, 'aws', MAPPING);
    const signals     = parseSecuritySignals(SIGNAL_CSV, SECURITY_MAPPING);
    const enriched    = enrich(records, signals, SECURITY_RULES);
    expect(enriched.length).toBe(records.length);
  });
});

// Gap 6: unattributed_cost no aggregateRiskKPIs
describe('aggregateRiskKPIs — unattributed_cost', () => {
  test('KPIs incluem unattributed_cost e unattributed_resources', () => {
    const enriched = enrich([makeResource()], [], SECURITY_RULES);
    const kpis     = aggregateRiskKPIs(enriched);
    expect(kpis).toHaveProperty('unattributed_cost');
    expect(kpis).toHaveProperty('unattributed_resources');
  });

  test('recurso sem sinais conta como não atribuído', () => {
    const enriched = enrich([makeResource({ billed_cost: 1000 })], [], SECURITY_RULES);
    const kpis     = aggregateRiskKPIs(enriched);
    expect(kpis.unattributed_cost).toBe(1000);
    expect(kpis.unattributed_resources).toBe(1);
  });

  test('recurso com owner confidence=high NÃO conta como não atribuído', () => {
    const signals  = [makeSignal({ action: 'RunInstances', identity_id: 'arn:aws:iam::123:user/joao' })];
    const enriched = enrich([makeResource({ billed_cost: 1000 })], signals, SECURITY_RULES);
    const kpis     = aggregateRiskKPIs(enriched);
    expect(kpis.unattributed_resources).toBe(0);
  });

  test('top_identities_by_spend está ordenado por custo decrescente', () => {
    const resources = [
      makeResource({ resource_id: 'r1', billed_cost: 100 }),
      makeResource({ resource_id: 'r2', billed_cost: 500 }),
      makeResource({ resource_id: 'r3', billed_cost: 300 }),
    ];
    const signals = [
      makeSignal({ resource_id: 'r1', has_approval: false, identity_name: 'alice' }),
      makeSignal({ resource_id: 'r2', has_approval: false, identity_name: 'bob' }),
      makeSignal({ resource_id: 'r3', has_approval: false, identity_name: 'alice' }),
    ];
    const kpis = aggregateRiskKPIs(enrich(resources, signals, SECURITY_RULES));
    const costs = kpis.top_identities_by_spend.map(i => i.cost_without_approval);
    for (let i = 1; i < costs.length; i++) {
      expect(costs[i]).toBeLessThanOrEqual(costs[i - 1]);
    }
  });
});
