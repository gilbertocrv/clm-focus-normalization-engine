# CLM + FOCUS — Documentação de Integração

## Visão Geral

Sistema de governança e arbitragem multicloud que preserva os schemas nativos de cada provedor e usa um de/para configurável para comparação cross-cloud.

**Arquitetura resumida:**
```
Fatura nativa (AWS CUR / GCP Billing / Azure Cost / OCI Usage)
        ↓
  Raw store (dados preservados)
        ↓
  De/para engine (config/mapping.json)
        ↓
  Schema comum → Arbitragem → Recomendações
        ↓
  Frontend com abas: [Visão Geral] [AWS] [GCP] [Azure] [OCI]
```

---

## Estrutura de Arquivos

```
clm-focus/
├── backend/
│   ├── server.js          ← API Node.js (Express)
│   └── package.json
├── config/
│   ├── mapping.json       ← De/para por provedor
│   └── pricing.json       ← Fatores de custo por categoria
├── data/
│   └── samples/
│       ├── aws_sample.csv
│       ├── gcp_sample.csv
│       ├── azure_sample.csv
│       └── oci_sample.csv
├── frontend/
│   └── index.html         ← Dashboard completo
└── docs/
    └── INTEGRATION.md     ← Este arquivo
```

---

## Como Rodar

### 1. Instalar dependências do backend

```bash
cd backend
npm install
```

### 2. Iniciar o servidor

```bash
node server.js
# ou, para desenvolvimento com reload automático:
npx nodemon server.js
```

O servidor sobe em `http://localhost:3000`.

### 3. Acessar o frontend

Abra `http://localhost:3000` no navegador.  
O backend serve o frontend automaticamente pela pasta `/frontend`.

---

## API — Endpoints

### `POST /api/analyze`

Analisa um CSV de um provedor específico.

**Form-data:**
| Campo    | Tipo   | Descrição                              |
|----------|--------|----------------------------------------|
| `file`   | File   | Arquivo CSV                            |
| `csv`    | String | Texto CSV (alternativa ao file)        |
| `provider` | String | `aws`, `gcp`, `azure` ou `oci`       |

**Resposta:**
```json
{
  "provider": "aws",
  "summary": {
    "total_records": 12,
    "total_cost": 18015.00,
    "total_savings": 3240.50,
    "savings_pct": 18.0,
    "migrations_suggested": 7
  },
  "records": [
    {
      "resource_id": "i-0a1b2c3d4e5f",
      "service_name": "Amazon EC2",
      "region": "us-east-1",
      "billed_cost": 4200.00,
      "provider": "aws",
      "_native": { /* todos os campos originais do CSV */ },
      "arbitrage": {
        "best_cloud": "oci",
        "optimized_cost": 3150.00,
        "savings": 1050.00,
        "savings_pct": 25.0,
        "category": "compute",
        "migration_needed": true
      }
    }
  ]
}
```

---

### `POST /api/analyze/multi`

Analisa múltiplos provedores de uma vez.

**Form-data:**
| Campo      | Tipo     | Descrição                          |
|------------|----------|------------------------------------|
| `files`    | File[]   | Array de CSVs                      |
| `providers`| JSON str | `["aws","gcp"]` (mesma ordem)      |

---

### `GET /api/providers`

Lista provedores suportados com fonte e link de documentação.

```json
[
  {
    "id": "aws",
    "label": "AWS",
    "source": "Cost and Usage Report (CUR) via S3 + Athena",
    "docs": "https://docs.aws.amazon.com/cur/..."
  }
]
```

---

### `GET /api/config/mapping`

Retorna o arquivo de mapeamento completo.

### `GET /api/config/pricing`

Retorna os fatores de pricing por categoria.

---

## Configuração do De/Para (`config/mapping.json`)

Cada provedor tem um bloco com:
- `_source` — onde extrair os dados
- `_docs` — link para documentação oficial
- Campos do schema comum → nome do campo nativo

```json
{
  "aws": {
    "_source": "Cost and Usage Report (CUR) via S3 + Athena",
    "_docs": "https://docs.aws.amazon.com/cur/...",
    "resource_id":  "line_item_resource_id",
    "service_name": "product_product_name",
    "region":       "product_region",
    "billed_cost":  "line_item_unblended_cost",
    ...
  }
}
```

### Adicionar um novo provedor

1. Abra `config/mapping.json`
2. Adicione um bloco com o ID do novo provedor
3. Mapeie os campos conforme a documentação da fatura
4. Reinicie o backend

Exemplo para um provedor hipotético:
```json
{
  "meu-provedor": {
    "_source": "Portal de faturamento interno",
    "_docs": "https://meu-provedor.com/billing/docs",
    "resource_id":  "id_recurso",
    "service_name": "nome_servico",
    "region":       "regiao",
    "billed_cost":  "valor_cobrado"
  }
}
```

---

## Configuração do Pricing (`config/pricing.json`)

Fatores multiplicadores relativos por categoria de serviço.  
**Em produção, substituir por integração com as APIs reais:**

| Provedor | API de Pricing |
|----------|---------------|
| AWS      | `pricing.getProducts()` via SDK |
| Azure    | `https://prices.azure.com/api/retail/prices` |
| GCP      | `services.skus.list` — Billing Catalog API |
| OCI      | Rate Card ou contrato interno |

---

## Extração de Dados em Produção

### AWS — Cost and Usage Report (CUR)

1. No console AWS, acesse **Billing → Cost and Usage Reports**
2. Crie um report com as colunas necessárias
3. Configure entrega no S3
4. Use Athena para query e export em CSV

**Colunas obrigatórias:**
- `line_item_resource_id`
- `product_product_name`
- `product_region`
- `line_item_unblended_cost`

### GCP — BigQuery Billing Export

1. No console GCP, acesse **Billing → Billing Export**
2. Habilite export para BigQuery
3. Query via BigQuery e export em CSV

**Query de exemplo:**
```sql
SELECT
  resource.name,
  service.description,
  location.region,
  cost,
  sku.description,
  usage_start_time,
  usage_end_time
FROM `project.dataset.gcp_billing_export`
WHERE DATE(usage_start_time) BETWEEN '2024-03-01' AND '2024-03-31'
```

### Azure — Cost Management Export

1. No portal Azure, acesse **Cost Management + Billing**
2. Em **Exports**, crie um export agendado
3. O CSV é entregue em Storage Account

**Colunas obrigatórias:**
- `ResourceId`
- `MeterCategory`
- `ResourceLocation`
- `CostInBillingCurrency`

### OCI — Usage Reports

1. Acesse **Billing → Cost and Usage Reports** no console OCI
2. Os reports são entregues automaticamente em Object Storage
3. Faça download e use como entrada

---

## Schema Comum

Os seguintes campos são comuns entre todos os provedores após o de/para:

| Campo          | Tipo   | Descrição                              |
|----------------|--------|----------------------------------------|
| `resource_id`  | string | Identificador único do recurso         |
| `service_name` | string | Nome do serviço                        |
| `region`       | string | Região geográfica                      |
| `billed_cost`  | float  | Custo faturado no período              |
| `usage_type`   | string | Tipo de uso (opcional)                 |
| `period_start` | string | Início do período de faturamento       |
| `period_end`   | string | Fim do período de faturamento          |
| `provider`     | string | Provedor de origem                     |
| `_native`      | object | Todos os campos nativos originais      |

---

## Categorias de Serviço (Arbitragem)

A categoria é detectada automaticamente pelo nome do serviço:

| Categoria    | Palavras-chave detectadas                              |
|--------------|--------------------------------------------------------|
| `compute`    | compute, vm, instance, ec2, virtual machine            |
| `storage`    | storage, s3, blob, gcs, object store, disk             |
| `database`   | sql, database, rds, cosmos, datastore, spanner         |
| `networking` | network, egress, load balancer, cdn, vpn, firewall     |
| `ml`         | ml, ai, vertex, sagemaker, machine learning            |
| `container`  | container, kubernetes, gke, aks, eks, docker           |
| `serverless` | function, lambda, cloud run, serverless                |
| `analytics`  | analytics, bigquery, redshift, synapse, dataflow       |
| `default`    | fallback para serviços não classificados               |

---

## Próximos Passos Recomendados

1. **Substituir fatores de pricing** por chamadas às APIs reais de cada provedor
2. **Adicionar autenticação** (JWT ou OAuth) no backend
3. **Persistir histórico** em banco de dados (PostgreSQL recomendado)
4. **Agendar ingestão** automática via cron job ou event trigger
5. **Adicionar alertas** de anomalia por threshold de custo
6. **Criar pipeline de CI/CD** para deploy contínuo
7. **Expandir de/para** para campos adicionais conforme necessidade da organização
