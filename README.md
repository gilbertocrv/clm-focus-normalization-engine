# clm-focus-normalization-engine

Engine de normalização de dados de billing multicloud (AWS, GCP, Azure, OCI) com schema auditável derivado das documentações oficiais de cada provedor.

---

## O problema

AWS, GCP, Azure e OCI expõem estruturas de billing completamente diferentes — nomenclaturas, granularidades e formatos de campo distintos. Sem normalização, qualquer análise comparativa opera sobre dados inconsistentes.

## O que este projeto faz

Ingere CSV de billing de qualquer provedor suportado, aplica um mapeamento declarativo (`config/mapping.json`) e produz um schema comum. Os dados originais são preservados integralmente no campo `_native` de cada registro — nada é descartado.

Registros rejeitados (custo inválido, `resource_id` ausente) ficam num campo `skipped` separado com o motivo, para auditoria.

---

## Exemplo

**Input** — CSV nativo AWS (`line_item_resource_id`, `line_item_unblended_cost`, ...):

```
line_item_resource_id,product_product_name,product_region,line_item_unblended_cost
i-0a1b2c3d4e5f,Amazon EC2,us-east-1,4200.00
```

**Output** — schema normalizado:

```json
{
  "resource_id":  "i-0a1b2c3d4e5f",
  "service_name": "Amazon EC2",
  "region":       "us-east-1",
  "billed_cost":  4200.00,
  "provider":     "aws",
  "_native": {
    "line_item_resource_id":      "i-0a1b2c3d4e5f",
    "product_product_name":       "Amazon EC2",
    "product_region":             "us-east-1",
    "line_item_unblended_cost":   "4200.00"
  },
  "arbitrage": {
    "best_cloud":       "oci",
    "optimized_cost":   3150.00,
    "savings":          1050.00,
    "savings_pct":      25.0,
    "category":         "compute",
    "migration_needed": true
  }
}
```

---

## Estrutura

```
backend/
  server.js            API Express (rotas, validação, error handling)
  normalizer.js        Lógica de normalização — importável e testável em isolamento
  normalizer.test.js   33 testes (Jest)
config/
  mapping.json         De/para entre campos nativos e schema comum
  pricing.json         Fatores de arbitragem por categoria de serviço
data/samples/
  aws_sample.csv       CSV de exemplo com campos nativos reais AWS
  gcp_sample.csv       CSV de exemplo GCP
  azure_sample.csv     CSV de exemplo Azure
  oci_sample.csv       CSV de exemplo OCI
frontend/
  index.html           Dashboard com abas por provedor
docs/
  INTEGRATION.md       Documentação de API, mapeamentos e instruções de ingestão
```

---

## Como rodar

```bash
git clone https://github.com/gilbertocrv/clm-focus-normalization-engine.git
cd clm-focus-normalization-engine/backend
npm install
node server.js
```

Acesse `http://localhost:3000`. O backend serve o frontend automaticamente.

**Testes:**
```bash
npm test
```

---

## Provedores suportados

| Provedor | Fonte de billing | Documentação |
|----------|-----------------|--------------|
| AWS      | Cost and Usage Report (CUR) via S3 + Athena | [docs.aws.amazon.com/cur](https://docs.aws.amazon.com/cur/latest/userguide/what-is-cur.html) |
| GCP      | BigQuery Billing Export | [cloud.google.com/billing/docs](https://cloud.google.com/billing/docs/how-to/export-data-bigquery) |
| Azure    | Cost Management Export (CSV) | [learn.microsoft.com](https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/tutorial-export-acm-data) |
| OCI      | Usage Reports (Object Storage) | [docs.oracle.com](https://docs.oracle.com/en-us/iaas/Content/Billing/Concepts/usagereports.htm) |

---

## Adicionar um novo provedor

Edite `config/mapping.json` e adicione um bloco:

```json
{
  "meu-provedor": {
    "_source": "Portal de faturamento interno",
    "_docs":   "https://meu-provedor.com/billing/docs",
    "resource_id":  "id_recurso",
    "service_name": "nome_servico",
    "region":       "regiao",
    "billed_cost":  "valor_cobrado"
  }
}
```

Nenhuma alteração de código necessária. O novo provedor é reconhecido automaticamente na próxima requisição.

---

## API

`POST /api/analyze` — normaliza e analisa um CSV

```bash
curl -X POST http://localhost:3000/api/analyze \
  -F "provider=aws" \
  -F "file=@data/samples/aws_sample.csv"
```

`POST /api/analyze/multi` — múltiplos provedores em paralelo

`GET /api/providers` — lista provedores suportados

`GET /api/config/mapping` — retorna o mapeamento ativo

Documentação completa em `docs/INTEGRATION.md`.

---

## Escopo

Este é um MVP de normalização de dados. Não inclui automação de decisão, integração com APIs de pricing em tempo real, nem camada de governança avançada. O `pricing.json` usa fatores relativos estáticos — adequados para validação de estrutura, não para decisão financeira real.

---

## Licença

MIT — Gilberto Gonçalves dos Santos Filho
