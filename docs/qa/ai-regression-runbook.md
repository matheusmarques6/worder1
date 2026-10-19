# Executar e ativar a proteção de regressão IA

## Estado e limites

O código foi preparado a partir de `claude/debug-console-error-FWrLE`, base `5642010368b1e1af56b077abc0c2b6a0c8147e13`. O plano detalhado está em `docs/superpowers/plans/2026-10-16-ai-regression-release-gate.md`; a matriz de evidências está em `ai-regression-matrix.md`.

O usuário confirmou que ainda não existem ambientes separados de homologação. Os templates abaixo **não criam serviços nem ativam proteção remota**. Sem homologação configurada, `Release readiness` reprova. O Docker local já respondeu e a validação descartável de banco/pipeline foi retomada; consultar `ai-regression-environment.md`.

O histórico passou a capturar também as colunas editáveis do agente (nome, modelo/provedor, teto, apresentação e adaptação) na chave aditiva `change_summary.agent_fields` do JSON já existente. As chaves restauráveis são limitadas por uma lista explícita; IDs, organização e status não são restaurados. Snapshots antigos, sem essa chave, restauram os campos que efetivamente registraram e preservam as colunas adicionais atuais. Não há migration SQL nova nem backfill que invente valores antigos. Leitores anteriores continuam usando `change_summary.lines`.

Nenhuma suíte prova ausência absoluta de bugs. As camadas verificam os cenários descritos, a base existente, tipos, build e os contratos de integração. Mock de tela verifica comportamento da interface; rota real com I/O simulado verifica autorização/consultas; pytest DB/RLS/pipeline e homologação verificam persistência e serviços reais.

## Decisões de execução

- Reutilizar a branch dedicada já sincronizada, preservando arquivos locais do usuário e outros worktrees. Não houve commit, push ou deploy remoto nesta implementação.
- Reutilizar Vitest, Playwright, pytest e o executor descartável existentes. A preparação inicial e investigações independentes puderam avançar em paralelo; alterações compartilhadas tiveram um único responsável por vez.
- Usar PowerShell para os registros do plano porque o helper Bash da skill não estava disponível neste Windows. A revisão independente e seus achados foram mantidos no histórico de execução.
- Guardar as colunas adicionais do histórico no JSON existente, com whitelist e compatibilidade de leitura, sem criar uma migration nem inventar valores de versões antigas.
- Dividir UI em seis processos novos por causa da memória virtual do host, mantendo todos os casos obrigatórios, sem retries ou skips. Não alterar paginação do Windows, fechar aplicativos do usuário ou resetar Docker para obter um resultado verde.
- Preparar templates e roteiro para QA, conforme a confirmação de que os recursos separados ainda não existem. A ativação remota e a prova de bloqueio de produção continuam etapas explícitas de homologação.

## Comandos por camada

Evidência local desta implementação: 3.091 testes do app aprovados e três skips herdados; 2.245 unidades Python aprovadas; 50 casos de navegador aprovados em seis execuções; 44 testes de política de CI aprovados; tipos aprovados, Ruff limpo e quatro contratos de importação preservados. O build de produção completo aprovou (exit 0), com compiladores isolados, lint/tipos habilitados, 153 páginas estáticas geradas, otimizações e traces concluídos. Não somar os 59 testes focais de histórico/rotas novamente aprovados após a correção de inferência às 3.091 unidades, pois são os mesmos casos. A revisão confirmou que as quatro seleções literais geram exatamente as mesmas projeções anteriores.

Relatórios locais: `test-results/ai-vitest-final.log` e `.json`, `ai-typecheck-final.log`, `ai-version-query-final.log`, `ai-build-workers-final.log` e `ai-ui/bounded-2026-10-16-case-results.json`. A primeira tentativa de build por falta de memória foi preservada em `ai-build-final.log`. O build aprovado emitiu um aviso de dependência de `useEffect` em `src/components/whatsapp/inbox/ChatPanel.tsx:452`, arquivo não alterado nesta implementação; isso não equivale a `pnpm lint --max-warnings=0` aprovado. O JSON agregado do Vitest instalado conta skips como aprovados; a matriz usa o status de cada asserção, coerente com o resumo do console. Os três skips estão identificados no final da matriz; não equivalem à execução das integrações opcionais.

```powershell
pnpm install --frozen-lockfile
uv sync --directory runtime --frozen
pnpm test
pnpm typecheck
pnpm build
pnpm test:ci-policy
pnpm test:ai:parity
pnpm test:ai:api
pnpm exec playwright install chromium
pnpm test:ai:ui
uv run --directory runtime ruff check .
uv run --directory runtime lint-imports
uv run --directory runtime pytest -m unit
```

O banco utiliza exclusivamente o executor descartável documentado no inventário. Os dois arquivos SQL selados têm LF fixado em `.gitattributes`; não atualizar hashes para acomodar uma conversão de fim de linha.

Banco/pipeline locais: **1.202 aprovados, zero falhas, erros ou skips**, em 83 arquivos. São 1.157 casos de banco, dos quais 148 marcados RLS, e 45 de pipeline. Os lotes de 426 e 776 casos usaram migrations canônicas idênticas e encerraram com limpeza comprovada. Relatórios: `.superpowers/sdd/auditoria-ia-disposable/eae152cd480f41f2bb8aed8e0eae70a7/artifacts/focal.xml` e `.superpowers/sdd/auditoria-ia-disposable/7b496e01c40e4809aec851b2645bf879/artifacts/focal.xml`; conferência agregada em `test-results/ai-db-verification.json` e inventário em `ai-db-collection.json`.

Essa prova cobre o checkout local sem commit, usando `TestTargets` explícitos e `scope=focal`. O gate completo por SHA continua exigindo inputs commitados. O primeiro lote foi preservado após uma mudança somente no corpo de um teste independente de políticas do segundo lote; hashes e comparação AST confirmaram que os arquivos executados, produção, helpers e fixtures comuns não mudaram. O segundo lote inteiro foi reexecutado após essa correção. Os relatórios correspondem ao inventário completo, sem duplicar parâmetros ou omitir arquivos.

O replay revelou duas tabelas legadas ausentes da cadeia canônica; o bootstrap da migration `20261016000005` foi corrigido somente para tabelas inexistentes. Cinco testes novos verificam criação, compatibilidade CRM/Inbox, preservação e isolamento. Os testes anteriores foram alinhados ao modelo de múltiplos agentes, ao vínculo de fontes por agente, ao limiar de recuperação e ao parâmetro SQL `numeric`; as regras do produto foram preservadas. O teste novo de limiar verifica similaridades `0.69` e `0.71` contra o default `0.7`.

A primeira tentativa única excedeu 600 segundos e não aprovou nenhum resultado parcial. As rodadas que falharam ficaram preservadas; não entram nos totais aprovados. Um cenário de recuperação de envio falhou inicialmente e passou na reprodução focal e em duas rodadas posteriores do arquivo, sem retries nem alteração cega desse cenário. A causa dessa falha inicial não foi estabelecida. A etapa remota continua necessária para comprovar jornadas e bloqueio nos provedores.

No Windows deste computador, o download do Chromium falhou. Para executar com o Chrome instalado:

```powershell
$env:E2E_CHROMIUM_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
pnpm test:ai:ui
```

Para memória limitada: `pnpm test --maxWorkers=1 --minWorkers=1`; executar build/tipos/navegador em sequência. No CI há runners separados por job.

A verificação local de produção usa o pipeline do Next 14.0.4 com `experimental.cpus=1` e `experimental.webpackBuildWorker=true` somente em memória, mantendo lint, tipos e otimizações habilitados. O isolamento libera a memória de cada compilador antes da próxima fase; limitar apenas os workers de páginas não bastou na primeira tentativa, que compilou mas encerrou por falta de memória em lint/tipos. O arquivo de configuração e o comando padrão `pnpm build` do CI não foram alterados para esse limite do host. Para reproduzir, com as mesmas variáveis fictícias do job `app/build` já definidas:

```powershell
$env:NODE_ENV = 'production'
node -e "const c = require('./next.config.js'); c.experimental.cpus = 1; c.experimental.webpackBuildWorker = true; require('next/dist/build').default(process.cwd()).then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })"
```

O Windows deste host registrou esgotamento de memória virtual durante a compilação cumulativa do Next dev. A execução completa de UI no mesmo processo ficou instável. O CI usa seis shards obrigatórios, um spec por runner/processo novo; o resultado `ui` só aprova quando os seis aprovam. Para reproduzir localmente com a mesma limitação, executar em sequência, deixando o Playwright iniciar/parar o seu servidor a cada arquivo:

```powershell
foreach ($specFile in @('agents.spec.ts','new-agent.spec.ts','builder.spec.ts','builder-blocks.spec.ts','knowledge.spec.ts','activity.spec.ts')) {
  pnpm test:ai:ui $specFile
  if ($LASTEXITCODE -ne 0) { throw "Falha na suíte $specFile" }
}
```

São os mesmos 50 casos/asserções, sem retries ou testes pulados. O loop termina em falha se algum spec reprovar; cada execução mantém seu relatório. Não remover um shard para contornar uma falha. O comando único permanece disponível em máquinas com recursos suficientes.

## Preparar homologação, passo a passo

1. Criar um projeto **Supabase separado** para QA. Aplicar as migrations canônicas com o fluxo documentado do projeto, incluindo roles/funções do runtime. Não apontar a suíte para `rqpmoavktzvxfcfsdkcc` nem copiar dados pessoais de produção. O guard local não aceita DSN remota e não deve ser usado para aplicar migrations nesse projeto.
2. Criar organização e loja exclusivas de QA, usuário lojista e perfil correspondente. Conectar por essa conta uma chave OpenRouter de teste e uma chave OpenAI para a ingestão de embeddings; o runtime também exige sua chave de plataforma. Utilizar limites de gasto nas contas dos provedores. O teto do agente não é garantia de teto para as avaliações automáticas.
3. Conectar um número Meta exclusivo de QA à organização/loja, com token válido e destinatário autorizado para testes. Manter esse número sem vínculo a outro agente. Não usar número que atende clientes. A janela de atendimento da Meta deve estar aberta; uma entrada assinada injetada pela suíte não abre por si só a janela real da Meta. Enviar antes uma mensagem real do destinatário autorizado ao número de QA quando necessário.
4. Configurar `ai_runtime_rollout.mode=runtime` somente na organização de QA, pelo procedimento administrativo já existente. O teste valida a flag antes de criar agentes. Confirmar que Auth, REST, Storage e extensões/migrations estão disponíveis.
5. Criar um serviço Render separado aplicando **somente** `render.qa.yaml`; preencher segredos de QA. O session pooler deve ser do Supabase QA, com roles adequadas, e a `ENCRYPTION_KEY` deve ser a mesma do app QA. O nome esperado é `worder-agents-runtime-qa`, `DEPLOY_ENV=staging` e auto-deploy desativado. CI é responsável pelo SHA, sem depender do gate de produção.
6. Criar um projeto Vercel separado chamado `worder-qa`, ligado a este repositório. Preencher apenas os valores QA de `app-staging.env.example` no ambiente Preview. `AGENTS_RUNTIME_URL` aponta ao Render QA e `AGENTS_PREVIEW_TOKEN` é compartilhado somente com ele. Não configurar o check de produção para bloquear esses previews. Disponibilizar o preview ao runner e ao endpoint interno de processamento, conforme a política de acesso do projeto.
7. Criar o environment GitHub `ia-staging` e preencher as variáveis/secrets de `ai-staging.env.example`. `AI_E2E_APP_URL` é uma origem inicial válida; o deploy CI a substitui pela URL exclusiva do preview retornado pela Vercel. Os tokens de deploy pertencem à conta de QA, com o menor acesso disponível. O script recusa o projeto Vercel de produção e exige os dois nomes QA antes de publicar.
8. Publicar a branch/revisão revisada no GitHub e acompanhar o workflow `release`. Ele valida configuração, adquire a trava do staging, solicita deploy do mesmo SHA no Render QA e Vercel QA, aguarda até 15 minutos pelos dois endpoints de saúde e só então faz login e cria fixtures. A trava cobre deploy e jornadas. Outras execuções não podem trocar o runtime enquanto a jornada roda.
9. Executar a primeira homologação e revisar os quatro casos reais, os testes DB/RLS/pipeline e os artefatos antes de ativar a proteção de produção. Falta de configuração, revisão antiga, produção, falha, cancelamento, testes pulados ou zero testes não aprovam o resultado agregado.

O preflight pode ser executado manualmente com `pnpm test:ai:preflight`. Depois, `pnpm test:ai:journeys` usa os mesmos guardas. Não carregar `.env.vercel` nesses comandos. Não executar `deploy-ai-staging.mjs` fora do workflow: a entrega da URL do preview requer `GITHUB_ENV` e a trava do GitHub.

As jornadas reais injetam um envelope Meta com assinatura válida no webhook canônico. Verificam mensagens persistidas, fato de 37/83 dias, fonte recuperada, revisão, transferência e recibo de aceitação `wamid` da Meta. Isso prova a aceitação de envio pela API; **não prova leitura/entrega no aparelho**, e não automatiza uma conversa de aparelho real. Lacuna automática é provocada retirando temporariamente a relação de leitura da fonte criada pela própria execução; depois a relação é restaurada e a nota é reindexada.

A suíte usa somente o destinatário QA configurado. Pausa/exclui os agentes e fontes que criou, remove a entrada desse agente e restaura o estado inicial do bot do destinatário. Histórico/contato QA ficam disponíveis para diagnóstico. Falha de limpeza também reprova o teste. Avaliações e mensagens reais geram consumo dos serviços.

## Ativar a proteção de produção após a primeira execução verde

1. GitHub: exigir o check **Release readiness**, da aplicação GitHub Actions, nas regras da branch de produção. Impedir merge com check ausente ou reprovado; conferir as permissões de bypass conforme a política da equipe.
2. Vercel de produção: configurar `Release readiness` como Deployment Check obrigatório no projeto de produção, e validar em um candidato controlado que ele aguarda o check. Apenas o YAML do GitHub não configura esse painel. Não confundir o projeto `worder-qa` com `worder1`.
3. Render de produção: aplicar/revisar `autoDeployTrigger: checksPass` do `render.yaml` e verificar no dashboard o comportamento real. O agregador sempre existe e reprova dependências puladas/canceladas; isso é necessário porque o Render aceita checks neutros/pulados como aprovados em sua política nativa.
4. Demonstrar com um commit de teste que uma asserção que falha bloqueia a promoção/publicação nos dois provedores. Reverter a falha deliberada e verificar o novo SHA verde. Guardar os links dos runs/deploys como evidência de ativação.

Referências oficiais: [Deployment Checks da Vercel](https://vercel.com/docs/deployment-checks), [API de deployment Vercel](https://vercel.com/docs/rest-api/deployments/create-a-new-deployment), [deploy de um commit no Render](https://api-docs.render.com/reference/create-deploy), [auto-deploy no Render](https://render.com/docs/deploys), [schema Blueprint](https://render.com/docs/blueprint-spec).

## Diagnóstico

Os artefatos de UI/jornadas são publicados por SHA/run em `test-results/` e `playwright-report/`; localmente são ignorados pelo Git. UI simulada preserva trace em falha. Homologação desliga trace/vídeo para não registrar sessão e credenciais reais; screenshots contêm somente dados QA. Os scripts não imprimem tokens nem corpos das respostas dos provedores. Não anexar arquivos `.env`, tokens ou dumps de ambiente aos relatórios.

Se o engine não responder em execuções futuras, resolver a inicialização do Desktop/WSL e repetir o executor descartável. Não remover volumes de outros projetos para liberar o ambiente. Um CI verde futuro pode complementar a evidência local, mas precisa ser observado; a existência do workflow não equivale à execução dele.
