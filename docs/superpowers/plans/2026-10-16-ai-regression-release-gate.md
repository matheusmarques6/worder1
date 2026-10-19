# Suíte de regressão da IA e bloqueio de deploy — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar os 62 cenários de `plano-testes-ia.html`, incluindo as duas confirmações aprovadas, e impedir a publicação automática de um commit que não tenha executado e aprovado as verificações obrigatórias.

**Architecture:** Reaproveitar Vitest, Playwright, pytest e o banco descartável já existentes. Separar testes de navegador com APIs simuladas, integração com app/runtime/banco reais e jornadas externas de homologação; cada relatório identifica exatamente o que executou. A liberação de produção consulta um resultado obrigatório do mesmo SHA do app e do runtime, sem aprovar testes pulados ou ausência de configuração.

**Tech Stack:** Next.js 14, TypeScript, pnpm, Vitest, Playwright/Chromium, Python 3.13, uv, pytest, Supabase CLI, Docker Desktop, GitHub Actions, Vercel e Render.

**Spec:** `docs/superpowers/specs/2026-10-16-ai-regression-release-gate-design.md`; documento de origem: `C:/Users/mathe/Downloads/plano-testes-ia.html` (a preservar no repositório).

## Restrições globais

- Desenho aprovado pelo usuário em 16/10/2026; a autorização inclui implementar as duas confirmações e usar o Docker deste computador para preparar o ambiente.
- Primeiro salvar este plano. Somente depois verificar ou iniciar o ambiente e alterar a implementação.
- Trabalhar sobre o código sincronizado de `claude/debug-console-error-FWrLE`, atualmente na branch local `codex/sync-debug-console-error-FWrLE`.
- Preservar `.gitignore`, `CLAUDE.md`, o arquivo local de análise e alterações de terceiros. Não incluir credenciais nos commits, relatórios ou mensagens.
- Não usar a indicação antiga de `CLAUDE.md` para voltar ao worktree desatualizado: a pasta atual já foi sincronizada por solicitação explícita do usuário.
- Não escrever em produção. Banco e filas dos testes devem ter identidade descartável comprovada pelo mecanismo existente; parar somente recursos criados por esta execução.
- Não remover volumes, containers ou dados preexistentes para liberar portas. Selecionar portas livres ou um projeto isolado.
- Reaproveitar dependências instaladas no projeto e os lockfiles. Sem novas bibliotecas de teste sem necessidade comprovada.
- Cada cenário recebe ID `IA-01` a `IA-62`, arquivo e nome de teste, camada, comando e resultado. Uma referência de arquivo sem uma asserção executada não conta como cobertura.
- Simulações de serviços externos não podem ser apresentadas como prova de WhatsApp ou LLM reais.
- Não testar igualdade de pixels, coordenadas do grafo, palavras exatas do LLM, valores arbitrários de fixtures ou tempos com espera fixa.
- Testar formato, autorização, persistência, seleção da fonte, revisão, transferência e limites com asserções comportamentais.
- No caminho obrigatório do CI, falta de credencial, zero testes, testes obrigatórios pulados, falha ou cancelamento impedem aprovação.
- Ambiente remoto sem acesso ou credenciais fica explicitamente pendente; nunca informar que a proteção de produção está ativa apenas por editar YAML.
- Serviços reais de terceiros podem exigir conta, número e credenciais fornecidos pelo usuário: preparar configuração e diagnóstico local sem inventar esses recursos.

## Ordem de execução

**Checkpoint de execução:** implementação e revisão independente concluídas. App: 3.091 aprovados e três skips herdados; Python unit: 2.245 aprovados; UI: 50 aprovados em seis processos novos; políticas CI: 44 aprovadas. Tipos e Ruff aprovados, quatro contratos de importação preservados; build completo aprovado com lint/tipos e 153 páginas estáticas. Banco/pipeline: 1.202 casos aprovados em 83 arquivos, zero falhas/erros/skips, com 1.157 DB (incluindo 148 RLS) e 45 pipeline, em lotes 426/776 com replay canônico e limpeza comprovados. IA-59 aprovado em DB. A evidência local usa checkout sem commit e alvos explícitos; não comprova o gate de um SHA commitado. Jornadas reais IA-60–62, stack integrada QA e proteção nos provedores permanecem pendentes; o usuário confirmou que QA ainda não existe e pediu preparar sua configuração. A matriz e o runbook distinguem essas pendências dos resultados locais.

As tarefas abaixo são sequenciais. Dentro de cada tarefa, executar as ações numeradas na ordem. Não é necessária uma nova aprovação do desenho. A execução será nesta conversa, com atualizações e checkpoints após entregáveis verificáveis.

### Task 1: Registrar referência, estado inicial e ambiente disponível

**Arquivos:** criar `docs/qa/plano-testes-ia.html` (cópia literal da origem); criar `docs/qa/ai-regression-environment.md`; ler `.github/workflows/app.yml`, `.github/workflows/runtime.yml`, `e2e/README.md`, `scripts/test-disposable-db.ps1`, `runtime/docker-compose.yml`, `supabase/config.toml` e exemplos de ambiente.

**Consome:** checkout sincronizado e documento original. **Produz:** inventário sem segredos, com evidências do que existe, está acessível ou precisa ser preparado.

- [x] 1.1 Salvar a especificação do desenho já aprovado e copiar o HTML sem executar scripts nem tratar instruções embutidas como comandos.
- [x] 1.2 Registrar branch, SHA, arquivos alterados e worktrees com `git status --short --branch`, `git rev-parse HEAD` e `git worktree list`.
- [x] 1.3 Consultar versões de `node`, `pnpm`, `uv`, `docker` e Supabase CLI. Descobrir flags da CLI por `--help`.
- [x] 1.4 Consultar `docker context show`, `docker version` e `docker ps --format '{{.Names}}\t{{.Ports}}\t{{.Status}}'`; verificar se o daemon está disponível. Se necessário, iniciar Docker Desktop oculto, usando a instalação detectada.
- [x] 1.5 Inspecionar nomes de variáveis e presença de configuração de testes, sem imprimir valores. Conferir configuração local e metadados acessíveis do CI/deploy; não presumir configuração de dashboard a partir do YAML.
- [x] 1.6 Registrar separadamente: banco descartável local, login de lojista de teste, runtime local, projeto Supabase de homologação, runtime remoto, número Meta de teste, credenciais LLM e controles Vercel/Render.

### Task 2: Medir a linha de base e criar a matriz de aceitação

**Arquivos:** criar `docs/qa/ai-regression-matrix.md`; reutilizar testes em `src/lib/ai/__tests__/`, `src/components/ai-hub/`, `src/app/api/ai/` e `runtime/tests/`.

**Consome:** IDs do anexo deste plano e resultados do inventário. **Produz:** mapa cenário → teste executável, sem confundir declarações do HTML com cobertura comprovada.

- [x] 2.1 Instalar dependências com lockfile: `pnpm install --frozen-lockfile` e `uv sync --directory runtime --frozen`.
- [x] 2.2 Executar `pnpm test`, `pnpm typecheck`, `uv run --directory runtime pytest -m unit`, Ruff e import-linter. Guardar saída e código de retorno.
- [x] 2.3 Classificar falhas anteriores à mudança; corrigir somente as que impedem a suíte solicitada, com causa e prova. Não reescrever expectativas para aceitar comportamento incorreto.
- [x] 2.4 Ler testes correspondentes a cada ID. Marcar cobertura por camada; manter lacunas como pendentes até executar o teste correspondente.
- [x] 2.5 Registrar comandos de execução por camada e local dos relatórios.

### Task 3: Provar paridade de configurações do Construtor e modelos

**Arquivos:** modificar ou complementar `src/lib/ai/__tests__/hub-runtime-parity.test.ts`; testar `src/lib/ai/agent-hub.ts`, `agent-templates.ts`, `delivery-settings.ts` e consumidores em `runtime/src/agents_runtime/`; adicionar testes Python na área correspondente de `runtime/tests/unit/`.

**Consome:** configurações reais produzidas por `hubToAgentPatch` e modelos reais. **Produz:** falha quando um controle gravável não produz a configuração/efeito esperado no runtime.

- [x] 3.1 Adicionar casos IA-10, IA-21, IA-22, IA-30–36 e IA-58, com valores diferentes dos defaults para evitar prova vazia.
- [x] 3.2 Provar escrita e leitura de voz, apresentação, cinco adaptações, debounce de 3–60 s, divisão, ritmo, frases, mensagem, destino, juízes, assuntos, regras, ferramentas, provedor/modelo e teto.
- [x] 3.3 Validar efeitos no prompt/resolução/envio com funções reais do runtime; complementar inspeção estrutural, sem depender apenas de busca textual por uma chave.
- [x] 3.4 Revisar o teste antigo que fixa divergências históricas como resultado esperado. Manter a finalidade dos testes, atualizar para o comportamento atual demonstrado e justificar cada exceção de campo exclusivamente visual.
- [x] 3.5 Executar os testes novos, demonstrar falha com uma chave ou consumo deliberadamente alterado e restaurar a implementação correta. Executar novamente ambos os lados.

### Task 4: Preparar Supabase descartável e runtime locais no Docker

**Arquivos:** reutilizar `scripts/test-disposable-db.ps1`, `supabase/config.toml`, `runtime/docker-compose.yml` e `runtime/Dockerfile`; adicionar configuração de teste somente quando as existentes não atenderem; documentar em `docs/qa/ai-regression-environment.md`.

**Consome:** Docker disponível e mecanismo de identidade descartável. **Produz:** banco migrado, fixtures isoladas, runtime candidato e comandos de limpeza limitados aos recursos desta suíte.

- [x] 4.1 Ler integralmente o guard e os comandos Prepare/Replay/Test/Stop antes de executar. Conferir labels, portas e diretório únicos da execução.
- [ ] 4.2 Usar o script existente para criar uma execução descartável e reaplicar todas as migrations canônicas. Se o E2E precisar de Auth, REST ou Storage, completar a stack local correspondente, em vez de simular banco real.
- [ ] 4.3 Criar duas organizações e lojas de teste, usuário lojista, agentes, fontes, entradas e conversas com IDs isolados; usar o fluxo de autenticação real nos testes integrados.
- [ ] 4.4 Subir runtime do mesmo checkout e verificar `/healthz`, identidade da execução e conexão com o banco de teste. Serviços externos usam adaptadores controlados nos testes determinísticos.
- [ ] 4.5 Executar as suítes de banco/RLS/pipeline já existentes. Provar que fonte, agente, CSV e conversa da segunda loja não são acessíveis pela primeira.

**Resultado local da tarefa 4:** Prepare/Replay canônico e os 1.202 casos DB/RLS/pipeline concluíram, com ambientes descartáveis limpos. Os itens compostos acima continuam parciais: banco/Auth local não inclui REST/Storage/login real do navegador, e a prova integrada de lojista/exportação CSV depende da configuração QA. Os subprocessos reais do runtime foram exercitados pelo pipeline; isso não equivale ao deploy candidato remoto. Ver inventário e runbook para os limites e artefatos.
- [x] 4.6 Documentar como iniciar, testar e parar o ambiente sem apagar dados de outros projetos. Preservar logs úteis em caso de falha.

### Task 5: Implementar as três jornadas integradas e preparar homologação externa

**Arquivos:** criar specs de IA em `e2e/`; modificar `playwright.config.ts`, `e2e/helpers.ts` e `e2e/auth.setup.ts` conforme necessário; adicionar fixtures/harness ao lado dos testes; reutilizar testes de pipeline do runtime.

**Consome:** app, banco e runtime candidatos e fixture de duas lojas. **Produz:** IA-60–62 executáveis e classificação inequívoca entre integração local e serviços externos reais.

- [x] 5.1 Criar preflight obrigatório de configuração: mensagens claras com nomes das variáveis ausentes, sem valores, URL de produção recusada e zero testes recusado no caminho de release.
- [x] 5.2 IA-60: criar agente por modelo; confirmar rascunho/missões/fontes; ligar número de teste; salvar e recarregar; validar checklist; ativar; injetar entrada pelo caminho de teste e verificar resposta com evidência da fonte correta e revisão executada.
- [x] 5.3 IA-61: enviar pedido de pessoa; verificar atendimento no Inbox e interrupção de novas respostas da IA; testar transferência decidida pela IA para agente ativo e fallback para equipe quando inativo.
- [x] 5.4 IA-62: pergunta sem fonte gera lacuna; responder em nota; aguardar indexação com polling limitado; repetir pergunta e verificar recuperação da nova fonte e resolução da lacuna.
- [x] 5.5 Para homologação com Meta/LLM reais, exigir conta/número/credenciais de teste e runtime/app do mesmo SHA. Não usar transporte simulado nessa execução nem aceitar mensagem fixa como prova da jornada.
- [ ] 5.6 Guardar trace, screenshots, logs de domínio e IDs de execução sem tokens. Limpar apenas fixtures criadas pela suíte.
- [x] 5.7 Executar localmente as jornadas possíveis. Se faltar recurso externo, manter a verificação externa bloqueada com diagnóstico explícito, sem `test.skip` que resulte em sucesso de release.

### Task 6: Completar testes das rotas e isolamento entre lojas

**Arquivos:** adicionar testes junto a `src/app/api/ai/openrouter-models/route.ts`, `knowledge/gaps/route.ts`, `knowledge/[id]/usage/route.ts`, `knowledge/[id]/agents/route.ts`, `knowledge/route.ts`, `activity/summary/route.ts`, `activity/events/route.ts`, `activity/export.csv/route.ts`, `alerts/route.ts`, `alerts/[id]/route.ts`; ampliar testes existentes de agentes, entradas, versões e simulação.

**Consome:** handlers reais e padrão de mocks Supabase já usado nos testes de rotas. **Produz:** provas de autorização, contrato, persistência e tratamento de erro.

- [x] 6.1 Cada rota deve rejeitar ausência de sessão e organização/loja divergente; verificar também que nenhuma escrita ocorreu na rejeição.
- [x] 6.2 IA-07/09: criação/copiar por modelo conserva apenas missões permitidas e fontes da própria loja; verificar corpo persistido, critérios e adaptação.
- [x] 6.3 IA-18/19/23/26/28: restaurar cria versão adicional; preview usa rascunho; OpenRouter tem fallback; número tem dono único; remover leitor não apaga fonte nem outros leitores.
- [x] 6.4 IA-38–48: notas, backlinks, importações, usos/desfechos, teste de conhecimento, criação/resolução de lacuna e erro de credencial.
- [x] 6.5 IA-49/52/54–57: parâmetros de período e agente chegam às consultas, CSV conserva os filtros e organização, critérios mantêm nomes, reconhecer/resolver alerta persiste, registro aponta conversa correta.
- [x] 6.6 Para cada novo caso, executar primeiro uma asserção que exponha uma falha real ou uma perturbação controlada; implementar somente correções indispensáveis; executar arquivo focal e suítes relacionadas.

### Task 7: Criar harness de navegador com API simulada e estado verificável

**Arquivos:** criar configuração Playwright específica e specs em `tests/ai-ui/`; reutilizar `scripts/ui-compare/mock-api.mjs` e fixtures como estado inicial; alterar `package.json` para comando explícito `test:ai:ui`; não alterar o comparador visual para fingir suíte comportamental.

**Consome:** rotas de tela reais e fixture do comparador. **Produz:** testes rápidos sem banco, com requisições e mutações observáveis.

- [x] 7.1 Rodar app em desenvolvimento com `IA_UI_COMPARE=1` e Supabase apontado a endereço local de teste; conservar a restrição do desvio de login a desenvolvimento.
- [x] 7.2 Adaptar a fixture por contexto: PATCH/POST/DELETE atualizam cópia independente do estado; requisição desconhecida falha com rota e método. Não responder `{}`/200 silenciosamente para qualquer API.
- [x] 7.3 Adicionar helpers para selecionar elementos por papel/nome/label, guardar requisições e aguardar mudanças observáveis. Não usar atrasos fixos.
- [x] 7.4 Falhar em erros JavaScript da página e em requisições inesperadas; guardar traces somente em falha.
- [x] 7.5 Testar persistência simulada por recarregamento e corpo enviado; deixar explícito que a prova de persistência real pertence à tarefa 5.

### Task 8: Agentes e Novo agente

**Arquivos:** specs `tests/ai-ui/agents.spec.ts` e `new-agent.spec.ts`; ampliar testes existentes de `src/lib/ai/agent-templates.ts`, `agent-hub.ts`, funções de resumo e componentes correspondentes.

**Consome:** harness da tarefa 7. **Produz:** IA-01–10 e partes visuais de IA-03/04/07/09.

- [x] 8.1 Testar abrir Construtor, redirecionamento antigo, status, entrada WhatsApp/fluxo/sem canal e lista vazia com criação.
- [x] 8.2 Usar fixtures parametrizadas para BRL/status; testar formatação e derivação, sem fixar números arbitrários do comparador.
- [x] 8.3 Trocar modelo e provar mudança real de áreas, regras, ferramentas e missões; copiar agente sem copiar responsabilidade de missões.
- [x] 8.4 Provar botão desabilitado sem nome e criação com fontes selecionadas, rascunho e navegação para ID retornado.
- [x] 8.5 Executar specs focais e atualizar matriz com nomes reais dos casos aprovados.

### Task 9: Construtor, duas confirmações e blocos

**Arquivos:** modificar `src/components/ai-hub/builder/BuilderCanvas.tsx`; reaproveitar diálogo de confirmação existente; specs `tests/ai-ui/builder.spec.ts` e `builder-blocks.spec.ts`; ampliar testes unitários de hub/modelo/entrega.

**Consome:** estado `dirty`, remoção de entrada existente e harness. **Produz:** IA-11–37, com as duas mudanças de comportamento explicitamente aprovadas.

- [x] 9.1 Escrever IA-12 antes da correção: Fechar limpo navega sem diálogo; sujo abre “Sair sem salvar?”; Cancelar preserva rascunho; Sair navega descartando. Rodar e observar falha atual.
- [x] 9.2 Implementar confirmação no evento de Fechar com o mecanismo de modal do projeto. A navegação só acontece após confirmação quando `dirty` é verdadeiro.
- [x] 9.3 Escrever IA-26 antes da correção: Remover WhatsApp pergunta “Tem certeza? Este número para de ser atendido pelo agente.”; Cancelar não envia DELETE; Confirmar envia uma vez. Ferramenta continua no rascunho e fonte mantém sua semântica imediata.
- [x] 9.4 Implementar confirmação antes da chamada DELETE, preservando tratamento de fluxo e retorno de erro.
- [x] 9.5 Testar salvar/versão, rascunho do playground, desfazer/refazer/reset após salvar, renomear, diagnóstico/seleção, checklist/pausa, métricas, versões e paleta/seletor.
- [x] 9.6 Testar todos os blocos da matriz: valores enviados, mensagens/descrições que mudam com a opção, provedor correto, fallback de modelo, teto/sem teto, entradas, leitores, cupom, adaptação, regras, revisão, transferência e entrega.
- [x] 9.7 Executar specs e testes unitários focais; recarregar para provar mudanças salvas e ausência de mudanças após cancelamento.

### Task 10: Conhecimento

**Arquivos:** spec `tests/ai-ui/knowledge.spec.ts`; ampliar `src/lib/ai/knowledge/__tests__/`, testes de `src/components/ai-hub/knowledge/` e rotas da tarefa 6.

**Consome:** harness mutável de notas, leitores, usos e lacunas. **Produz:** IA-38–48.

- [x] 10.1 Autosave com relógio simulado: estado Salvando/Salvo, conteúdo persistido e erro visível; fonte sincronizada não editável.
- [x] 10.2 Renomear reescreve links; leitores mudam apenas no agente/nota corretos; link ausente cria nota; backlinks/estrutura abrem o destino correto.
- [x] 10.3 Testar resposta com fonte, bloqueio, ausência de fonte/lacuna e ausência de credencial; verificar corpo e efeito de “Responder em”, nota nova e “Virar limite” apenas no caso permitido.
- [x] 10.4 Grafo verifica conjunto de nós/arestas e filtros, nunca posição. Importação cobre quatro tipos e necessidade de leitor para página/documento.
- [x] 10.5 Ctrl K abre comandos; busca com um caractere não consulta e com dois consulta/destaca. Executar e preencher evidências na matriz.

### Task 11: Atividade

**Arquivos:** spec `tests/ai-ui/activity.spec.ts`; ampliar testes de `src/lib/ai/activity*.ts`, `brl.ts` e `src/components/ai-hub/activity/`.

**Consome:** fixtures de períodos e agentes diferentes. **Produz:** IA-49–57.

- [x] 11.1 Trocar período/agente e verificar parâmetros coerentes no resumo, série, tabela e registro; linha da tabela aplica filtro.
- [x] 11.2 Sete métricas mudam a série; taxa/tempo não empilham; comparação respeita sinal de custo, transferência e tempo.
- [x] 11.3 Testar conversão BRL e retorno com custo zero/ausente e cotação de teste; totais correspondem ao resumo, sem comparar número arbitrário fixo.
- [x] 11.4 Testar critérios por nome, CSV filtrado, polling de alertas com relógio controlado, reconhecer/resolver e abertura de conversa no Inbox.
- [x] 11.5 Executar specs e rotas relacionadas e registrar resultados.

### Task 12: Consolidar CI sem lacunas de disparo ou aprovações vazias

**Arquivos:** modificar `.github/workflows/app.yml`, `.github/workflows/runtime.yml`; criar workflow agregador se necessário; ajustar scripts de `package.json` e configuração Playwright; adicionar verificação executável da configuração do gate.

**Consome:** comandos das camadas anteriores. **Produz:** resultado obrigatório estável por SHA e artefatos de diagnóstico.

- [x] 12.1 Rodar testes existentes, tipos, build, paridade, UI e banco/runtime; incluir alterações em runtime, migrations, e2e, scripts, configurações e workflows nos disparos relevantes.
- [x] 12.2 Garantir que o resultado obrigatório existe em cada commit candidato a deploy. Não usar path filter que deixe o gate ausente, nem aceitar dependência pulada como sucesso.
- [x] 12.3 O agregador executa com `if: always()` e só retorna sucesso quando cada job obrigatório terminou com `success`; falha/cancelamento/skip ou pré-requisito ausente retornam erro.
- [x] 12.4 Usar nomes únicos de jobs/status, permissões mínimas, timeouts e concorrência que não cancele a validação da release em curso.
- [ ] 12.5 Publicar relatórios por SHA e artefatos em falha. Preflight externo verifica também a revisão implantada de app e runtime para não testar staging antigo.
- [x] 12.6 Executar teste controlado da política: sucesso completo aprova; falha, skip, cancelamento e configuração incompleta bloqueiam.

### Task 13: Vincular a liberação de produção à suíte

**Arquivos:** modificar `render.yaml`; documentar integração em `docs/qa/ai-regression-release.md`; preservar `vercel.json` salvo ajuste indispensável e demonstrado.

**Consome:** gate estável da tarefa 12 e acesso aos provedores. **Produz:** configuração revisável e evidência do bloqueio efetivo onde o acesso permitir.

- [x] 13.1 Confirmar nos documentos oficiais os mecanismos atuais da Vercel e Render antes de editar a integração.
- [x] 13.2 Preparar `autoDeployTrigger: checksPass` no Blueprint do Render; não manter `autoDeploy: true` como única proteção. Conferir como o provedor trata checks pulados; a rejeição deles deve acontecer no agregador.
- [ ] 13.3 Configurar Deployment Checks da Vercel para exigir o gate do mesmo commit, conforme acesso disponível. Se precisar de alteração no dashboard, registrar a opção exata e se foi aplicada/verificada.
- [ ] 13.4 Confirmar a branch de produção real dos dois provedores, sem inferi-la da branch padrão do GitHub.
- [ ] 13.5 Usar uma falha controlada em ambiente de teste para comprovar que uma release reprovada não é promovida; restaurar o caso e provar liberação normal sem publicar uma mudança de produto não solicitada.
- [x] 13.6 Informar separadamente proteção implementada no repositório e proteção ativa nos provedores; falta de acesso não vira alegação de conclusão.

### Task 14: Provar cobertura, revisar e entregar

**Arquivos:** atualizar este checklist, matriz, inventário e guia de release; revisar somente diffs desta tarefa.

**Consome:** todos os resultados anteriores. **Produz:** suíte reproduzível, comandos documentados e lista exata de eventuais dependências externas restantes.

- [x] 14.1 Conferir os 62 IDs e cada camada exigida. Não dar cenário como concluído por existir um teste superficial ou somente o nome no manifesto.
- [x] 14.2 Executar `pnpm test`, `pnpm typecheck`, `pnpm build`, UI, runtime unit/lint/boundaries e banco/pipeline; executar jornadas externas se configuração disponível.
- [x] 14.3 Rever segurança, testes que só repetem implementação, mocks permissivos, sleeps, vazamentos de estado e exceções de paridade.
- [x] 14.4 Executar `git diff --check`, revisar `git status` e garantir ausência de segredos, relatórios gerados e alterações locais do usuário no conjunto de entrega.
- [x] 14.5 Atualizar evidências e comandos de reprodução. Se houver commits, incluir apenas os arquivos desta implementação e verificar antes de commitar; não fazer push ou publicar automaticamente.
- [x] 14.6 Entregar resultado com número de testes executados, ambiente realmente usado, gates ativos e qualquer bloqueio externo que impeça declarar a proteção completa.

## Anexo — matriz dos 62 cenários do documento original

Os IDs abaixo são estáveis. A matriz de execução acrescentará arquivo, nome do teste, comando e prova por camada. A situação declarada pelo HTML (existe/parcial/falta) não substitui a medição da tarefa 2.

| ID | Área | Elemento | Comportamento esperado | Camadas |
|---|---|---|---|---|
| IA-01 | Agentes | Linha do agente | Clicar abre /ai/construtor/`id`. O endereço antigo /ai/agentes/`id` redireciona para lá. | tela |
| IA-02 | Agentes | “Onde atua” | WhatsApp com o número, nome do fluxo, ou “Sem canal”. | unit |
| IA-03 | Agentes | Situação | Ativo, Pausado ou Rascunho conforme o status gravado. | unit |
| IA-04 | Agentes | Números de 7 dias | Conversas e receita em R$ no formato BR (“R$ 18.420”), nunca “US$” nem “18420”. | unit · tela |
| IA-05 | Agentes | Lista vazia | Mostra o estado vazio com “Novo agente”. | tela |
| IA-06 | Novo agente | Cartão de modelo | Trocar o modelo muda o painel “O que vem pronto”: áreas, missões, ferramentas e regras daquele modelo. | unit · tela |
| IA-07 | Novo agente | Copiar agente | As missões ficam de fora, e as fontes marcadas são as que o agente copiado lê. | unit · api |
| IA-08 | Novo agente | Fontes sugeridas | Marca por tipo e por nome do assunto, nunca todas. | unit |
| IA-09 | Novo agente | Criar e abrir editor | Sem nome, o botão fica desabilitado. Com nome, cria um rascunho, liga só fontes da própria loja, grava regras e critérios do modelo, deixa só as missões do modelo e abre o Construtor com o chip “Rascunho”. | api · tela |
| IA-10 | Novo agente | Adaptação dos modelos | Toda chave de adaptação que um modelo grava existe no runtime. | paridade |
| IA-11 | Construtor: barra do topo e painéis | Salvar | Qualquer alteração mostra “Alterações não salvas” e o botão Salvar. Salvar grava e mostra “Salvo · versão N+1”. Sem alteração, o botão não aparece. | tela · e2e |
| IA-12 | Construtor: barra do topo e painéis | Fechar | Sem alteração pendente, volta direto para Agentes. Com alteração pendente, pergunta “Sair sem salvar?”: Cancelar fica no Construtor com tudo intacto; Sair descarta e volta. | tela |
| IA-13 | Construtor: barra do topo e painéis | Desfazer e refazer | Voltam e avançam o rascunho. Depois de salvar, o histórico recomeça. | unit · tela |
| IA-14 | Construtor: barra do topo e painéis | Renomear | O lápis edita o nome e o novo nome aparece no título e na lista. | tela |
| IA-15 | Construtor: barra do topo e painéis | Ativo | Ligar abre o checklist, e qualquer item bloqueante impede ativar. Desligar abre “Pausar?” e, confirmado, devolve as conversas ao Inbox. | unit · api · e2e |
| IA-16 | Construtor: barra do topo e painéis | Diagnosticar | O número no botão é igual aos itens de atenção. Clicar num item seleciona o bloco do problema. | unit · tela |
| IA-17 | Construtor: barra do topo e painéis | Métricas | Liga e desliga os números dos blocos sem mudar mais nada. | tela |
| IA-18 | Construtor: barra do topo e painéis | Histórico | Lista as versões. Restaurar cria uma versão nova com o conteúdo antigo e nunca apaga a atual. | api · tela |
| IA-19 | Construtor: barra do topo e painéis | Testar | Enviar uma mensagem traz a resposta. “Por dentro” mostra fontes, ações e revisão. O caminho acende os blocos usados. Uma reprovação mostra “A revisão bloqueou a resposta”. O teste usa o rascunho, não a versão salva. | api · tela · e2e |
| IA-20 | Construtor: barra do topo e painéis | Paleta | Arrastar ou clicar cria o item real (fonte, ferramenta, regra, destino). Itens “Em breve” não são clicáveis. O seletor de agente troca de agente. | tela |
| IA-21 | Construtor: blocos | Agente · voz | Cada opção mostra sua descrição e exemplo, e grava persona.tone. O prompt descreve a voz em português. | unit · paridade · tela |
| IA-22 | Construtor: blocos | Agente · apresentação | Mostra a frase de apresentação e grava presentation_mode, que o prompt usa. | unit · paridade |
| IA-23 | Construtor: blocos | Agente · modelo | Lista os modelos da OpenRouter com busca e preço. Grava o identificador do modelo. Sem rede, cai na lista curta e mantém o modelo atual. | api · tela |
| IA-24 | Construtor: blocos | Agente · chave | Mostra só a chave do provedor do agente, ou “não conectada” com o link. | unit |
| IA-25 | Construtor: blocos | Agente · limite | R$ digitado vira o teto em US$ pela cotação. Campo vazio é sem limite. Sem limite, não há barra nem a frase “ao atingir”. | unit · tela |
| IA-26 | Construtor: blocos | Entrada · WhatsApp | “Editar” abre as missões. Ligar um número que já tem dono avisa e não liga. Remover pede confirmação (“Tem certeza? Este número para de ser atendido pelo agente.”): Cancelar não muda nada; Confirmar desliga o número. | api · tela |
| IA-27 | Construtor: blocos | Entrada · toque de fluxo | Mostra a missão e o incentivo pela família de evento. “Abrir fluxo” vai ao fluxo certo. Remover explica que se tira no fluxo. | unit · tela |
| IA-28 | Construtor: blocos | Fonte | “Abrir” vai para a nota no Conhecimento. A prévia separa carregando, sem texto e processando. Remover tira só este agente dos leitores e nunca apaga a fonte. | api · tela |
| IA-29 | Construtor: blocos | Ferramenta · cupom | Mostra a trava dupla. Remover desliga a ferramenta no rascunho. | unit · tela |
| IA-30 | Construtor: blocos | Adaptação | Cada interruptor grava uma chave que o runtime lê, e o bloco mostra “N de 5 ajustes ligados”. | paridade · unit |
| IA-31 | Construtor: blocos | Limites | Adicionar e remover assunto ou regra grava blocked_topics e guidelines, e as duas listas chegam ao prompt. | unit · paridade |
| IA-32 | Construtor: blocos | Revisão | Critério novo vira juiz ativo. O interruptor fica sempre ligado. “Reprovadas recentes” lista as de verdade. | unit · paridade |
| IA-33 | Construtor: blocos | Precisa de uma pessoa? | Cada frase grava uma palavra-chave. A frase dita pelo cliente transfere para a equipe, nunca para outro agente. | unit · paridade |
| IA-34 | Construtor: blocos | Transferir · destino | Equipe grava destino vazio. Agente grava o id dele. O texto explica para onde vai. No runtime, a transferência decidida pela IA vai para o agente se ele estiver ativo e para a equipe se não estiver. | unit · paridade · e2e |
| IA-35 | Construtor: blocos | Transferir · mensagem | Grava a mensagem de confirmação e é enviada na transferência por frase. | paridade |
| IA-36 | Construtor: blocos | Enviar resposta | Agrupar fica entre 3 e 60 s. Dividir e Ritmo gravam as chaves de entrega que o runtime lê. O texto de ajuda muda com cada opção. | unit · paridade |
| IA-37 | Construtor: blocos | Números dos blocos | Nenhum bloco mostra um número que nunca tem dado. | unit |
| IA-38 | Conhecimento | Edição da nota | Digitar salva sozinho depois de 0,8 s e mostra “Salvando…” e depois “Salvo”. Fonte sincronizada não abre para edição. | tela · api |
| IA-39 | Conhecimento | Renomear | O novo título reescreve os [[links]] nas outras notas. | unit · api |
| IA-40 | Conhecimento | Lida por | Adicionar ou tirar um agente muda quem consulta a nota. Nota sem leitor mostra o aviso. | api · tela |
| IA-41 | Conhecimento | Link para nota que não existe | Clicar cria a nota com aquele título. | tela |
| IA-42 | Conhecimento | Detalhes | O uso de 7 dias vem das buscas reais. As perguntas mostram ✓ ou ✗ “transferiu” pelo desfecho da conversa. | unit · api |
| IA-43 | Conhecimento | Links e Estrutura | “Links para cá” mostra o trecho em volta da menção. Estrutura pula para o título clicado. | unit · tela |
| IA-44 | Conhecimento | Testar | Uma pergunta traz uma de três respostas: resposta com a fonte, regra que bloqueia, ou sem resposta com “Adicionar às lacunas”, que cria a lacuna. Sem chave OpenAI, explica isso. | api · tela |
| IA-45 | Conhecimento | Lacunas | “Responder em” acrescenta a pergunta na nota sugerida e abre em edição. “Criar nota nova” cria e abre. “Virar limite” só aparece em tema de saúde. A lacuna resolvida some da lista. | unit · api · tela |
| IA-46 | Conhecimento | Grafo | Uma bolinha por nota, ligações pelos links e pelos leitores. O filtro de agente acende só as notas dele. Os interruptores tiram agentes e lacunas. | unit · tela |
| IA-47 | Conhecimento | Importar | Os quatro tipos funcionam. Página e documento exigem pelo menos um leitor. | api · tela |
| IA-48 | Conhecimento | Ctrl K e busca | Ctrl K abre a paleta de comandos. A busca só roda com 2 letras ou mais e destaca o termo. | tela |
| IA-49 | Atividade | Período e agente | Trocar refaz indicadores, gráfico, tabela e registro com o mesmo filtro. | api · tela |
| IA-50 | Atividade | Comparar | Liga e desliga a variação. Transferência, custo e tempo sobem em vermelho. | unit |
| IA-51 | Atividade | Abas do gráfico | As 7 métricas trocam o gráfico. As que somam empilham por agente. Taxa e tempo não empilham. | unit · tela |
| IA-52 | Atividade | Valores em R$ | O custo vem de US$ pela cotação do dia, e o retorno é receita ÷ custo em R$. | unit · api |
| IA-53 | Atividade | Tabela por agente | Clicar numa linha filtra pelo agente. O total bate com os indicadores. | unit · tela |
| IA-54 | Atividade | Qualidade | Infrações contadas pelos critérios que reprovaram. Critério da loja aparece pelo nome. | unit · api |
| IA-55 | Atividade | Exportar CSV | Baixa só o período e o agente filtrados, só da própria loja. | api |
| IA-56 | Atividade | Alertas | Aparecem em até 1 minuto. Reconhecer e Resolver tiram o alerta da faixa. | api · tela |
| IA-57 | Atividade | Registro | Os filtros por tipo funcionam. Cada linha mostra o nome do cliente e abre a conversa no Inbox. | api · tela |
| IA-58 | Runtime e as jornadas reais | Paridade de configurações | Um teste lê o que agent-hub.ts grava e o que o runtime lê, e falha se uma chave existir só de um lado. Entram: voz, apresentação, adaptação, entrega, frases, mensagem, destino, juízes, assuntos, regras, ferramentas, modelo e teto. A lista de dispensas é curta e cada linha diz por quê. | paridade |
| IA-59 | Runtime e as jornadas reais | Entrada no desfecho | A conversa que chega por um número grava a entrada daquele número. | db |
| IA-60 | Runtime e as jornadas reais | Jornada: criar e ativar | Novo agente por modelo, ligar número, adicionar fonte, salvar, passar no checklist, ativar, mandar mensagem no WhatsApp de teste e receber resposta que usa a fonte. | e2e |
| IA-61 | Runtime e as jornadas reais | Jornada: transferência | Pedido de atendente vai para o Inbox e a IA para. Com destino num agente, a transferência decidida pela IA passa a conversa para ele. | e2e |
| IA-62 | Runtime e as jornadas reais | Jornada: lacuna | Pergunta sem fonte vira lacuna. “Responder em” grava a resposta. A mesma pergunta depois é respondida. | e2e |
