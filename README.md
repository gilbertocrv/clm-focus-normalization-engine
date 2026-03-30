
---

# ☁️ Multicloud Billing Normalizer (CLM + FOCUS)

![License](https://img.shields.io/badge/license-MIT-green)
![Node.js](https://img.shields.io/badge/node.js-v18+-blue)
![FinOps](https://img.shields.io/badge/Focus-Aligned-orange)

Sistema para **normalização e padronização de dados de faturamento multicloud**, com suporte a **AWS, GCP, Azure e OCI**.

O objetivo é estruturar dados financeiros provenientes de diferentes provedores em um **schema comum auditável**, preservando a integridade dos dados originais e permitindo análises consistentes de custo e eficiência.

---

## 📌 Problema

Ambientes multicloud expõem dados de billing de forma heterogênea:

* Estruturas de dados distintas (JSON vs CSV)
* Nomenclaturas inconsistentes entre provedores
* Diferenças de unidade, moeda e granularidade
* Baixa rastreabilidade durante processos de transformação
* Dificuldade de auditoria e reconciliação financeira

---

## 💡 Solução

Este projeto implementa uma camada de normalização orientada a governança:

* **Ingestão baseada em exportações reais**

  * AWS (CUR)
  * GCP (BigQuery Billing Export)
  * Azure (Cost Management)
  * OCI (Usage Reports)

* **Mapeamento determinístico**

  * Tradução via `config/mapping.json`
  * Separação entre lógica e código

* **Schema comum padronizado**

  * Estrutura unificada para análise

* **Preservação de dados nativos**

  * Campo `_native` mantém o dado original intacto
  * Permite auditoria e reconciliação

* **Arbitragem de custo**

  * Classificação por categoria (Compute, Storage, Networking, etc.)
  * Base para análises comparativas de eficiência

---

## 🏗️ Arquitetura

```
backend/        → API de normalização e análise
frontend/       → Dashboard de visualização
config/         → Regras de mapeamento e arbitragem
data/samples/   → Exemplos de dados por provedor
docs/           → Documentação técnica e integração
```

---

## 📊 Schema Comum (Normalizado)

| Campo          | Descrição                            |
| -------------- | ------------------------------------ |
| `resource_id`  | Identificador do recurso no provedor |
| `service_name` | Nome do serviço                      |
| `region`       | Região/zone do recurso               |
| `billed_cost`  | Custo faturado                       |
| `_native`      | Dados originais completos da fatura  |

---

## 🔗 Fontes Oficiais

* **AWS**
  Cost and Usage Report (CUR)
  [https://docs.aws.amazon.com/cur/latest/userguide/data-dictionary.html](https://docs.aws.amazon.com/cur/latest/userguide/data-dictionary.html)

* **GCP**
  BigQuery Billing Export
  [https://cloud.google.com/billing/docs/how-to/export-data-bigquery-schema](https://cloud.google.com/billing/docs/how-to/export-data-bigquery-schema)

* **Azure**
  Cost Management Export
  [https://learn.microsoft.com/en-us/azure/cost-management-billing/automate/understand-usage-details-fields](https://learn.microsoft.com/en-us/azure/cost-management-billing/automate/understand-usage-details-fields)

* **OCI**
  Usage Reports
  [https://docs.oracle.com/en-us/iaas/Content/Billing/Concepts/usagereportsoverview.htm](https://docs.oracle.com/en-us/iaas/Content/Billing/Concepts/usagereportsoverview.htm)

---

## 🚀 Como Executar

### 1. Clonar o repositório

```bash
git clone https://github.com/gilbertocrv/clm-focus-normalization-engine.git
cd clm-focus-normalization-engine
```

### 2. Backend

```bash
cd backend
npm install
node server.js
```

### 3. Frontend

Abra o arquivo:

```
frontend/index.html
```

ou utilize o servidor local (se configurado).

---

## ⚙️ Configuração

### `config/mapping.json`

* Define o mapeamento entre campos nativos e o schema comum
* Permite adicionar novos provedores sem alterar código

### `config/pricing.json`

* Define fatores de arbitragem por categoria
* Estrutura pronta para integração futura com APIs reais de pricing

---

## 📁 Estrutura de Dados

* `data/samples/`

  * Arquivos CSV com campos reais de cada provedor
  * Utilizados como referência e template

* `_native`

  * Preserva o dado original sem alteração
  * Fundamental para auditoria e rastreabilidade

---

## 🧭 Limitações

Este projeto é um **MVP orientado a estruturação de dados**.

Não inclui:

* otimização automática de custos
* análise de performance em tempo real
* integração direta com APIs de billing
* observabilidade de infraestrutura

---

## 🚀 Evolução

Próximos passos planejados:

* Integração com APIs reais de pricing
* Streaming de dados de billing
* Versionamento de schemas
* Camada de governança de dados
* Regras avançadas de arbitragem

---

## 📄 Licença

Distribuído sob licença MIT.
Veja o arquivo `LICENSE` para mais detalhes.

---

## 👤 Autor

**Gilberto Gonçalves dos Santos Filho**

Foco em:

* Governança de TI
* IAM
* FinOps
* Estruturação de dados e auditoria

---

## 📌 Observação Final (Importante para posicionamento)

Este projeto não implementa tomada de decisão automática nem substitui ferramentas de FinOps ou observabilidade.

Ele atua como uma **camada de normalização e estruturação**, servindo como base para análises, auditoria e integração com sistemas mais complexos.

---
