const path = require('path');
const fs   = require('fs');

const { parseCost, stripBOM, resolveCategory, getBestCloud, normalizeCSV } = require('./normalizer');

const MAPPING = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/mapping.json'), 'utf8'));
const PRICING = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/pricing.json'), 'utf8'));

// ─── parseCost ────────────────────────────────────────────────
describe('parseCost', () => {
  test('formato en-US padrão', () => {
    expect(parseCost('4200.00')).toBe(4200);
  });

  test('formato pt-BR com vírgula decimal', () => {
    expect(parseCost('1.234,56')).toBe(1234.56);
  });

  test('formato en-US com separador de milhar', () => {
    expect(parseCost('1,234.56')).toBe(1234.56);
  });

  test('valor inteiro sem decimais', () => {
    expect(parseCost('500')).toBe(500);
  });

  test('string vazia retorna NaN', () => {
    expect(parseCost('')).toBeNaN();
  });

  test('null retorna NaN', () => {
    expect(parseCost(null)).toBeNaN();
  });

  test('texto não numérico retorna NaN', () => {
    expect(parseCost('N/A')).toBeNaN();
  });
});

// ─── stripBOM ─────────────────────────────────────────────────
describe('stripBOM', () => {
  test('remove BOM UTF-8 do início', () => {
    const withBOM = '\uFEFFResourceId,Cost\nvm-01,100';
    expect(stripBOM(withBOM).charCodeAt(0)).not.toBe(0xFEFF);
    expect(stripBOM(withBOM)).toBe('ResourceId,Cost\nvm-01,100');
  });

  test('texto sem BOM não é alterado', () => {
    const noBOM = 'ResourceId,Cost\nvm-01,100';
    expect(stripBOM(noBOM)).toBe(noBOM);
  });
});

// ─── resolveCategory ──────────────────────────────────────────
describe('resolveCategory', () => {
  test('detecta compute a partir de "Amazon EC2"', () => {
    expect(resolveCategory('Amazon EC2', PRICING.keywords)).toBe('compute');
  });

  test('detecta database a partir de "Amazon RDS"', () => {
    expect(resolveCategory('Amazon RDS', PRICING.keywords)).toBe('database');
  });

  test('detecta serverless a partir de "AWS Lambda"', () => {
    expect(resolveCategory('AWS Lambda', PRICING.keywords)).toBe('serverless');
  });

  test('detecta analytics a partir de "BigQuery"', () => {
    expect(resolveCategory('BigQuery', PRICING.keywords)).toBe('analytics');
  });

  test('fallback para "default" em serviço desconhecido', () => {
    expect(resolveCategory('Serviço Misterioso XYZ', PRICING.keywords)).toBe('default');
  });

  test('case-insensitive', () => {
    expect(resolveCategory('COMPUTE ENGINE', PRICING.keywords)).toBe('compute');
  });
});

// ─── normalizeCSV — mapeamento AWS ────────────────────────────
describe('normalizeCSV — AWS', () => {
  const awsCSV = fs.readFileSync(path.join(__dirname, '../data/samples/aws_sample.csv'), 'utf8');

  test('processa todos os registros válidos do sample', () => {
    const { records, skipped } = normalizeCSV(awsCSV, 'aws', MAPPING);
    expect(records.length).toBe(12);
    expect(skipped.length).toBe(0);
  });

  test('campos obrigatórios presentes em todos os registros', () => {
    const { records } = normalizeCSV(awsCSV, 'aws', MAPPING);
    for (const r of records) {
      expect(r.resource_id).toBeTruthy();
      expect(r.service_name).toBeTruthy();
      expect(r.region).toBeTruthy();
      expect(typeof r.billed_cost).toBe('number');
      expect(r.billed_cost).toBeGreaterThan(0);
    }
  });

  test('dados nativos preservados em _native', () => {
    const { records } = normalizeCSV(awsCSV, 'aws', MAPPING);
    const first = records[0];
    expect(first._native).toBeDefined();
    expect(first._native['line_item_resource_id']).toBeTruthy();
    expect(first._native['line_item_unblended_cost']).toBeTruthy();
  });

  test('provider correto em todos os registros', () => {
    const { records } = normalizeCSV(awsCSV, 'aws', MAPPING);
    expect(records.every(r => r.provider === 'aws')).toBe(true);
  });
});

// ─── normalizeCSV — GCP ───────────────────────────────────────
describe('normalizeCSV — GCP', () => {
  const gcpCSV = fs.readFileSync(path.join(__dirname, '../data/samples/gcp_sample.csv'), 'utf8');

  test('processa todos os registros do sample GCP', () => {
    const { records } = normalizeCSV(gcpCSV, 'gcp', MAPPING);
    expect(records.length).toBe(10);
  });

  test('campo resource.name com ponto no nome é mapeado corretamente', () => {
    const { records } = normalizeCSV(gcpCSV, 'gcp', MAPPING);
    expect(records[0].resource_id).toContain('compute.googleapis.com');
  });
});

// ─── normalizeCSV — Azure ─────────────────────────────────────
describe('normalizeCSV — Azure', () => {
  const azureCSV = fs.readFileSync(path.join(__dirname, '../data/samples/azure_sample.csv'), 'utf8');

  test('processa todos os registros do sample Azure', () => {
    const { records } = normalizeCSV(azureCSV, 'azure', MAPPING);
    expect(records.length).toBe(10);
  });

  test('remove BOM se presente (simulado)', () => {
    const withBOM = '\uFEFF' + azureCSV;
    const { records } = normalizeCSV(withBOM, 'azure', MAPPING);
    expect(records.length).toBe(10);
  });
});

// ─── normalizeCSV — OCI ───────────────────────────────────────
describe('normalizeCSV — OCI', () => {
  const ociCSV = fs.readFileSync(path.join(__dirname, '../data/samples/oci_sample.csv'), 'utf8');

  test('processa todos os registros do sample OCI', () => {
    const { records } = normalizeCSV(ociCSV, 'oci', MAPPING);
    expect(records.length).toBe(9);
  });
});

// ─── normalizeCSV — rejeições auditáveis ─────────────────────
describe('normalizeCSV — rejeições', () => {
  test('rejeita registro com custo zero', () => {
    const csv = 'line_item_resource_id,product_product_name,product_region,line_item_unblended_cost\nvm-01,Amazon EC2,us-east-1,0.00';
    const { records, skipped } = normalizeCSV(csv, 'aws', MAPPING);
    expect(records.length).toBe(0);
    expect(skipped.length).toBe(1);
    expect(skipped[0].reason).toBe('custo_invalido');
  });

  test('rejeita registro com custo não numérico', () => {
    const csv = 'line_item_resource_id,product_product_name,product_region,line_item_unblended_cost\nvm-01,Amazon EC2,us-east-1,N/A';
    const { records, skipped } = normalizeCSV(csv, 'aws', MAPPING);
    expect(records.length).toBe(0);
    expect(skipped[0].reason).toBe('custo_invalido');
  });

  test('rejeita registro com resource_id vazio — não gera ID falso', () => {
    const csv = 'line_item_resource_id,product_product_name,product_region,line_item_unblended_cost\n,Amazon EC2,us-east-1,100.00';
    const { records, skipped } = normalizeCSV(csv, 'aws', MAPPING);
    expect(records.length).toBe(0);
    expect(skipped[0].reason).toBe('resource_id_ausente');
  });

  test('aceita custo no formato pt-BR', () => {
    const csv = 'line_item_resource_id,product_product_name,product_region,line_item_unblended_cost\nvm-01,Amazon EC2,us-east-1,"1.234,56"';
    const { records } = normalizeCSV(csv, 'aws', MAPPING);
    expect(records.length).toBe(1);
    expect(records[0].billed_cost).toBe(1234.56);
  });

  test('provider desconhecido lança erro descritivo', () => {
    expect(() => normalizeCSV('a,b\n1,2', 'provedor-fake', MAPPING))
      .toThrow('Provedor desconhecido: provedor-fake');
  });
});

// ─── getBestCloud ─────────────────────────────────────────────
describe('getBestCloud', () => {
  test('retorna estrutura completa', () => {
    const result = getBestCloud('Amazon EC2', 1000, 'aws', PRICING);
    expect(result).toHaveProperty('best_cloud');
    expect(result).toHaveProperty('optimized_cost');
    expect(result).toHaveProperty('savings');
    expect(result).toHaveProperty('savings_pct');
    expect(result).toHaveProperty('category');
    expect(result).toHaveProperty('migration_needed');
  });

  test('custo otimizado nunca é maior que o custo original', () => {
    const services = ['Amazon EC2', 'Amazon RDS', 'AWS Lambda', 'BigQuery', 'serviço desconhecido'];
    for (const svc of services) {
      const result = getBestCloud(svc, 1000, 'aws', PRICING);
      expect(result.optimized_cost).toBeLessThanOrEqual(1000);
    }
  });

  test('migration_needed = false quando já está na melhor cloud', () => {
    // Serverless: AWS vence com fator 0.90
    const result = getBestCloud('AWS Lambda', 1000, 'aws', PRICING);
    expect(result.best_cloud).toBe('aws');
    expect(result.migration_needed).toBe(false);
  });

  test('savings = custo_original - custo_otimizado', () => {
    const result = getBestCloud('Amazon EC2', 1000, 'aws', PRICING);
    expect(result.savings).toBeCloseTo(1000 - result.optimized_cost, 2);
  });
});
