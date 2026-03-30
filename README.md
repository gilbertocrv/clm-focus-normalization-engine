Multicloud Billing Normalization Tool

Sistema para normalização e padronização de dados de faturamento multicloud, com suporte a AWS, GCP, Azure e OCI.

O objetivo é estruturar dados financeiros provenientes de diferentes provedores em um schema comum auditável, preservando os dados originais e permitindo análise consistente.

📌 Problema

Ambientes multicloud expõem dados de billing de formas diferentes:

estruturas de dados distintas
nomenclaturas inconsistentes
formatos de data e moeda variados
ausência de padronização entre provedores

Isso dificulta:

comparação de custos
auditoria financeira
análise consolidada
governança de dados
💡 Solução

Este projeto implementa uma camada de normalização de dados de billing, com as seguintes características:

ingestão de dados via CSV (exemplo baseado em exportações reais)
mapeamento para um schema comum padronizado
preservação completa dos dados originais (_native)
suporte a múltiplos provedores
separação entre:
visão normalizada
visão nativa
🏗️ Arquitetura
backend/        → API para processamento e normalização
frontend/       → Dashboard para visualização e análise
config/         → Regras de mapeamento e fatores de arbitragem
data/samples/   → Exemplos de dados por provedor
docs/           → Documentação e guia de integração
🔄 Fluxo de dados
Upload de arquivo CSV (por provedor)
Identificação do provedor
Aplicação do mapping (config/mapping.json)
Normalização para schema comum
Preservação do dado original em _native
Aplicação de fatores relativos (config/pricing.json)
Exibição no frontend
📊 Schema Comum

Campos principais:

resource_id
service_name
region
billed_cost
usage_type
tags
period_start
period_end
🔗 Integrações de Dados (Fontes Oficiais)
AWS
Cost and Usage Report (CUR)
Documentação:
https://docs.aws.amazon.com/cur/latest/userguide/data-dictionary.html
GCP
BigQuery Billing Export
Documentação:
https://cloud.google.com/billing/docs/how-to/export-data-bigquery-schema
Azure
Cost Management Export
Documentação:
https://learn.microsoft.com/en-us/azure/cost-management-billing/automate/understand-usage-details-fields
OCI
Usage Reports
Documentação:
https://docs.oracle.com/en-us/iaas/Content/Billing/Concepts/usagereportsoverview.htm
⚙️ Configuração
config/mapping.json

Define o mapeamento entre campos nativos de cada provedor e o schema comum.

Permite adicionar novos provedores apenas incluindo um novo bloco.

config/pricing.json

Define fatores relativos de custo por categoria:

compute
storage
database
networking
ML
serverless
analytics

⚠️ Os valores atuais são fatores relativos (não preços reais).

🧪 Dados de Exemplo

O diretório data/samples/ contém arquivos CSV simulando:

AWS
GCP
Azure
OCI

Esses arquivos utilizam campos nativos reais de cada provedor, servindo como referência para integração.

🖥️ Backend

API construída com Node.js + Express, com as seguintes rotas:

POST /analyze → análise de um CSV
POST /analyze-multi → análise multi-provedor
GET /providers → lista de provedores suportados
GET /config → retorna configurações
GET /health → health check
Características
preservação de dados originais em _native
suporte a múltiplos provedores
processamento desacoplado de UI
🌐 Frontend

Dashboard com:

upload via drag & drop
KPIs globais
visão normalizada
visão por provedor
exportação de relatórios em CSV
📦 Exportação

O sistema permite exportar os dados normalizados em formato CSV para análise externa.

🧭 Limites do Projeto

Este projeto:

não é um framework
não implementa tomada de decisão automática
não utiliza dados reais de performance
não substitui ferramentas de observabilidade

Ele é focado exclusivamente em:

normalização e estruturação de dados de faturamento multicloud

🚀 Possíveis Evoluções
integração com APIs reais de pricing
validação de schema automática
enriquecimento com dados de observabilidade
suporte a streaming de dados
versionamento de schemas
camadas de governança
🛠️ Tecnologias
Node.js
Express
JavaScript
HTML/CSS/JS (frontend)
📌 Observação

Os dados utilizados são provenientes de estruturas reais de exportação de billing dos provedores, mas podem ser simulados para fins de demonstração.

📄 Licença

Este projeto está sob licença MIT.

🔎 Nota final

Este projeto demonstra:

modelagem de dados
integração multicloud
normalização de schemas
preservação de auditabilidade

com foco em engenharia de dados e estruturação de informações financeiras, não em decisão automática ou otimização.
