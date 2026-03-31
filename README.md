# ☁️ Multicloud Billing Normalization Engine (CLM + FOCUS)

![License](https://img.shields.io/badge/license-MIT-green)
![Node.js](https://img.shields.io/badge/node.js-v18+-blue)
![Focus](https://img.shields.io/badge/FOCUS-Aligned-orange)

Sistema de **normalização de dados de faturamento multicloud**, com suporte a **AWS, GCP, Azure e OCI**, estendido com uma **camada de correlação entre identidade, risco e custo**.

O objetivo é transformar dados financeiros heterogêneos em um **schema comum auditável**, enriquecido com contexto de segurança, permitindo responder:

> **"Qual é o impacto financeiro dos riscos de segurança?"**

---

## 📌 Problema

Ambientes multicloud apresentam inconsistências estruturais relevantes:

* Estruturas de billing distintas entre provedores
* Nomenclaturas incompatíveis entre serviços equivalentes
* Diferenças de granularidade e agregação
* Formatos divergentes de data, moeda e unidade
* Perda de rastreabilidade durante transformações

Além disso:

* Logs de segurança são isolados do contexto financeiro
* Identidade (IAM) não está conectada ao custo
* Não há visibilidade de **quem gerou o gasto e com qual risco**

**Resultado:**

> análise inconsistente e ausência de governança financeira contextualizada por risco

---

## 💡 Proposta

Implementar uma camada de normalização determinística + enriquecimento contextual:

### Billing

* Mapeamento explícito (`config/mapping.json`)
* Schema comum padronizado
* Preservação integral do dado original (`_native`)

### Security Context

* Normalização de sinais de segurança (`security/mapping.security.json`)
* Correlação por `resource_id`
* Atribuição de identidade (IAM → custo)
* Cálculo determinístico de risco
* Geração de KPIs financeiros baseados em risco

> O sistema não toma decisão — ele **estrutura e correlaciona dados para governança auditável**.

---

## 🏗️ Arquitetura

```text
Fatura nativa (CUR / Billing Export / Cost Export)
        ↓
Ingestão CSV
        ↓
Normalização (config/mapping.json)
        ↓
Schema comum
        ↓
Security Signals (logs / findings / IAM)
        ↓
Normalização de segurança (security/mapping.security.json)
        ↓
Correlation Layer (enricher.js)
        ↓
Risk + Cost Context
        ↓
API + Dashboard
```

---

## 🌀 Fluxo de Correlação

```text
Billing CSV ─────────────┐
                         ├── normalize → resources
Security Signals CSV ────┘
                         ↓
                 indexByResourceId
                         ↓
                 enrich(resources)
                         ↓
           security_context (por recurso)
                         ↓
                 aggregateRiskKPIs
```

---

## 📁 Estrutura do projeto

```text
backend/        API + normalização + enrich
frontend/       Dashboard
config/         Mapping + pricing
security/       Mapping + regras de risco
data/samples/   Billing + security signals
docs/           Documentação técnica
```

---

## 🔗 Provedores Suportados e Referências Oficiais

### ☁️ AWS

**Billing**

* [https://docs.aws.amazon.com/cur/latest/userguide/what-is-cur.html](https://docs.aws.amazon.com/cur/latest/userguide/what-is-cur.html)
* [https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/price-list-api.html](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/price-list-api.html)

**Security**

* [https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-event-reference-record-contents.html](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-event-reference-record-contents.html)
* [https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-findings-format.html](https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-findings-format.html)

**Campos críticos**

* `userIdentity.arn`
* `eventName`
* `eventTime`

---

### ☁️ GCP

**Billing**

* [https://cloud.google.com/billing/docs/how-to/export-data-bigquery](https://cloud.google.com/billing/docs/how-to/export-data-bigquery)
* [https://cloud.google.com/billing/v1/how-tos/catalog-api](https://cloud.google.com/billing/v1/how-tos/catalog-api)

**Security**

* [https://cloud.google.com/logging/docs/reference/audit/rest/Shared.Types/AuditLog](https://cloud.google.com/logging/docs/reference/audit/rest/Shared.Types/AuditLog)
* [https://cloud.google.com/security-command-center/docs/reference/rest](https://cloud.google.com/security-command-center/docs/reference/rest)

**Campos críticos**

* `principalEmail`
* `methodName`

---

### ☁️ Microsoft Azure

**Billing**

* [https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/tutorial-export-acm-data](https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/tutorial-export-acm-data)
* [https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices](https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices)

**Security**

* [https://learn.microsoft.com/en-us/azure/azure-monitor/essentials/activity-log-schema](https://learn.microsoft.com/en-us/azure/azure-monitor/essentials/activity-log-schema)
* [https://learn.microsoft.com/en-us/azure/defender-for-cloud/alerts-schemas](https://learn.microsoft.com/en-us/azure/defender-for-cloud/alerts-schemas)

**Campos críticos**

* `caller`
* `operationName`

---

### ☁️ Oracle Cloud (OCI)

**Billing**

* [https://docs.oracle.com/en-us/iaas/Content/Billing/Concepts/usagereports.htm](https://docs.oracle.com/en-us/iaas/Content/Billing/Concepts/usagereports.htm)
* [https://docs.oracle.com/en-us/iaas/api/#/en/usage/20190111/](https://docs.oracle.com/en-us/iaas/api/#/en/usage/20190111/)

**Security**

* [https://docs.oracle.com/en-us/iaas/Content/Audit/Concepts/auditoverview.htm](https://docs.oracle.com/en-us/iaas/Content/Audit/Concepts/auditoverview.htm)

---

### 🔄 Padrão de Mercado

* [https://schema.ocsf.io/](https://schema.ocsf.io/)

O schema de segurança segue princípios do **OCSF**, permitindo interoperabilidade futura.

---

## 🔐 Credenciais e Acesso

Este projeto **não consome APIs diretamente** no MVP.

Opera com:

> **dados exportados (CSV/JSON)**

### AWS

Permissões mínimas:

* `s3:GetObject`
* `cloudtrail:LookupEvents`
* `securityhub:GetFindings`

---

### GCP

* `billing.viewer`
* `logging.viewer`
* `securitycenter.findings.viewer`

---

### Azure

* Reader
* Security Reader
* Cost Management Reader

---

### OCI

* `inspect usage-reports`
* `read audit-events`

---

## 📊 Schema Normalizado

| Campo            | Descrição         |
| ---------------- | ----------------- |
| resource_id      | Identificador     |
| service_name     | Serviço           |
| region           | Região            |
| billed_cost      | Custo             |
| provider         | Cloud             |
| _native          | Dados originais   |
| security_context | Contexto de risco |

---

## 🛡️ Security Context (Output)

```json
{
  "security_context": {
    "owner": {
      "identity_name": "joao.silva",
      "confidence": "medium"
    },
    "risk_score": 9,
    "risk_level": "high",
    "findings": [
      "public_exposure",
      "no_approval"
    ],
    "cost_at_risk": 4200,
    "_logic_trace": "+3 (no_approval) | +3 (public_exposure) | +2 (high_cost)"
  }
}
```

---

## 🔍 Trilha de Auditoria

Cada score é explicável:

```text
+3 (no_approval) | +3 (public_exposure) | +2 (high_cost)
```

Permite:

* auditoria completa
* rastreabilidade
* transparência para FinOps + Segurança

---

## ⏳ Grace Period

Para evitar falso positivo:

* Recursos criados há menos de **24h**
* Não penalizados por ausência de aprovação

---

## 📊 KPIs Gerados

* Total Cost
* Cost at Risk
* Cost at Risk (%)
* Cost without Approval
* Cost Publicly Exposed
* High Risk Resources
* Top Identities by Spend
* Unattributed Cost

---

## 📐 Definições Importantes

### Cost at Risk

```text
Se risk_level = high → 100% do custo é considerado em risco
```

---

### Owner Confidence

| Nível  | Significado              |
| ------ | ------------------------ |
| high   | evento direto de criação |
| medium | múltiplos sinais         |
| low    | inferência indireta      |
| none   | sem dados                |

---

## ⚙️ Configuração

### `config/mapping.json`

Billing normalization

### `security/mapping.security.json`

Security normalization (OCSF-aligned)

### `security/rules.json`

* pesos de risco
* thresholds
* grace period

---

## 🚀 Execução

```bash
git clone https://github.com/gilbertocrv/clm-focus-normalization-engine.git
cd clm-focus-normalization-engine/backend
npm install
node server.js
```

Acesse:

```
http://localhost:3000
```

---

## ⚠️ Escopo

Este projeto:

✔ Normaliza dados
✔ Preserva rastreabilidade
✔ Correlaciona identidade, risco e custo

Este projeto não:

✘ Substitui SIEM
✘ Substitui CSPM
✘ Executa remediação
✘ Opera em tempo real

---

## 🧭 Evolução

* Versionamento de risco (timeline)
* Integração com APIs
* Trilha de decisão persistente
* Exportação auditável (hash)

---

## 📄 Licença

MIT

---

## 👤 Autor

**Gilberto Gonçalves dos Santos Filho**

Foco em:

* Governança de TI
* IAM
* FinOps
* Correlação entre risco e custo

---
