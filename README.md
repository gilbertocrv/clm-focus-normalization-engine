

# ☁️ Multicloud Billing Normalization Engine (CLM + FOCUS)

![License](https://img.shields.io/badge/license-MIT-green)
![Node.js](https://img.shields.io/badge/node.js-v18+-blue)
![Focus](https://img.shields.io/badge/FOCUS-Aligned-orange)

Sistema de **normalização de dados de faturamento multicloud**, com suporte a **AWS, GCP, Azure e OCI**.

O objetivo é transformar dados financeiros heterogêneos em um **schema comum auditável**, preservando os dados nativos e permitindo análise consistente entre provedores.

> Este projeto é um **MVP de normalização de dados**.
> Não é um framework, nem um sistema de decisão.

---

## 📌 Problema

Ambientes multicloud apresentam inconsistências estruturais relevantes:

* Estruturas de billing distintas entre provedores
* Nomenclaturas incompatíveis entre serviços equivalentes
* Diferenças de granularidade e agregação
* Formatos divergentes de data, moeda e unidade
* Perda de rastreabilidade durante transformações

Resultado: **análise inconsistente e baixa confiabilidade para governança financeira**.

---

## 💡 Proposta

Implementar uma camada de normalização determinística com foco em auditabilidade:

* **Mapeamento explícito (`config/mapping.json`)**
* **Schema comum padronizado**
* **Preservação integral do dado original (`_native`)**
* **Classificação funcional por categoria**
* **Base preparada para integração com pricing real**

> O sistema não toma decisão — ele **estrutura o dado para que decisões sejam confiáveis**.

---

## 🏗️ Arquitetura

```text
Fatura nativa (CUR / Billing Export / Cost Export / Usage Report)
        ↓
Ingestão CSV
        ↓
De/Para (config/mapping.json)
        ↓
Schema Normalizado
        ↓
Classificação + Arbitragem (config/pricing.json)
        ↓
API + Dashboard
```

### Estrutura do projeto

```text
backend/        API Express (processamento e normalização)
frontend/       Dashboard (visualização e exportação)
config/         Regras de mapeamento e pricing
data/samples/   CSVs de exemplo por provedor
docs/           Documentação técnica (INTEGRATION.md)
```

---

## 🔗 Provedores Suportados e Referências Oficiais

A modelagem segue os padrões oficiais de billing de cada cloud:

### ☁️ AWS

* CUR (Cost and Usage Report):
  [https://docs.aws.amazon.com/cur/latest/userguide/what-is-cur.html](https://docs.aws.amazon.com/cur/latest/userguide/what-is-cur.html)
* Price List API:
  [https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/price-list-api.html](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/price-list-api.html)

### ☁️ GCP

* Billing Export (BigQuery):
  [https://cloud.google.com/billing/docs/how-to/export-data-bigquery](https://cloud.google.com/billing/docs/how-to/export-data-bigquery)
* Billing Catalog API:
  [https://cloud.google.com/billing/v1/how-tos/catalog-api](https://cloud.google.com/billing/v1/how-tos/catalog-api)

### ☁️ Microsoft Azure

* Cost Management Export:
  [https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/tutorial-export-acm-data](https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/tutorial-export-acm-data)
* Retail Prices API:
  [https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices](https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices)

### ☁️ Oracle Cloud (OCI)

* Usage Reports:
  [https://docs.oracle.com/en-us/iaas/Content/Billing/Concepts/usagereports.htm](https://docs.oracle.com/en-us/iaas/Content/Billing/Concepts/usagereports.htm)
* Usage API:
  [https://docs.oracle.com/en-us/iaas/api/#/en/usage/20190111/](https://docs.oracle.com/en-us/iaas/api/#/en/usage/20190111/)

---

## 📊 Schema Normalizado

| Campo          | Descrição                             |
| -------------- | ------------------------------------- |
| `resource_id`  | Identificador único do recurso        |
| `service_name` | Nome do serviço                       |
| `region`       | Região                                |
| `billed_cost`  | Custo faturado                        |
| `provider`     | Provedor de origem                    |
| `_native`      | Dados originais completos (imutáveis) |

---

## ⚙️ Configuração

### `config/mapping.json`

Define o de/para entre campos nativos e o schema comum.

* Extensível por provedor
* Permite adicionar novos providers sem alterar código

---

### `config/pricing.json`

Define fatores de arbitragem por categoria.

> ⚠️ Os fatores atuais são simulados
> Não devem ser utilizados para decisão real
> Estrutura preparada para integração com APIs oficiais

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

Servidor:

```
http://localhost:3000
```

### Frontend

Abrir no navegador:

```
frontend/index.html
```

---

## 📁 Dados de Exemplo

O diretório `data/samples/` contém:

* CSVs simulando exportações reais de cada cloud
* Estrutura de colunas nativas
* Base para testes e demonstração

---

## 📚 Documentação Técnica

Arquivo:

```
docs/INTEGRATION.md
```

Inclui:

* Endpoints da API
* Contratos de entrada/saída
* Queries de extração (Athena / BigQuery / Azure / OCI)
* Estrutura de mapeamento
* Diretrizes de expansão

---

## ⚠️ Escopo

Este projeto:

✔ Normaliza dados
✔ Preserva rastreabilidade
✔ Permite comparação consistente

Este projeto **não**:

✘ Toma decisão automática
✘ Substitui ferramentas FinOps
✘ Integra pricing em tempo real
✘ Implementa governança organizacional

---

## 🧭 Evolução e Limitações

### Limitações atuais

* Parsing incorreto para formatos numéricos locais (ex: `pt-BR`)
* Fatores de arbitragem não baseados em pricing real
* `resource_id` pode ser gerado artificialmente (impacto em auditoria)
* CORS aberto sem restrição
* Upload sem limite de tamanho (risco operacional)
* Configuração carregada apenas no startup
* Exposição de mensagens de erro internas
* Ausência de testes automatizados
* README sem exemplo explícito input → output (pendente evolução)

---

### Próximos passos

* Integração com APIs reais de pricing
* Validação de schema e consistência
* Testes automatizados por provedor
* Limites e hardening de segurança
* Versionamento de mapping
* Pipeline de ingestão contínua

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
* Estruturação e normalização de dados
---
