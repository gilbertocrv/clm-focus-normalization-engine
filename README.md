# ☁️ Multicloud Billing Normalization Engine (MVP)

Sistema de **normalização de dados de faturamento multicloud**, com suporte a AWS, GCP, Azure e OCI.

O objetivo é transformar dados financeiros heterogêneos em um **schema comum auditável**, preservando os dados nativos e permitindo análise consistente.

Este projeto é um **MVP de normalização**, não um framework e não um sistema de decisão.

---

## 📌 Problema

Ambientes multicloud apresentam:

* Estruturas de billing distintas entre provedores
* Nomenclaturas inconsistentes
* Diferenças de granularidade
* Falta de padronização para análise comparativa
* Dificuldade de auditoria e rastreabilidade

---

## 💡 Proposta

Este projeto implementa uma camada de normalização determinística baseada em:

* Mapeamento explícito (`config/mapping.json`)
* Schema comum padronizado
* Preservação completa dos dados originais (`_native`)
* Classificação por categoria de serviço
* Estrutura preparada para integração com APIs reais

---

## 🏗️ Arquitetura

```text
backend/        API de normalização e análise
frontend/       Dashboard de visualização
config/         Mapeamentos e regras
data/samples/   Dados de exemplo por provedor
docs/           Documentação técnica
```

---

## 🔗 Provedores Suportados e Documentação Oficial

A implementação segue os modelos oficiais de exportação e billing de cada provedor.

### ☁️ AWS

* Billing Export (CUR):
  [https://docs.aws.amazon.com/cur/latest/userguide/what-is-cur.html](https://docs.aws.amazon.com/cur/latest/userguide/what-is-cur.html)
* Price List API:
  [https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/price-list-api.html](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/price-list-api.html)

---

### ☁️ GCP

* Billing Export (BigQuery):
  [https://cloud.google.com/billing/docs/how-to/export-data-bigquery](https://cloud.google.com/billing/docs/how-to/export-data-bigquery)
* Billing Catalog API:
  [https://cloud.google.com/billing/v1/how-tos/catalog-api](https://cloud.google.com/billing/v1/how-tos/catalog-api)

---

### ☁️ Microsoft Azure

* Cost Management Export:
  [https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/tutorial-export-acm-data](https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/tutorial-export-acm-data)
* Retail Prices API:
  [https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices](https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices)

---

### ☁️ Oracle Cloud (OCI)

* Usage Reports:
  [https://docs.oracle.com/en-us/iaas/Content/Billing/Concepts/usagereports.htm](https://docs.oracle.com/en-us/iaas/Content/Billing/Concepts/usagereports.htm)
* Billing / Usage API:
  [https://docs.oracle.com/en-us/iaas/api/#/en/usage/20190111/](https://docs.oracle.com/en-us/iaas/api/#/en/usage/20190111/)

---

## 📊 Schema Normalizado

| Campo          | Descrição                 |
| -------------- | ------------------------- |
| `resource_id`  | Identificador do recurso  |
| `service_name` | Nome do serviço           |
| `region`       | Região                    |
| `billed_cost`  | Custo faturado            |
| `_native`      | Dados originais completos |

---

## ⚙️ Configuração

### `config/mapping.json`

Define o mapeamento entre campos nativos e o schema comum.

* Estrutura extensível por provedor
* Permite inclusão de novos providers sem alteração de código

---

### `config/pricing.json`

Define fatores de arbitragem por categoria.

> Preparado para futura substituição por integrações com APIs reais de pricing.

---

## 🚀 Execução

```bash
git clone https://github.com/gilbertocrv/clm-focus-normalization-engine.git
cd clm-focus-normalization-engine
```

### Backend

```bash
cd backend
npm install
node server.js
```

### Frontend

Abrir:

```text
frontend/index.html
```

---

## 📁 Dados de Exemplo

O diretório `data/samples/` contém:

* CSVs reais simulados por provedor
* Estrutura de colunas nativas
* Base para testes e demonstração

---

## 📚 Documentação Técnica

A documentação completa está em:

```text
docs/INTEGRATION.md
```

Inclui:

* contratos de API
* estrutura de dados
* exemplos de ingestão
* regras de mapeamento
* visão de evolução

---

## ⚠️ Escopo

Este projeto é um **MVP de normalização de dados**.

Não inclui:

* automação de decisão
* otimização automática de custos
* integração nativa com APIs em tempo real
* camada de governança avançada

---

## 🧭 Evolução Prevista

* Integração com APIs reais de billing e pricing
* Streaming de dados
* Versionamento de schema
* Validação e governança de dados
* Análise contextual de custos

---

## 📄 Licença

MIT

---

## 👤 Autor

Gilberto Gonçalves dos Santos Filho

Foco em:

* Governança de TI
* IAM
* FinOps
* Estruturação e normalização de dados
---
