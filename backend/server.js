const express = require('express');
const cors    = require('cors');
const multer  = require('multer');
const fs      = require('fs');
const path    = require('path');

const { normalizeCSV, getBestCloud } = require('./normalizer');
const { parseSecuritySignals, enrich, aggregateRiskKPIs } = require('./services/enricher');

// ─── Config ───────────────────────────────────────────────────
const MAPPING          = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/mapping.json'), 'utf8'));
const PRICING          = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/pricing.json'), 'utf8'));
const SECURITY_MAPPING = JSON.parse(fs.readFileSync(path.join(__dirname, '../security/mapping.security.json'), 'utf8'));
const SECURITY_RULES   = JSON.parse(fs.readFileSync(path.join(__dirname, '../security/rules.json'), 'utf8'));

const VALID_PROVIDERS = new Set(Object.keys(MAPPING).filter(k => !k.startsWith('_')));

// ─── App ──────────────────────────────────────────────────────
const app = express();

const corsOptions = {
  origin:  process.env.ALLOWED_ORIGIN || '*',
  methods: ['GET', 'POST'],
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/samples', express.static(path.join(__dirname, '../data/samples')));

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 50 * 1024 * 1024 },
});

// ─── Helpers ──────────────────────────────────────────────────

function analyzeRecords(records) {
  return records.map(item => ({
    ...item,
    arbitrage: getBestCloud(item.service_name, item.billed_cost, item.provider, PRICING),
  }));
}

function summarize(analyzed) {
  const total_cost    = analyzed.reduce((s, r) => s + r.billed_cost, 0);
  const total_savings = analyzed.reduce((s, r) => s + r.arbitrage.savings, 0);
  return {
    total_records:        analyzed.length,
    total_cost:           parseFloat(total_cost.toFixed(2)),
    total_savings:        parseFloat(total_savings.toFixed(2)),
    savings_pct:          total_cost > 0
                            ? parseFloat((total_savings / total_cost * 100).toFixed(1))
                            : 0,
    migrations_suggested: analyzed.filter(r => r.arbitrage.migration_needed).length,
  };
}

function handleError(res, err) {
  const isKnown = err.message.startsWith('Provedor desconhecido') ||
                  err.message.startsWith('CSV inválido');
  const status  = isKnown ? 400 : 500;
  const message = isKnown ? err.message : 'Erro interno ao processar o arquivo';
  if (!isKnown) console.error('[CLM-FOCUS]', err);
  res.status(status).json({ error: message });
}

// ─── POST /api/analyze — billing único ───────────────────────
app.post('/api/analyze', upload.single('file'), (req, res) => {
  try {
    const provider = (req.body.provider || '').trim().toLowerCase();

    if (!provider)
      return res.status(400).json({ error: 'Campo provider obrigatório' });

    if (!VALID_PROVIDERS.has(provider))
      return res.status(400).json({
        error: `Provedor inválido: "${provider}". Válidos: ${[...VALID_PROVIDERS].join(', ')}`,
      });

    let csvText;
    if (req.file)          csvText = req.file.buffer.toString('utf8');
    else if (req.body.csv) csvText = req.body.csv;
    else return res.status(400).json({ error: 'Envie um arquivo CSV ou o campo csv no body' });

    const { records, skipped } = normalizeCSV(csvText, provider, MAPPING);
    const analyzed = analyzeRecords(records);

    res.json({
      provider,
      summary:  { ...summarize(analyzed), skipped_count: skipped.length },
      records:  analyzed,
      skipped,
    });

  } catch (err) { handleError(res, err); }
});

// ─── POST /api/analyze/multi — billing multi-provedor ────────
app.post('/api/analyze/multi', upload.array('files'), (req, res) => {
  try {
    let providers;
    try {
      providers = JSON.parse(req.body.providers || '[]');
    } catch {
      return res.status(400).json({ error: 'Campo providers deve ser um JSON array válido' });
    }

    if (!Array.isArray(providers) || providers.length === 0)
      return res.status(400).json({ error: 'providers deve ser um array não-vazio' });

    if (!req.files || req.files.length !== providers.length)
      return res.status(400).json({ error: 'Número de arquivos e providers deve ser igual' });

    const invalid = providers.filter(p => !VALID_PROVIDERS.has(p));
    if (invalid.length)
      return res.status(400).json({
        error: `Providers inválidos: ${invalid.join(', ')}. Válidos: ${[...VALID_PROVIDERS].join(', ')}`,
      });

    const allRecords = [];
    const allSkipped = [];

    for (let i = 0; i < req.files.length; i++) {
      const csvText  = req.files[i].buffer.toString('utf8');
      const provider = providers[i];
      const { records, skipped } = normalizeCSV(csvText, provider, MAPPING);
      allRecords.push(...records);
      allSkipped.push(...skipped.map(s => ({ ...s, provider })));
    }

    const analyzed   = analyzeRecords(allRecords);
    const by_provider = {};
    for (const r of analyzed) {
      if (!by_provider[r.provider])
        by_provider[r.provider] = { records: [], cost: 0, savings: 0 };
      by_provider[r.provider].records.push(r);
      by_provider[r.provider].cost    += r.billed_cost;
      by_provider[r.provider].savings += r.arbitrage.savings;
    }

    res.json({
      summary: { ...summarize(analyzed), skipped_count: allSkipped.length, providers_loaded: Object.keys(by_provider) },
      by_provider,
      all_records: analyzed,
      skipped:     allSkipped,
    });

  } catch (err) { handleError(res, err); }
});

// ─── POST /api/enrich — correlação billing + segurança ───────
//
// Recebe:
//   - billing_csv   (campo ou arquivo) + provider
//   - security_csv  (campo ou arquivo) — formato genérico
//
// Retorna: recursos enriquecidos com security_context + KPIs de risco
//
app.post('/api/enrich', upload.fields([
  { name: 'billing_file',  maxCount: 1 },
  { name: 'security_file', maxCount: 1 },
]), (req, res) => {
  try {
    const provider = (req.body.provider || '').trim().toLowerCase();

    if (!provider)
      return res.status(400).json({ error: 'Campo provider obrigatório' });

    if (!VALID_PROVIDERS.has(provider))
      return res.status(400).json({
        error: `Provedor inválido: "${provider}". Válidos: ${[...VALID_PROVIDERS].join(', ')}`,
      });

    // Billing CSV
    let billingCSV;
    if (req.files?.billing_file?.[0]) billingCSV = req.files.billing_file[0].buffer.toString('utf8');
    else if (req.body.billing_csv)    billingCSV = req.body.billing_csv;
    else return res.status(400).json({ error: 'billing_file ou billing_csv obrigatório' });

    // Security CSV
    let securityCSV;
    if (req.files?.security_file?.[0]) securityCSV = req.files.security_file[0].buffer.toString('utf8');
    else if (req.body.security_csv)    securityCSV = req.body.security_csv;
    else return res.status(400).json({ error: 'security_file ou security_csv obrigatório' });

    // Normaliza billing
    const { records: billingRecords, skipped } = normalizeCSV(billingCSV, provider, MAPPING);
    const analyzed = analyzeRecords(billingRecords);

    // Parseia sinais de segurança
    const signals = parseSecuritySignals(securityCSV, SECURITY_MAPPING);

    // Join semântico por resource_id
    const enriched = enrich(analyzed, signals, SECURITY_RULES);

    // KPIs derivados
    const risk_kpis = aggregateRiskKPIs(enriched);

    res.json({
      provider,
      summary: {
        ...summarize(analyzed),
        skipped_count:  skipped.length,
        signals_loaded: signals.length,
        ...risk_kpis,
      },
      records: enriched,
      skipped,
    });

  } catch (err) { handleError(res, err); }
});

// ─── Rotas de config e utilitários ────────────────────────────
app.get('/api/config/mapping',          (_req, res) => res.json(MAPPING));
app.get('/api/config/pricing',          (_req, res) => res.json(PRICING));
app.get('/api/config/security-mapping', (_req, res) => res.json(SECURITY_MAPPING));
app.get('/api/config/security-rules',   (_req, res) => res.json(SECURITY_RULES));

app.get('/api/providers', (_req, res) => {
  res.json([...VALID_PROVIDERS].map(p => ({
    id:     p,
    label:  p.toUpperCase(),
    source: MAPPING[p]._source,
    docs:   MAPPING[p]._docs,
  })));
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '2.0.0', timestamp: new Date().toISOString() });
});

// ─── Start ────────────────────────────────────────────────────
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`CLM + FOCUS v2 rodando em http://localhost:${PORT}`);
    console.log(`Provedores: ${[...VALID_PROVIDERS].join(', ')}`);
  });
}

module.exports = app;
