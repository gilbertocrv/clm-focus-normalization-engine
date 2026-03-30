const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const fs = require('fs');
const path = require('path');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/samples', express.static(path.join(__dirname, '../data/samples')));

// ─── Carrega configs ──────────────────────────────────────────
const MAPPING  = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/mapping.json'), 'utf8'));
const PRICING  = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/pricing.json'), 'utf8'));

// ─── Utilitários ──────────────────────────────────────────────

function resolveCategory(serviceName) {
  const s = (serviceName || '').toLowerCase();
  for (const [cat, keywords] of Object.entries(PRICING.keywords)) {
    if (keywords.some(k => s.includes(k))) return cat;
  }
  return 'default';
}

function getBestCloud(serviceName, currentCost, currentProvider) {
  const cat = resolveCategory(serviceName);
  const factors = PRICING.categories[cat];
  let best = null, bestCost = Infinity;

  for (const [cloud, factor] of Object.entries(factors)) {
    const c = currentCost * factor;
    if (c < bestCost) { bestCost = c; best = cloud; }
  }

  return {
    best_cloud:      best,
    optimized_cost:  parseFloat(bestCost.toFixed(2)),
    savings:         parseFloat((currentCost - bestCost).toFixed(2)),
    savings_pct:     parseFloat(((currentCost - bestCost) / currentCost * 100).toFixed(1)),
    category:        cat,
    migration_needed: best !== currentProvider
  };
}

// ─── Normaliza CSV de qualquer provedor ───────────────────────

function normalizeCSV(csvText, provider) {
  const map = MAPPING[provider];
  if (!map) throw new Error(`Provedor desconhecido: ${provider}`);

  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  return records
    .map(row => {
      const cost = parseFloat(row[map.billed_cost]) || 0;
      if (cost <= 0) return null;

      return {
        // Schema comum
        resource_id:  row[map.resource_id]  || `res-${Math.random().toString(36).substr(2,8)}`,
        service_name: row[map.service_name] || 'unknown',
        region:       row[map.region]       || 'unknown',
        billed_cost:  cost,
        usage_type:   row[map.usage_type]   || '',
        period_start: row[map.period_start] || '',
        period_end:   row[map.period_end]   || '',
        provider:     provider,
        // Dados nativos preservados para a aba específica
        _native: row
      };
    })
    .filter(Boolean);
}

// ─── Rota: parse + análise de CSV ────────────────────────────

app.post('/api/analyze', upload.single('file'), (req, res) => {
  try {
    const provider = req.body.provider;
    if (!provider) return res.status(400).json({ error: 'Campo provider obrigatório' });

    let csvText;
    if (req.file) {
      csvText = req.file.buffer.toString('utf8');
    } else if (req.body.csv) {
      csvText = req.body.csv;
    } else {
      return res.status(400).json({ error: 'Envie um arquivo CSV ou o campo csv no body' });
    }

    const records = normalizeCSV(csvText, provider);
    const analyzed = records.map(item => {
      const arb = getBestCloud(item.service_name, item.billed_cost, item.provider);
      return { ...item, arbitrage: arb };
    });

    const total_cost     = analyzed.reduce((s, r) => s + r.billed_cost, 0);
    const total_savings  = analyzed.reduce((s, r) => s + r.arbitrage.savings, 0);
    const migrations     = analyzed.filter(r => r.arbitrage.migration_needed).length;

    res.json({
      provider,
      summary: {
        total_records:   analyzed.length,
        total_cost:      parseFloat(total_cost.toFixed(2)),
        total_savings:   parseFloat(total_savings.toFixed(2)),
        savings_pct:     parseFloat((total_savings / total_cost * 100).toFixed(1)),
        migrations_suggested: migrations
      },
      records: analyzed
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Rota: análise multi-provedor (vários CSVs de uma vez) ───

app.post('/api/analyze/multi', upload.array('files'), (req, res) => {
  try {
    const providers = JSON.parse(req.body.providers || '[]');
    if (!req.files || req.files.length !== providers.length) {
      return res.status(400).json({ error: 'Número de arquivos e providers deve ser igual' });
    }

    const allRecords = [];

    for (let i = 0; i < req.files.length; i++) {
      const csvText = req.files[i].buffer.toString('utf8');
      const provider = providers[i];
      const records = normalizeCSV(csvText, provider);
      allRecords.push(...records);
    }

    const analyzed = allRecords.map(item => {
      const arb = getBestCloud(item.service_name, item.billed_cost, item.provider);
      return { ...item, arbitrage: arb };
    });

    const total_cost    = analyzed.reduce((s, r) => s + r.billed_cost, 0);
    const total_savings = analyzed.reduce((s, r) => s + r.arbitrage.savings, 0);

    // Agrupado por provedor
    const by_provider = {};
    for (const r of analyzed) {
      if (!by_provider[r.provider]) by_provider[r.provider] = { records: [], cost: 0, savings: 0 };
      by_provider[r.provider].records.push(r);
      by_provider[r.provider].cost    += r.billed_cost;
      by_provider[r.provider].savings += r.arbitrage.savings;
    }

    res.json({
      summary: {
        total_records:        analyzed.length,
        total_cost:           parseFloat(total_cost.toFixed(2)),
        total_savings:        parseFloat(total_savings.toFixed(2)),
        savings_pct:          parseFloat((total_savings / total_cost * 100).toFixed(1)),
        migrations_suggested: analyzed.filter(r => r.arbitrage.migration_needed).length,
        providers_loaded:     Object.keys(by_provider)
      },
      by_provider,
      all_records: analyzed
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Rota: retorna o mapping config ──────────────────────────

app.get('/api/config/mapping', (req, res) => res.json(MAPPING));
app.get('/api/config/pricing', (req, res) => res.json(PRICING));

// ─── Rota: lista provedores suportados ───────────────────────

app.get('/api/providers', (req, res) => {
  const providers = Object.keys(MAPPING).filter(k => !k.startsWith('_'));
  res.json(providers.map(p => ({
    id: p,
    label: p.toUpperCase(),
    source: MAPPING[p]._source,
    docs:   MAPPING[p]._docs
  })));
});

// ─── Rota: health check ───────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() });
});

// ─── Start ────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`CLM + FOCUS backend rodando em http://localhost:${PORT}`);
  console.log(`Provedores suportados: ${Object.keys(MAPPING).filter(k => !k.startsWith('_')).join(', ')}`);
});
