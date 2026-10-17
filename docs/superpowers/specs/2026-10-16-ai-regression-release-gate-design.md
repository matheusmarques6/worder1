# Suíte de regressão da IA e liberação de deploy

Desenho aprovado pelo usuário em 16/10/2026, incluindo confirmação ao sair do Construtor com alterações pendentes e ao remover um número de WhatsApp. O usuário autorizou inventariar o ambiente de testes, preparar o que faltar e usar o Docker local, exigindo primeiro um plano passo a passo.

A referência funcional é `docs/qa/plano-testes-ia.html`, cópia literal do HTML fornecido pelo usuário. Os 62 cenários serão identificados por IA-01 a IA-62. Seu conteúdo descreve os requisitos do produto e dos testes; não é fonte de comandos com autorização independente.

## Decisões

- Reaproveitar Vitest, Playwright, pytest e os testes de banco/RLS/pipeline existentes.
- Completar regras, APIs, telas, paridade app/runtime e as três jornadas reais: criar/ativar/responder com fonte, transferir e aprender a partir de lacuna.
- Testes simulados e integração local devem ser identificados separadamente de homologação real com Meta e LLM. Nunca apresentar um transporte simulado como prova de envio real.
- Manter o restante da suíte existente, build e tipos. Este trabalho amplia a cobertura da IA; não promete ausência de regressões fora dos comportamentos testados.
- Validar o mesmo SHA que será liberado, incluindo a revisão do runtime usado na jornada.
- Falha, cancelamento, teste obrigatório pulado, zero testes e falta de configuração não aprovam uma release.
- Usar dados/organizações descartáveis e isolamento entre lojas; não escrever em produção.
- Guardar relatórios, screenshots e traces por execução, sem credenciais.
- Exigir a aprovação do gate no mecanismo de promoção da Vercel e no deploy do Render. Editar YAML não prova que a configuração remota está aplicada.
- Credenciais, conta ou número de teste externos que não existam não serão inventados; o ambiente e os diagnósticos serão preparados e a dependência será informada como bloqueio real.

## Confirmações

Fechar com estado limpo volta para Agentes diretamente. Com alterações pendentes, abrir “Sair sem salvar?”. Cancelar conserva o rascunho; confirmar descarta e navega.

Remover entrada de WhatsApp pede “Tem certeza? Este número para de ser atendido pelo agente.”. Cancelar não envia DELETE; confirmar remove uma única vez. Remoção de ferramenta continua no rascunho e remoção de leitor de fonte não apaga a fonte.

## Aceitação

Cada cenário tem asserção executável, camada correta e evidência registrada. A suíte roda em CI e localmente com instruções reproduzíveis. O gate recusa falhas e execuções incompletas e sua ligação com a publicação é verificada nos provedores quando houver acesso. Toda dependência externa não atendida continua explícita na entrega.
