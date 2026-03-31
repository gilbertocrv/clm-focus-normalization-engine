# clm-focus-normalization-engine

Engine de normalização e correlação de dados de billing multicloud (AWS, GCP, Azure, OCI) com camada de contexto de segurança e identidade.

---

## O problema

AWS, GCP, Azure e OCI expõem estruturas de billing completamente diferentes — nomenclaturas, granularidades e formatos de campo distintos. Sem normalização, qualquer análise comparativa opera sobre dados inconsistentes.

Mas normalizar custo sem saber *quem gerou esse custo* e *qual o risco associado* produz uma análise incompleta para governança. Logs de segurança são isolados do contexto financeiro. Identidade (IAM) não está conectada ao custo. Não há visibilidade de quanto custa o risco.

---

## Sobre o FOCUS

Este projeto implementa normalização alinhada com o **FOCUS (FinOps Open Cost and Usage Specification)**, padrão aberto mantido pela FinOps Foundation, atualmente na versão 1.3 (dezembro 2025). AWS, GCP, Azure e OCI já suportam exportação nativa no formato FOCUS — mas a adoção ainda ocorre em velocidades diferentes por provedor.

O FOCUS é um padrão de mercado, não uma exigência regulatória. Não existe obrigatoriedade legal de usá-lo. O que existe é uma convergência da indústria em direção a um schema comum. O `config/mapping.json` deste projeto faz exatamente o que o FOCUS Converter oficial faz: transforma dados nos formatos nativos de cada provedor em um schema comparável — preservando os dados originais integralmente.

Referências:
- Especificação: https://focus.finops.org/focus-specification/
- GitHub: https://github.com/FinOps-Open-Cost-and-Usage-Spec/FOCUS_Spec
- FOCUS Sandbox (dados reais anonimizados): https://www.finops.org/insights/focus-sandbox/

---

## O que este projeto faz

Três camadas em sequência:

```
CSV billing (qualquer provedor)
        |
        v
Normalização  ->  schema comum auditável (_native preservado)
        |
        v
Correlação    ->  join por resource_id com sinais de segurança
        |
        v
Enriquecimento -> security_context + owner + risk_score + cost_at_risk
```

O sistema não toma decisão. Estrutura e correlaciona dados para governança auditável.

---

## Exemplo de output enriquecido

Input billing (AWS CUR):
```
line_item_resource_id,product_product_name,...,line_item_unblended_cost
i-0a1b2c3d4e5f,Amazon EC2,...,4200.00
```

Input sinais de segurança:
```
resource_id,identity_id,identity_name,action,...,has_approval,public_exposure
i-0a1b2c3d4e5f,arn:aws:iam::123:user/joao.silva,joao.silva,RunInstances,...,false,true
```

Output:
```json
{
  "resource_id":  "i-0a1b2c3d4e5f",
  "service_name": "Amazon EC2",
  "billed_cost":  4200.00,
  "provider":     "aws",
  "arbitrage": {
    "best_cloud": "oci",
    "savings":    1050.00
  },
  "security_context": {
    "owner": {
      "identity_name": "joao.silva",
      "confidence":    "high",
      "_note":         "atribuído por ação de criação detectada"
    },
    "findings":     ["no_approval", "public_exposure", "high_cost"],
    "risk_score":   8,
    "risk_level":   "high",
    "cost_at_risk": 3360.00,
    "_why": [
      "Recurso criado sem evidência de aprovação formal — risco de Shadow IT",
      "Recurso exposto à internet — risco de exfiltração de dados",
      "Custo acima do threshold — amplifica impacto financeiro do risco"
    ],
    "_snapshot": {
      "evaluated_at":  "2024-03-01T14:00:00.000Z",
      "rules_version": "1.1.0"
    }
  }
}
```

---

## KPIs gerados

| KPI | O que responde |
|-----|----------------|
| `cost_at_risk` | Quanto do custo está sob risco de segurança? |
| `cost_without_approval` | Quanto foi provisionado sem aprovação formal (Shadow IT)? |
| `cost_publicly_exposed` | Qual o custo de recursos expostos à internet? |
| `unattributed_cost` | Quanto do custo não tem dono identificado com confiança? |
| `top_identities_by_spend` | Quais identidades geraram mais custo sem aprovação? |

---

## Estrutura

```
backend/
  normalizer.js           Normalização de billing — testável em isolamento
  normalizer.test.js      33 testes
  services/
    enricher.js           Correlação billing + segurança
  enricher.test.js        47 testes
security/
  mapping.security.json   De/para de sinais de segurança por fonte
  rules.json              Pesos de risco versionados (v1.1.0)
config/
  mapping.json            De/para de billing por provedor
  pricing.json            Fatores de arbitragem por categoria
data/samples/
  aws_sample.csv          CSV nativo AWS CUR
  gcp_sample.csv          CSV nativo GCP Billing Export
  azure_sample.csv        CSV nativo Azure Cost Management
  oci_sample.csv          CSV nativo OCI Usage Reports
  security_signals.csv    Sinais de segurança (formato genérico)
frontend/
  index.html              Dashboard — abas por provedor + aba Risco & Identidade
docs/
  INTEGRATION.md          Documentação de API e instruções de ingestão
```

---

## Como rodar

```bash
git clone https://github.com/gilbertocrv/clm-focus-normalization-engine.git
cd clm-focus-normalization-engine/backend
npm install
node server.js
# abre http://localhost:3000
```

Testes:
```bash
npm test
# 80 testes — normalizer (33) + enricher (47)
```

---

## Provedores de billing suportados

### AWS — Cost and Usage Report (CUR)

Fonte nativa: S3 + Athena  
Campos mapeados: `line_item_resource_id`, `product_product_name`, `product_region`, `line_item_unblended_cost`

- Documentação do CUR: https://docs.aws.amazon.com/cur/latest/userguide/what-is-cur.html
- Dicionário de dados: https://docs.aws.amazon.com/cur/latest/userguide/data-dictionary.html
- Exportação FOCUS nativa (opcional): https://docs.aws.amazon.com/cur/latest/userguide/dataexports-create-standard.html
- Pricing API: https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/price-list-api.html

### GCP — BigQuery Billing Export

Campos mapeados: `resource.name`, `service.description`, `location.region`, `cost`

- Documentação do export: https://cloud.google.com/billing/docs/how-to/export-data-bigquery
- Schema de campos: https://cloud.google.com/billing/docs/how-to/export-data-bigquery-schema
- Exportação FOCUS nativa (opcional): https://cloud.google.com/billing/docs/how-to/export-data-bigquery-setup
- Billing Catalog API: https://cloud.google.com/billing/v1/how-tos/catalog-api

### Azure — Cost Management Export

Campos mapeados: `ResourceId`, `MeterCategory`, `ResourceLocation`, `CostInBillingCurrency`

- Tutorial de exportação: https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/tutorial-export-acm-data
- Dicionário de campos: https://learn.microsoft.com/en-us/azure/cost-management-billing/automate/understand-usage-details-fields
- Exportação FOCUS nativa (opcional): https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/enable-preview-features-cost-management-labs
- Retail Prices API: https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices

### OCI — Usage Reports

Campos mapeados: `resourceId`, `service`, `region`, `cost`

- Visão geral dos Usage Reports: https://docs.oracle.com/en-us/iaas/Content/Billing/Concepts/usagereportsoverview.htm
- Acesso aos reports: https://docs.oracle.com/en-us/iaas/Content/Billing/Tasks/accessingusagereports.htm
- Billing API: https://docs.oracle.com/en-us/iaas/api/#/en/usage/20190111/
- Exportação FOCUS nativa (opcional): https://docs.oracle.com/en-us/iaas/Content/Billing/Concepts/usagereports.htm

---

## Fontes de sinais de segurança suportadas

### AWS CloudTrail

Campos mapeados: `userIdentity.arn`, `eventName`, `eventTime`

- Conteúdo dos eventos: https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-event-reference-record-contents.html
- Exportação de logs: https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-log-file-examples.html

### AWS Security Hub (ASFF)

Campos mapeados: `Resources[0].Id`, `Severity.Label`, `Types[0]`

- Formato ASFF: https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-findings-format.html

### GCP Cloud Audit Logs

Campos mapeados: `resource.labels.instance_id`, `protoPayload.authenticationInfo.principalEmail`, `protoPayload.methodName`

- Referência de AuditLog: https://cloud.google.com/logging/docs/reference/audit/rest/Shared.Types/AuditLog
- Documentação geral: https://cloud.google.com/logging/docs/audit

### Azure Activity Logs

Campos mapeados: `resourceId`, `caller`, `operationName`, `eventTimestamp`

- Schema dos Activity Logs: https://learn.microsoft.com/en-us/azure/azure-monitor/essentials/activity-log-schema
- Microsoft Defender for Cloud (findings): https://learn.microsoft.com/en-us/azure/defender-for-cloud/alerts-schemas

### OCI Audit

- Visão geral: https://docs.oracle.com/en-us/iaas/Content/Audit/Concepts/auditoverview.htm

### Formato genérico (qualquer provedor)

CSV com campos: `resource_id`, `identity_id`, `identity_name`, `action`, `risk_type`, `severity`, `has_approval`, `public_exposure`, `sensitive_data`, `timestamp`, `source`

Exemplo em `data/samples/security_signals.csv`.

---

## Adicionar um novo provedor de billing

Edite `config/mapping.json` — sem alteração de código:

```json
{
  "meu-provedor": {
    "_source": "Portal de faturamento interno",
    "_docs":   "https://meu-provedor.com/billing/docs",
    "resource_id":  "campo_id_do_recurso",
    "service_name": "campo_nome_servico",
    "region":       "campo_regiao",
    "billed_cost":  "campo_custo"
  }
}
```

---

## Permissões mínimas por provedor

Este projeto opera exclusivamente sobre dados exportados (CSV). Não consome APIs em tempo real no MVP.

| Provedor | Permissões para exportar billing | Permissões para exportar segurança |
|----------|----------------------------------|-------------------------------------|
| AWS      | `s3:GetObject` | `cloudtrail:LookupEvents`, `securityhub:GetFindings` |
| GCP      | `billing.viewer` | `logging.viewer`, `securitycenter.findings.viewer` |
| Azure    | Cost Management Reader | Security Reader |
| OCI      | `inspect usage-reports` | `read audit-events` |

---

## API

| Endpoint | Descrição |
|----------|-----------|
| `POST /api/analyze` | Normaliza e analisa billing de um provedor |
| `POST /api/analyze/multi` | Múltiplos provedores simultâneos |
| `POST /api/enrich` | Billing + sinais de segurança → output com `security_context` |
| `GET /api/providers` | Lista provedores suportados |
| `GET /api/config/mapping` | Mapeamento de billing ativo |
| `GET /api/config/security-rules` | Regras de risco versionadas |

---

## Decisões de design

**`high_cost` amplifica, não cria risco.** Um recurso caro sem nenhum sinal de segurança não é um risco de segurança. O finding `high_cost` só é adicionado quando há pelo menos um outro finding.

**`confidence` no owner.** A atribuição de identidade é uma inferência, não um fato.
- `high` — ação explícita de criação por identidade humana detectada
- `medium` — ação de criação por role, service-account ou ferramenta de IaC (terraform, cloudformation)
- `low` — nenhuma ação de criação encontrada; atribuição por fallback

**`cost_at_risk` proporcional.** `cost_at_risk = billed_cost × (risk_score / 10)`. Definição explícita e auditável — sem limiares ocultos.

**Segurança é OR lógico.** Se qualquer sinal indica `public_exposure: true`, o finding é adicionado independentemente dos outros sinais. Nunca majority vote em segurança.

**`_snapshot` em cada avaliação.** Cada `security_context` registra `evaluated_at` e `rules_version`. Permite comparação histórica de risco vs custo ao longo do tempo.

**`unattributed_cost`.** Recursos sem owner ou com `confidence: low` são contabilizados separadamente. Responde: quanto do custo não tem dono identificado com confiança suficiente?

---

## Escopo

Este projeto normaliza e correlaciona dados. Não inclui: automação de decisão, integração com APIs em tempo real, streaming, remediação automática, nem funcionalidade de SIEM ou CSPM. O `pricing.json` usa fatores relativos estáticos — não use para decisão financeira real sem substituir pelas APIs de pricing de cada provedor.

---

## Licença

MIT — Gilberto Gonçalves dos Santos Filho
