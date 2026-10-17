# Ambiente da suíte IA — inventário de 16/10/2026

## Evidência inicial

- Pasta de trabalho: `D:/worder1`, branch `codex/sync-debug-console-error-FWrLE`, base `5642010368b1e1af56b077abc0c2b6a0c8147e13`.
- Node `22.17.1`, pnpm `11.18.0`, uv `0.11.32`, Python do runtime `3.13.14` e Supabase CLI `2.111.0` disponíveis.
- `uv sync --directory runtime --frozen` e `pnpm install --frozen-lockfile` concluíram. Vite `5.4.21`, já existente transitivamente, foi declarado diretamente para resolver `vite/client` usado por testes existentes; nenhuma versão de pacote foi atualizada. O vínculo final foi validado com instalação congelada/offline.
- Existe um executor de banco descartável com prova de identidade, isolamento de diretório/nonce, migrations canônicas e suíte DB/RLS/pipeline: `scripts/test-disposable-db.ps1` e `runtime/tests/support/disposable_executor.py`.
- A configuração normal Supabase usa portas 54320–54322. O executor descartável usa 45320–45322 e recusa portas ocupadas. Não usa DSN fornecido pelo chamador.
- O compose `runtime/docker-compose.yml` contém perfis bancada/piloto; piloto pode enviar mensagens reais. Ele não será usado para testes descartáveis.
- Há vínculo local com o projeto Vercel `worder1` em `.vercel/repo.json`. Isso não prova quais Deployment Checks estão ativos.
- As variáveis locais auditadas não incluem `E2E_EMAIL`, `E2E_PASSWORD` ou configurações identificadas de staging. Os valores não foram impressos nem copiados.
- A integração Supabase mostrou `Worder CRM`; não foi identificado um projeto separado de homologação Worder. Não foi criado projeto remoto nem alterada produção.

## Histórico da inicialização do Docker local

O Docker Desktop foi iniciado conforme autorização. Entretanto, `docker version` e `docker ps` retornaram que o pipe `dockerDesktopLinuxEngine` não existe. O WSL listou `docker-desktop` como parado, enquanto `docker desktop start` informou que o aplicativo já estava aberto.

Uma tentativa normal de `docker desktop restart --detach --timeout 30` falhou ao parar os processos do Desktop/backend por timeout. Não houve encerramento forçado, exclusão de volumes ou reset da instalação.

Naquela execução, banco e pipeline locais ficaram **não verificados**. Nenhum resultado de teste com mock substitui essa evidência. Depois da confirmação do usuário de que o Docker estava iniciado, o engine 29.6.2 respondeu no contexto `desktop-linux`; a validação descartável foi retomada.

O log do Desktop identificou a causa: `initializing Inference manager`, ao abrir/remover `Docker/run/dockerInference`, com erro de acesso ao endpoint. Trata-se de um reparse point temporário de zero bytes; o comando oficial `docker desktop disable model-runner` também falhou porque o pipe `dockerBackendApiServer` não chegou a existir. Uma tentativa de preservar o endpoint por renomeação, com Desktop/backend parados e caminho/identidade conferidos, retornou erro de acesso; o endpoint não foi alterado. Não foi feito reset nem remoção de arquivo/volume. O log também registrou falta de paginação durante a falha do Desktop.

O usuário confirmou que os ambientes remotos de homologação ainda não existem e pediu preparar a configuração. Foram criados `render.qa.yaml`, templates de variáveis e o roteiro `ai-regression-runbook.md`. Esses arquivos não equivalem a serviços criados. O workflow prepara deploy de QA por SHA apenas depois de receber a configuração exigida; não foram feitas publicações remotas nesta execução.

## Memória e verificação de produção

O Windows registrou o evento 2004 de memória virtual insuficiente durante as execuções cumulativas de Next dev. A suíte de UI foi validada com um processo novo por spec: os mesmos 50 casos passaram, sem skips/retries. O CI usa seis shards obrigatórios e verifica o inventário completo de specs.

A primeira tentativa de build de produção, com `experimental.cpus=1` apenas em memória, compilou com sucesso, mas um worker de lint/tipos encerrou com `Fatal process out of memory: Zone`. O evento 2004 de 19:50:50 registrou o Node desse build usando 2.943.131.648 bytes de memória virtual. O processo principal e seus dois filhos remanescentes foram encerrados; nenhum processo do usuário foi encerrado. A memória virtual livre voltou a cerca de 4,5 GB. Log: `test-results/ai-build-final.log`; essa tentativa não é um build aprovado.

O Next 14.0.4 instalado oferece `experimental.webpackBuildWorker`: executa os três compiladores em processos separados e encerra cada processo antes de avançar. Uma segunda verificação usa essa opção e um worker de páginas somente em memória, com lint/tipos habilitados e variáveis fictícias iguais às do CI. Log separado: `test-results/ai-build-workers-final.log`. O resultado final está registrado no runbook; o comando/configuração padrão do CI permanece sem relaxamento.

Essa segunda execução concluiu com **exit 0**: compilação, lint/tipos, 153 páginas estáticas, otimização e traces. O lint emitiu um aviso herdado em `ChatPanel.tsx:452`; nenhum erro. Isso comprova o build local com isolamento de memória, sem comprovar execução remota de CI, banco, QA ou bloqueio nos provedores.

## Preparação reproduzível do banco existente

Com Docker disponível, executar primeiro `uv sync --directory runtime --frozen`. O executor exige o binário nativo Supabase 2.111.0, não o shim `.cmd`/`.ps1` do npm. Neste Windows, adicionar temporariamente ao `PATH` a pasta `C:/Users/mathe/AppData/Roaming/npm/node_modules/supabase/node_modules/@supabase/cli-windows-x64/bin`, que contém `supabase.exe`. Em PowerShell 7:

```powershell
$runPath = Join-Path $PWD ('.superpowers/sdd/auditoria-ia-disposable/' + [guid]::NewGuid().ToString('N'))
./scripts/test-disposable-db.ps1 -Action Prepare -RunDirectory $runPath
./scripts/test-disposable-db.ps1 -Action Replay -RunDirectory $runPath
./scripts/test-disposable-db.ps1 -Action Test -RunDirectory $runPath
# Parar somente a execução criada acima, depois de guardar suas evidências:
./scripts/test-disposable-db.ps1 -Action Stop -RunDirectory $runPath
```

Em Windows sem PowerShell 7, o mesmo executor pode ser chamado diretamente pelo Python já instalado. Cada ação é validada pelo executor, sem aceitar URL de banco:

```powershell
$runPath = Join-Path $PWD ('.superpowers/sdd/auditoria-ia-disposable/' + [guid]::NewGuid().ToString('N'))
$pythonPath = Join-Path $PWD 'runtime/.venv/Scripts/python.exe'
Push-Location runtime
try {
  foreach ($action in @('Prepare', 'Replay', 'Test')) {
    @{ Action=$action; RunDirectory=$runPath; TestTargets=@(); MigrationThrough=$null } |
      ConvertTo-Json -Compress | & $pythonPath -X utf8 -m tests.support.disposable_executor
    if ($LASTEXITCODE -ne 0) { throw "Falha na etapa $action; consultar a evidência em $runPath" }
  }
} finally { Pop-Location }
```

O executor atual prepara banco/Auth para os gates de runtime, excluindo gateway REST/Storage. Isso não equivale a um Supabase completo para E2E do navegador com login real; essa camada exige configuração própria antes da homologação integrada.

`Test` sem alvos exige uma revisão commitada, incluindo entradas de runtime/migrations. Durante o desenvolvimento, usar `-TestTargets` com a lista explícita de todos os arquivos `tests/db/test_*.py` e `tests/pipeline/test_*.py`. O executor identifica essa execução como `focal`, mesmo quando a lista cobre todos os casos; isso comprova o checkout local, não o gate de um SHA commitado. A ação `Test` também limpa automaticamente os recursos cuja identidade foi comprovada.

O primeiro replay completo revelou `42P01` na migration `20261016000005_runtime_tool_grants.sql`: `contact_activities` e `whatsapp_product_interests` existiam em SQL legado, mas não na cadeia canônica. O bootstrap foi corrigido nessa migration antes dos grants, somente quando as tabelas estão ausentes. Foram preservados os formatos dos escritores CRM/Inbox/runtime, com RLS por organização e permissões específicas; tabelas preexistentes não são reconstruídas. Rollback mantém tabelas com dados; as concessões e políticas do runtime podem ser revogadas separadamente. Os dois arquivos SQL selados não foram alterados por essa correção. Testes de regressão reproduziram a falha antes da correção; o resultado final da execução está no runbook.

A execução também identificou testes anteriores incompatíveis com mudanças já presentes na branch: índice de um agente ativo por organização removido pelo modelo de múltiplos agentes e vetores sintéticos abaixo do limiar de recuperação. Os testes foram atualizados, preservando exclusividade por entrada, pausa independente, ranking/limite, RLS, query exata e medição. O limiar do produto permanece `0.7`; um teste de banco verifica rejeição de similaridade `0.69` e aceitação de `0.71`.

As fixtures de conhecimento também passaram a ligar a fonte ao agente que efetivamente atende a conversa, preservando o filtro por agente. No teste de atribuição, o adaptador psycopg envia `Decimal` para o parâmetro SQL `numeric`, como exige o contrato da RPC. Não foi alterada a assinatura nem a regra de atribuição do produto.

Resultado final: **1.202 aprovados, zero falhas/erros/skips**, em dois lotes de 426/776 e 83 arquivos. Inclui 1.157 casos DB (148 RLS) e 45 pipeline. Ambos os ambientes terminaram em `stopped`, sem falha de limpeza. A primeira rodada única ultrapassou o limite de 600 segundos; a divisão manteve todos os arquivos/casos e o mesmo limite. Artefatos, verificação de inventário/hashes e a reexecução do segundo lote após corrigir uma expectativa independente estão descritos no runbook. Isso resolve o impedimento de banco/pipeline local, sem criar QA remoto ou comprovar o gate de uma revisão commitada.

## Recursos externos necessários

As jornadas reais exigem ambiente separado: app e runtime candidatos, Supabase de teste com Auth/REST e migrations, usuário lojista, credencial LLM e número Meta com destinatário de teste. A revisão de app/runtime deve corresponder ao SHA candidato; um staging antigo não comprova a release nova.

Não usar `.env.vercel` como ambiente de teste. Não preencher lacunas com credenciais ou números de produção. Falta de configuração obrigatória deve reprovar o gate, informando somente os nomes ausentes.
