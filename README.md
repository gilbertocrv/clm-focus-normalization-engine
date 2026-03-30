# ☁️ Multicloud Billing Normalizer (CLM + FOCUS)

![License](https://img.shields.io/badge/license-MIT-green)
![Node.js](https://img.shields.io/badge/node.js-v18+-blue)
![FinOps](https://img.shields.io/badge/Focus-Aligned-orange)

Sistema para normalização e padronização de dados de faturamento multicloud, com suporte nativo para **AWS, GCP, Azure e OCI**.

O objetivo deste projeto é estruturar dados financeiros provenientes de diferentes provedores em um **schema comum auditável**, preservando a integridade dos dados originais e permitindo uma análise de eficiência consistente.

---

## 📌 O Problema
Ambientes multicloud expõem dados de billing de formas heterogêneas:
* **Estruturas de dados distintas** (JSON aninhado vs CSV flat).
* **Nomenclaturas inconsistentes** (ex: `line_item_unblended_cost` vs `cost`).
* **Formatos de data e moeda variados**.
* **Dificuldade de Auditoria**: Perda de rastreabilidade durante a conversão de dados.

## 💡 A Solução
Este projeto implementa uma camada de normalização com foco em **Governança e Auditoria**:
* **Ingestão via CSV**: Baseada em exportações reais (CUR, BigQuery, Cost Management).
* **Mapeamento Determinístico**: Tradução via `mapping.json` para um schema comum.
* **Preservação Total (`_native`)**: O dado original é mantido intacto para fins de reconciliação contábil.
* **Arbitragem de Custo**: Categorização funcional (Compute, Storage, ML) para comparação de eficiência.

---

## 🏗️ Arquitetura do Projeto
* **`backend/`**: API Express para processamento e normalização dos SKUs.
* **`frontend/`**: Dashboard interativo com KPIs globais e visões por provedor.
* **`config/`**: Regras de mapeamento e fatores de arbitragem de preço.
* **`data/samples/`**: Templates de CSV com nomes de campos nativos reais de cada cloud.
* **`docs/`**: Documentação técnica e guia de integração de queries (Athena/BigQuery).

---

## 📊 Schema Comum (Normalizado)
| Campo | Descrição |
| :--- | :--- |
| `resource_id` | Identificador único do recurso no provedor |
| `service_name` | Nome amigável do serviço/produto |
| `region` | Localização geográfica (Region/Zone) |
| `billed_cost` | Custo real faturado no período |
| `_native` | **Objeto com todos os campos originais da fatura bruta** |

---

## 🔗 Fontes Oficiais Suportadas
* **AWS**: Cost and Usage Report (CUR) via S3 + Athena.
* **GCP**: BigQuery Billing Export.
* **Azure**: Cost Management Export (CSV).
* **OCI**: Usage Reports (Object Storage).

---

## 🚀 Como Executar

1. **Clone o repositório**:
   ```bash
   git clone [https://github.com/seu-usuario/multicloud-billing-normalizer.git](https://github.com/seu-usuario/multicloud-billing-normalizer.git)
   ```

2. **Instale e Inicie o Backend**:
   ```bash
   cd backend
   npm install
   node server.js
   ```

3. **Acesse a Interface**:
   Abra o arquivo `frontend/index.html` ou acesse via `http://localhost:3000`.

---

## ⚙️ Configuração Customizável
* **`mapping.json`**: Adicione novos provedores ou altere de/para sem mexer no código.
* **`pricing.json`**: Ajuste os fatores de arbitragem por categoria (Compute, Storage, Networking, etc).

---

## 🧭 Limites e Evolução
Este projeto é um **MVP focado em estruturação de dados**. Ele não substitui ferramentas de observabilidade em tempo real, mas serve como a fundação necessária para processos de auditoria e governança multicloud.

**Próximos passos:** Integração direta com APIs de pricing e suporte a streaming de dados.

---

## 📄 Licença
Distribuído sob a licença MIT. Veja `LICENSE` para mais informações.

---
**Desenvolvido por Gilberto Gonçalves dos Santos Filho**  
*Focado em IAM, Governança de TI e FinOps.*
