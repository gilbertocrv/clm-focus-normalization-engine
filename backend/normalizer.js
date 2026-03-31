const { parse } = require('csv-parse/sync');

// ─── Parseia custo tolerando formato pt-BR (1.234,56) e en-US (1,234.56) ────
function parseCost(raw) {
  if (raw === null || raw === undefined || raw === '') return NaN;
  const s = String(raw).trim();

  // Detecta formato pt-BR: separador de milhar = ponto, decimal = vírgula
  // Ex: "1.234,56" → "1234.56"
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.'));
  }

  // Remove separador de milhar en-US (vírgula) se presente
  // Ex: "1,234.56" → "1234.56"
  return parseFloat(s.replace(/,/g, ''));
}

// ─── Remove BOM UTF-8 se presente (comum em exports Azure/Excel) ─────────────
function stripBOM(text) {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

// ─── Resolve categoria de serviço por palavras-chave ─────────────────────────
function resolveCategory(serviceName, keywords) {
  const s = (serviceName || '').toLowerCase();
  for (const [cat, kws] of Object.entries(keywords)) {
    if (kws.some(k => s.includes(k))) return cat;
  }
  return 'default';
}

// ─── Calcula melhor cloud por custo ──────────────────────────────────────────
function getBestCloud(serviceName, currentCost, currentProvider, pricing) {
  const cat = resolveCategory(serviceName, pricing.keywords);
  const factors = pricing.categories[cat];
  let best = null, bestCost = Infinity;

  for (const [cloud, factor] of Object.entries(factors)) {
    const c = currentCost * factor;
    if (c < bestCost) { bestCost = c; best = cloud; }
  }

  return {
    best_cloud:       best,
    optimized_cost:   parseFloat(bestCost.toFixed(2)),
    savings:          parseFloat((currentCost - bestCost).toFixed(2)),
    savings_pct:      parseFloat(((currentCost - bestCost) / currentCost * 100).toFixed(1)),
    category:         cat,
    migration_needed: best !== currentProvider,
  };
}

// ─── Normaliza CSV de um provedor para o schema comum ────────────────────────
//
// Retorna: { records: [...], skipped: [...] }
//   records → registros válidos normalizados
//   skipped → registros rejeitados com motivo (para auditoria)
//
function normalizeCSV(csvText, provider, mapping) {
  const map = mapping[provider];
  if (!map) throw new Error(`Provedor desconhecido: ${provider}`);

  const rows = parse(stripBOM(csvText), {
    columns:           true,
    skip_empty_lines:  true,
    trim:              true,
    bom:               true,
  });

  const records = [];
  const skipped = [];

  for (const row of rows) {
    const rawCost  = row[map.billed_cost];
    const cost     = parseCost(rawCost);
    const rawId    = (row[map.resource_id] || '').trim();

    // Rejeita custo inválido ou zero
    if (isNaN(cost) || cost <= 0) {
      skipped.push({ reason: 'custo_invalido', raw_cost: rawCost, row });
      continue;
    }

    // Rejeita resource_id vazio — não gera ID falso para manter auditabilidade
    if (!rawId) {
      skipped.push({ reason: 'resource_id_ausente', row });
      continue;
    }

    records.push({
      resource_id:  rawId,
      service_name: (row[map.service_name] || '').trim() || 'unknown',
      region:       (row[map.region]       || '').trim() || 'unknown',
      billed_cost:  cost,
      usage_type:   (row[map.usage_type]   || '').trim(),
      period_start: (row[map.period_start] || '').trim(),
      period_end:   (row[map.period_end]   || '').trim(),
      provider,
      _native: row,
    });
  }

  return { records, skipped };
}

module.exports = { parseCost, stripBOM, resolveCategory, getBestCloud, normalizeCSV };
