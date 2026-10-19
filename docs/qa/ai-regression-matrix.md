# Matriz de aceitação — suíte IA

Referência: cópia literal de plano-testes-ia.html (hash conferido com o original). Os resultados abaixo distinguem interface com API simulada, handlers reais com I/O substituído, unidades do runtime e integrações que ainda não executaram. Uma asserção de tela não prova persistência no banco nem entrega pela Meta.

**Evidência local:** 3091 testes do app aprovados; 3 casos opcionais da base pulados; 2.245 unidades Python aprovadas; 50 casos de navegador aprovados em seis processos novos. Os títulos exatos e arquivos estão nos registros B/T abaixo. Python P01: 44 casos de paridade aprovados, incluídos nas 2.245 unidades. Relatórios locais: test-results/ai-vitest-final.json e test-results/ai-ui/bounded-2026-10-16-case-results.json.

**Banco local aprovado:** 1.202 casos em 83 arquivos, com zero falhas/erros/skips: 1.157 de banco (incluindo 148 de RLS) e 45 de pipeline. Dois lotes aprovados de 426 e 776 casos, com replay canônico e limpeza próprios. Inventário, contagem por função/parâmetros e hashes conferidos em `test-results/ai-db-verification.json`. Após o primeiro lote, mudou somente uma função independente de expectativa de política, fora dos seus arquivos; o segundo lote foi refeito inteiro. Produção, helpers e fixtures compartilhadas permaneceram idênticos. A evidência usa alvos explícitos no checkout sem commit (`scope=focal`); não equivale ao gate de um SHA commitado.

**Pendente:** QA ainda não existe; as quatro jornadas reais foram descobertas, mas a execução foi recusada no preflight sem escrever dados. A proteção de produção está preparada no código e não foi ativada nos provedores. Ver ai-regression-runbook.md.

**Verificação posterior focal:** tipos aprovados e 59 testes de histórico/rotas aprovados novamente após substituir quatro projeções dinâmicas por literais equivalentes, sem alterar as colunas consultadas. A revisão independente confirmou equivalência 4/4. Os testes focais já estão incluídos nos totais acima. Políticas de CI: 44 aprovadas; Ruff limpo e quatro contratos de importação preservados.

**Build:** produção aprovada (exit 0), lint/tipos habilitados, 153 páginas estáticas geradas, otimizações e traces concluídos. Para respeitar a memória do host, a verificação usou um worker de páginas e compiladores isolados apenas em memória; o comando/configuração padrão do CI não foi alterado. O aviso herdado de `useEffect` em `ChatPanel.tsx:452` está registrado no runbook. A primeira tentativa que esgotou memória não é apresentada como aprovada.

| ID | Comportamento | Camadas previstas | Evidência e situação |
|---|---|---|---|
| IA-01 | Linha do agente | tela | B10, B12. **Local aprovado** |
| IA-02 | “Onde atua” | unit | B10, T01. **Local aprovado** |
| IA-03 | Situação | unit | B10. **Local aprovado** |
| IA-04 | Números de 7 dias | unit · tela | B10, T02. **Local aprovado** |
| IA-05 | Lista vazia | tela | B11. **Local aprovado** |
| IA-06 | Cartão de modelo | unit · tela | B48, T03, T04. **Local aprovado** |
| IA-07 | Copiar agente | unit · api | B49, T04. **Local aprovado** |
| IA-08 | Fontes sugeridas | unit | B49, B50, T03. **Local aprovado** |
| IA-09 | Criar e abrir editor | api · tela | B49, B50, T03, T04. **Local aprovado** |
| IA-10 | Adaptação dos modelos | paridade | T05, P01. **Local aprovado** |
| IA-11 | Salvar | tela · e2e | B24, B25, B26, T06, E01 pendente. **Local aprovado; E2E pendente** |
| IA-12 | Fechar | tela | B21, B22. **Local aprovado** |
| IA-13 | Desfazer e refazer | unit · tela | B24, T09. **Local aprovado** |
| IA-14 | Renomear | tela | B24. **Local aprovado** |
| IA-15 | Ativo | unit · api · e2e | B27, T07, E01 pendente. **Local aprovado; E2E pendente** |
| IA-16 | Diagnosticar | unit · tela | B28, T08. **Local aprovado** |
| IA-17 | Métricas | tela | B28, T08. **Local aprovado** |
| IA-18 | Histórico | api · tela | B28, T06, E01 pendente. **Local aprovado; E2E pendente** |
| IA-19 | Testar | api · tela · e2e | B29, B30, T17, E01 pendente. **Local aprovado; E2E pendente** |
| IA-20 | Paleta | tela | B31, T09. **Local aprovado** |
| IA-21 | Agente · voz | unit · paridade · tela | B13, T05, T06, P01. **Local aprovado** |
| IA-22 | Agente · apresentação | unit · paridade | B13, T05, T06, P01. **Local aprovado** |
| IA-23 | Agente · modelo | api · tela | B13, B14, T14. **Local aprovado** |
| IA-24 | Agente · chave | unit | B13, B15, T10. **Local aprovado** |
| IA-25 | Agente · limite | unit · tela | B13, T02, T06, P01. **Local aprovado** |
| IA-26 | Entrada · WhatsApp | api · tela | B16, B23, T16. **Local aprovado** |
| IA-27 | Entrada · toque de fluxo | unit · tela | B19, T09. **Local aprovado** |
| IA-28 | Fonte | api · tela | B17, B18, B19, T09, T14. **Local aprovado** |
| IA-29 | Ferramenta · cupom | unit · tela | B19, T08, T09, P01. **Local aprovado** |
| IA-30 | Adaptação | paridade · unit | B20, T05, T06, T09, P01. **Local aprovado** |
| IA-31 | Limites | unit · paridade | B20, T05, T21, P01. **Local aprovado** |
| IA-32 | Revisão | unit · paridade | B20, T05, P01. **Local aprovado** |
| IA-33 | Precisa de uma pessoa? | unit · paridade | B20, T05, T21, P01. **Local aprovado** |
| IA-34 | Transferir · destino | unit · paridade · e2e | B20, T05, P01, E03 pendente. **Local aprovado; E2E pendente** |
| IA-35 | Transferir · mensagem | paridade | B20, T05, T21, P01. **Local aprovado** |
| IA-36 | Enviar resposta | unit · paridade | B20, T05, T20, P01. **Local aprovado** |
| IA-37 | Números dos blocos | unit | T08, T09. **Local aprovado** |
| IA-38 | Edição da nota | tela · api | B32, B33, T13. **Local aprovado** |
| IA-39 | Renomear | unit · api | B34, T11, T13. **Local aprovado** |
| IA-40 | Lida por | api · tela | B34, T13, T14. **Local aprovado** |
| IA-41 | Link para nota que não existe | tela | B35, T13. **Local aprovado** |
| IA-42 | Detalhes | unit · api | B36, T11, T14. **Local aprovado** |
| IA-43 | Links e Estrutura | unit · tela | B36, T11. **Local aprovado** |
| IA-44 | Testar | api · tela | B37, B38, B39, B40, T13. **Local aprovado** |
| IA-45 | Lacunas | unit · api · tela | B41, T11, T14, T15. **Local aprovado** |
| IA-46 | Grafo | unit · tela | B42, T11. **Local aprovado** |
| IA-47 | Importar | api · tela | B43, B44, B45, B46, T12, T13, T22. **Local aprovado** |
| IA-48 | Ctrl K e busca | tela | B47. **Local aprovado** |
| IA-49 | Período e agente | api · tela | B01, T14, T18. **Local aprovado** |
| IA-50 | Comparar | unit | B02, T19. **Local aprovado** |
| IA-51 | Abas do gráfico | unit · tela | B02, T18, T19. **Local aprovado** |
| IA-52 | Valores em R$ | unit · api | B03, B04, B05, T02, T14, T18. **Local aprovado** |
| IA-53 | Tabela por agente | unit · tela | B01, T18. **Local aprovado** |
| IA-54 | Qualidade | unit · api | B03, T14, T18, T19. **Local aprovado** |
| IA-55 | Exportar CSV | api | B06, T14, T18. **Local aprovado** |
| IA-56 | Alertas | api · tela | B07, T14. **Local aprovado** |
| IA-57 | Registro | api · tela | B08, B09, T14. **Local aprovado** |
| IA-58 | Paridade de configurações | paridade | T05, P01. **Local aprovado** |
| IA-59 | Entrada no desfecho | db | D01/D02 — aprovados em banco descartável. **DB local aprovado** |
| IA-60 | Jornada: criar e ativar | e2e | E01 pendente. **Pendente DB/E2E** |
| IA-61 | Jornada: transferência | e2e | E03/E04 pendentes. **Pendente DB/E2E** |
| IA-62 | Jornada: lacuna | e2e | E02 pendente. **Pendente DB/E2E** |

## Registro de navegador — B

Comando por arquivo: `pnpm test:ai:ui <spec>`. Cada shard usa app Next dev real, Chrome instalado e fixture mutável/estrita por contexto; zero retries/skips. Os seis shards correspondem ao CI e o teste de política compara recursivamente o inventário de specs com a matriz obrigatória. A prova por cenário pode ter várias asserções no mesmo caso; não somar referências repetidas como testes distintos.

| Ref | Arquivo | Nome exato do caso aprovado |
|---|---|---|
| B01 | tests/ai-ui/activity.spec.ts | IA-49 IA-53 period and agent filters agree in summary, chart, table and events |
| B02 | tests/ai-ui/activity.spec.ts | IA-50 IA-51 compare toggles deltas; all seven metrics change requests and stack only sums |
| B03 | tests/ai-ui/activity.spec.ts | IA-52 IA-54 BRL table derives cost and return; quality uses store criterion name |
| B04 | tests/ai-ui/activity.spec.ts | IA-52 zero or absent cost (0) shows no infinite return |
| B05 | tests/ai-ui/activity.spec.ts | IA-52 zero or absent cost (null) shows no infinite return |
| B06 | tests/ai-ui/activity.spec.ts | IA-55 CSV export carries selected period and agent |
| B07 | tests/ai-ui/activity.spec.ts | IA-56 alerts poll with controlled clock and acknowledge/resolve persist |
| B08 | tests/ai-ui/activity.spec.ts | IA-57 event kind filters customer row and opens matching Inbox contact |
| B09 | tests/ai-ui/activity.spec.ts | IA-57 Inbox without contact keeps manual conversation selection |
| B10 | tests/ai-ui/agents.spec.ts | IA-01 IA-02 IA-03 IA-04 agent rows derive status, channels and BRL totals and open Builder |
| B11 | tests/ai-ui/agents.spec.ts | IA-05 empty list offers creation |
| B12 | tests/ai-ui/agents.spec.ts | IA-01 legacy agent route redirects to Builder |
| B13 | tests/ai-ui/builder-blocks.spec.ts | IA-21 IA-22 IA-23 IA-24 IA-25 identity controls change help and persist voice, presentation, model, BRL cap and unlimited |
| B14 | tests/ai-ui/builder-blocks.spec.ts | IA-23 model provider outage falls back to selectable short list |
| B15 | tests/ai-ui/builder-blocks.spec.ts | IA-24 key display uses the agent provider and never another provider credential |
| B16 | tests/ai-ui/builder-blocks.spec.ts | IA-26 occupied WhatsApp rejects binding and Edit opens missions |
| B17 | tests/ai-ui/builder-blocks.spec.ts | IA-28 source preview distinguishes empty and processing (false) |
| B18 | tests/ai-ui/builder-blocks.spec.ts | IA-28 source preview distinguishes empty and processing (true) |
| B19 | tests/ai-ui/builder-blocks.spec.ts | IA-27 IA-28 IA-29 flow mission and source reader removal preserve shared note; coupon removal stays draft |
| B20 | tests/ai-ui/builder-blocks.spec.ts | IA-30 IA-31 IA-32 IA-33 IA-34 IA-35 IA-36 block controls submit runtime keys and delivery explanations change |
| B21 | tests/ai-ui/builder.spec.ts | IA-12 clean close navigates directly |
| B22 | tests/ai-ui/builder.spec.ts | IA-12 dirty close Cancel preserves draft; Sair discards without PATCH |
| B23 | tests/ai-ui/builder.spec.ts | IA-26 WhatsApp removal Cancel sends no DELETE; Confirmar deletes once and survives reload |
| B24 | tests/ai-ui/builder.spec.ts | IA-11 IA-13 IA-14 save creates version, rename survives reload, undo/redo reset |
| B25 | tests/ai-ui/builder.spec.ts | IA-11 isolated adaptation saves a version and survives reload (simulated API) |
| B26 | tests/ai-ui/builder.spec.ts | IA-11 isolated presentation saves a version and survives reload (simulated API) |
| B27 | tests/ai-ui/builder.spec.ts | IA-15 pause Cancel preserves active; confirm persists; activation opens checklist |
| B28 | tests/ai-ui/builder.spec.ts | IA-16 IA-17 IA-18 diagnostics selects block, metrics toggle and history restore Cancel/confirm |
| B29 | tests/ai-ui/builder.spec.ts | IA-19 Playground sends unsaved draft and scenario, never PATCHes the agent |
| B30 | tests/ai-ui/builder.spec.ts | IA-19 blocked Playground response exposes reviewer failure and hides rejected reply |
| B31 | tests/ai-ui/builder.spec.ts | IA-20 palette filters and agent selector navigates |
| B32 | tests/ai-ui/knowledge.spec.ts | IA-38 autosave uses controlled clock, shows saving/saved, persists reload and reports API errors |
| B33 | tests/ai-ui/knowledge.spec.ts | IA-38 synchronized source is read only |
| B34 | tests/ai-ui/knowledge.spec.ts | IA-39 IA-40 rename rewrites links; readers affect only selected note and agent |
| B35 | tests/ai-ui/knowledge.spec.ts | IA-41 missing wiki link creates titled note and opens editor |
| B36 | tests/ai-ui/knowledge.spec.ts | IA-42 IA-43 usage outcomes, backlink destination and heading navigation |
| B37 | tests/ai-ui/knowledge.spec.ts | IA-44 knowledge test credential checks request and resulting action |
| B38 | tests/ai-ui/knowledge.spec.ts | IA-44 knowledge test missing checks request and resulting action |
| B39 | tests/ai-ui/knowledge.spec.ts | IA-44 knowledge test rule checks request and resulting action |
| B40 | tests/ai-ui/knowledge.spec.ts | IA-44 knowledge test source checks request and resulting action |
| B41 | tests/ai-ui/knowledge.spec.ts | IA-45 gap append opens suggested note in edit; create and health limit resolve correct gaps |
| B42 | tests/ai-ui/knowledge.spec.ts | IA-46 graph renders note/link/reader sets and filters without coordinate assertions |
| B43 | tests/ai-ui/knowledge.spec.ts | IA-47 import Documento persists and enforces required readers |
| B44 | tests/ai-ui/knowledge.spec.ts | IA-47 import Página da loja persists and enforces required readers |
| B45 | tests/ai-ui/knowledge.spec.ts | IA-47 import Perguntas e respostas persists and enforces required readers |
| B46 | tests/ai-ui/knowledge.spec.ts | IA-47 import Texto persists and enforces required readers |
| B47 | tests/ai-ui/knowledge.spec.ts | IA-48 Ctrl K opens commands; one character does not query, two query and highlight |
| B48 | tests/ai-ui/new-agent.spec.ts | IA-06 templates change areas, missions, tools and rules |
| B49 | tests/ai-ui/new-agent.spec.ts | IA-07 IA-08 IA-09 copy selects its sources, excludes mission ownership and creates draft at returned ID |
| B50 | tests/ai-ui/new-agent.spec.ts | IA-08 IA-09 template creation sends selected sources and template ID |

## Registro de handlers/unidades do app — T

Comando global: `pnpm test --maxWorkers=1 --minWorkers=1`. As rotas e funções de produção executam; Supabase/rede/segredos são substituídos nos testes de contrato. Isso não equivale a DB/RLS real. Títulos abaixo vêm do relatório executado, não da leitura dos nomes nos fontes.

### T01 — src/components/ai-hub/AiShell.test.ts

- whereItActs resume número e fluxos como a lista do protótipo

### T02 — src/lib/ai/__tests__/brl.test.ts

- brl (formato do protótipo) separa milhar e usa vírgula
- brl (formato do protótipo) valor ausente vira zero
- brl (formato do protótipo) num e pct
- usdToBrlRate usa a cotação mais recente
- usdToBrlRate cai na reserva sem linha ou com erro
- usdToBrlRate converte

### T03 — src/lib/ai/__tests__/template-selection.test.ts

- IA-08 vendas-whatsapp suggests by kind or subject and leaves unrelated notes unchecked
- IA-08 pos-compra suggests by kind or subject and leaves unrelated notes unchecked
- IA-08 recuperacao suggests by kind or subject and leaves unrelated notes unchecked
- IA-06 area preview removes controls absent from a draft template
- IA-06/09 template review criteria become active independent judges with stable IDs

### T04 — src/app/api/ai/agents/creation-regression.test.ts

- IA-06/09 template 'vendas-whatsapp' saves its actual rules/adaptation and only its allowed mission families
- IA-06/09 template 'pos-compra' saves its actual rules/adaptation and only its allowed mission families
- IA-06/09 template 'recuperacao' saves its actual rules/adaptation and only its allowed mission families
- IA-07/09 copy preserves configuration and only owned sources, while creating no mission ownership
- IA-07 foreign copy is rejected before insertion

### T05 — src/lib/ai/__tests__/hub-configuration-parity.test.ts

- IA-21/22/30–36/58: Construtor → contrato real do runtime escreve todos os controles em colunas/chaves que o Python consome
- IA-21/22/30–36/58: Construtor → contrato real do runtime relê os valores salvos sem substituí-los pelos defaults
- IA-21/22/30–36/58: Construtor → contrato real do runtime IA-21: persiste e relê a voz casual
- IA-21/22/30–36/58: Construtor → contrato real do runtime IA-21: persiste e relê a voz friendly
- IA-21/22/30–36/58: Construtor → contrato real do runtime IA-21: persiste e relê a voz professional
- IA-21/22/30–36/58: Construtor → contrato real do runtime IA-21: persiste e relê a voz luxury
- IA-21/22/30–36/58: Construtor → contrato real do runtime IA-22: persiste e relê a apresentação transparente
- IA-21/22/30–36/58: Construtor → contrato real do runtime IA-22: persiste e relê a apresentação nome_funcao
- IA-21/22/30–36/58: Construtor → contrato real do runtime IA-22: persiste e relê a apresentação discreta
- IA-21/22/30–36/58: Construtor → contrato real do runtime IA-30: desligar mirror_tone não altera os outros ajustes
- IA-21/22/30–36/58: Construtor → contrato real do runtime IA-30: desligar mirror_length não altera os outros ajustes
- IA-21/22/30–36/58: Construtor → contrato real do runtime IA-30: desligar emoji_if_client não altera os outros ajustes
- IA-21/22/30–36/58: Construtor → contrato real do runtime IA-30: desligar insist_less_after_complaint não altera os outros ajustes
- IA-21/22/30–36/58: Construtor → contrato real do runtime IA-30: desligar distinct_greeting_repeat_buyer não altera os outros ajustes
- IA-21/22/30–36/58: Construtor → contrato real do runtime IA-36: debounce 1 chega ao consumidor do webhook como 3 segundos
- IA-21/22/30–36/58: Construtor → contrato real do runtime IA-36: debounce 3 chega ao consumidor do webhook como 3 segundos
- IA-21/22/30–36/58: Construtor → contrato real do runtime IA-36: debounce 37 chega ao consumidor do webhook como 37 segundos
- IA-21/22/30–36/58: Construtor → contrato real do runtime IA-36: debounce 60 chega ao consumidor do webhook como 60 segundos
- IA-21/22/30–36/58: Construtor → contrato real do runtime IA-36: debounce 90 chega ao consumidor do webhook como 60 segundos
- IA-21/22/30–36/58: Construtor → contrato real do runtime IA-58: remover listas, juiz e teto não ressuscita configuração antiga
- IA-10: modelos reais não gravam vocabulário desconhecido 'vendas-whatsapp' tem todas as configurações propagadas pelo hub
- IA-10: modelos reais não gravam vocabulário desconhecido 'pos-compra' tem todas as configurações propagadas pelo hub
- IA-10: modelos reais não gravam vocabulário desconhecido 'recuperacao' tem todas as configurações propagadas pelo hub

### T06 — src/lib/ai/__tests__/versions-save-restore.test.ts

- IA-11/18 actual PATCH saves, versions and restores isolated name
- IA-11/18 actual PATCH saves, versions and restores isolated presentation_mode
- IA-11/18 actual PATCH saves, versions and restores isolated client_adaptation
- IA-11/18 actual PATCH saves, versions and restores isolated model
- IA-11/18 actual PATCH saves, versions and restores isolated monthly_cap_usd
- PUT captures the same actual top-level settings; unchanged save creates no version
- legacy versions restore their recorded fields without erasing later top-level configuration
- version metadata cannot overwrite identity or arbitrary database columns

### T07 — src/lib/ai/__tests__/agent-readiness.test.ts

- computeReadiness fica verde com chave, missão, caminho para humano e avaliação sem Grave
- computeReadiness bloqueia sem chave
- computeReadiness bloqueia sem missão
- computeReadiness bloqueia sem handoff
- computeReadiness palavras de handoff bastam no lugar da ferramenta
- computeReadiness avaliação (protótipo): obrigatória; nunca rodada e Grave bloqueiam, nota baixa é aviso
- computeReadiness entrada ausente é aviso, não bloqueio
- AGENT_TEMPLATES todo modelo tem handoff e ao menos uma família de missão
- AGENT_TEMPLATES findAgentTemplate aceita só ids conhecidos
- áreas e cartão "O que vem pronto" conta as áreas que o modelo preenche, sem conhecimento nem motor
- áreas e cartão "O que vem pronto" ferramentas no cartão ficam sem as que todo agente tem; juízes viram critérios ativos
- suggestSources marca por tipo e por nome, nunca tudo

### T08 — src/lib/ai/__tests__/block-metrics.test.ts

- blockMetrics números por bloco a partir dos desfechos e das chamadas de ferramenta
- blockMetrics com várias entradas não atribui números do agente a uma só
- blockMetrics com outcome.entry_id, cada número de WhatsApp conta as suas conversas
- diagnose (formato do protótipo) agente saudável: só itens ok
- diagnose (formato do protótipo) cada problema aponta o bloco certo e traz título e explicação
- diagnose (formato do protótipo) trava dupla completa vira item ok no bloco da ferramenta

### T09 — src/lib/ai/__tests__/builder-model.test.ts

- deriveModel entradas no texto do protótipo
- deriveModel conhecimento só com o que o agente lê
- deriveModel ferramentas, cupom com trava
- deriveModel blocos fixos e agente em R$
- edições voltam como HubState voz, adaptação, limites, critérios, ferramentas
- layout2 (números do protótipo) agente centralizado, colunas laterais e ramos finais
- layout2 (números do protótipo) nenhum bloco da coluna central se sobrepõe
- layout2 (números do protótipo) alvos de soltura existem no desenho
- paleta, caminho e diagnóstico paleta marca o que já está no agente
- paleta, caminho e diagnóstico caminho da resposta e bloqueio na revisão
- paleta, caminho e diagnóstico diagnóstico aponta o bloco

### T10 — src/lib/ai/provider-key-check.test.ts

- hasActiveProviderKey (Onda 13 / P1-1) true quando existe chave ativa do provider
- hasActiveProviderKey (Onda 13 / P1-1) false quando nao existe chave
- hasActiveProviderKey (Onda 13 / P1-1) payload do 400 tem code + provider + mensagem acionavel

### T11 — src/lib/ai/knowledge/__tests__/notes.test.ts

- buildTree agrupa por pasta com "geral" primeiro e notas por nome
- renameLinks reescreve [[Antigo]] e [[Antigo\|rótulo]] sem tocar em outros títulos
- appendAnswer / noteFromGap acrescenta uma seção com resposta pronta que o parser reconhece
- backlinks acha quem aponta para o título
- backlinks traz o trecho em volta da menção
- usageByDay conta por dia as buscas que devolveram a nota
- usesBySource conta uma vez por busca, mesmo com vários trechos da mesma fonte
- suggestNoteForGap prefere o título, usa tags e texto, e pula notas sincronizadas

### T12 — src/lib/ai/knowledge/__tests__/csv.test.ts

- parseCsv lê aspas, aspas escapadas, quebras dentro de aspas e ponto e vírgula
- qaRowsFromCsv usa o cabeçalho quando existe e ignora linhas incompletas
- qaRowsFromCsv sem cabeçalho, usa as duas primeiras colunas
- faqMarkdown gera uma seção com resposta pronta por pergunta, que vira chunk "resposta"

### T13 — src/app/api/ai/knowledge/regression.test.ts

- knowledge edit rejects missing session before database/provider I/O
- knowledge read rejects missing session before database/provider I/O
- knowledge create rejects missing session before database/provider I/O
- knowledge ask rejects missing session before database/provider I/O
- knowledge csv rejects missing session before database/provider I/O
- IA-38 actual autosave persists Markdown, parsed links and pending processing in the current organization
- IA-38 synchronized notes reject content writes and foreign notes are 404
- IA-39 rename rewrites exact wiki targets and retains aliases in other owned notes
- IA-41 note creation links only owned readers and starts real processing boundary
- IA-44 knowledge ask returns actual text retrieval metadata with source provenance
- IA-44 knowledge ask returns actual regra retrieval metadata with source provenance
- IA-44 knowledge ask returns actual resposta retrieval metadata with source provenance
- IA-44 retrieval miss returns no invented answer
- IA-44 missing OpenAI key and foreign agent fail before embedding/search
- IA-47 CSV import faq creates parsed notes and only owned reader relations
- IA-47 CSV import notes creates parsed notes and only owned reader relations
- IA-47 CSV import rejects foreign readers before creating any source
- IA-47 page import persists its owned URL and processes on the immutable candidate origin
- IA-47 foreign page reader is rejected before source insertion or processing
- IA-47 document import scopes storage and source rows and processes on the candidate revision
- IA-47 document import rejects another organization’s reader before storage or rows

### T14 — src/app/api/ai/regression-routes.test.ts

- IA regression — authorization before any database access rejects unauthenticated route 0 without reads or writes
- IA regression — authorization before any database access rejects unauthenticated route 1 without reads or writes
- IA regression — authorization before any database access rejects unauthenticated route 2 without reads or writes
- IA regression — authorization before any database access rejects unauthenticated route 3 without reads or writes
- IA regression — authorization before any database access rejects unauthenticated route 4 without reads or writes
- IA regression — authorization before any database access rejects unauthenticated route 5 without reads or writes
- IA regression — authorization before any database access rejects unauthenticated route 6 without reads or writes
- IA regression — authorization before any database access rejects unauthenticated route 7 without reads or writes
- IA regression — authorization before any database access rejects unauthenticated route 8 without reads or writes
- IA-49 IA-55 IA-57 — Activity route filters CSV applies the requested agent, period and organization to the actual outcome query
- IA-49 IA-55 IA-57 — Activity route filters CSV reports database failures instead of downloading a successful empty export
- IA-49 IA-55 IA-57 — Activity route filters the event log uses the same period and agent as the dashboard and resolves contact names in the same organization
- IA-49 IA-55 IA-57 — Activity route filters the event log rejects a database error
- IA-21 IA-22 IA-30 IA-58 — the actual save route preserves builder configuration writes presentation and adaptation instead of silently dropping two runtime controls
- IA-42 — knowledge usage comes from retrieval and actual outcomes a note outside the organization cannot expose tools or conversations
- IA-42 — knowledge usage comes from retrieval and actual outcomes returns only questions that retrieved this source, with transfer from outcomes
- IA-28 IA-40 IA-44 IA-45 — readers and manual knowledge gaps refuses a reader from another organization before replacing any reader
- IA-28 IA-40 IA-44 IA-45 — readers and manual knowledge gaps removing all readers only deletes this organization/source relationship, never the source
- IA-28 IA-40 IA-44 IA-45 — readers and manual knowledge gaps does not write an empty manual gap
- IA-28 IA-40 IA-44 IA-45 — readers and manual knowledge gaps does not attach a manual gap to another organization’s agent
- IA-28 IA-40 IA-44 IA-45 — readers and manual knowledge gaps persists a manual gap under the authenticated organization with normalized question
- IA-56 — alert state changes are scoped and persistent writes acknowledged only to the authenticated organization
- IA-56 — alert state changes are scoped and persistent writes resolved only to the authenticated organization
- IA-56 — alert state changes are scoped and persistent refuses invalid status without a write
- IA-56 — alert state changes are scoped and persistent returns 404 for an alert not found within the organization
- IA-23 — model catalogue normalizes third party output and degrades safely does not contact the provider before authorization
- IA-23 — model catalogue normalizes third party output and degrades safely maps text models, pricing per million and drops image-only output
- IA-23 — model catalogue normalizes third party output and degrades safely provider outage returns a usable empty catalogue with an error for the UI fallback

### T15 — src/app/api/ai/knowledge/gaps/[id]/resolve/route.test.ts

- POST /api/ai/knowledge/gaps/[id]/resolve ação desconhecida é 400
- POST /api/ai/knowledge/gaps/[id]/resolve ignorar some por 30 dias
- POST /api/ai/knowledge/gaps/[id]/resolve adicionar aos limites grava o assunto nos agentes da lacuna
- POST /api/ai/knowledge/gaps/[id]/resolve criar fonte gera nota com resposta pronta, lida pelos agentes da lacuna
- POST /api/ai/knowledge/gaps/[id]/resolve criar fonte sem resposta é 400

### T16 — src/app/api/ai/agents/[id]/entries/route.test.ts

- POST /api/ai/agents/[id]/entries liga o número ao agente
- POST /api/ai/agents/[id]/entries o número que já tem agente devolve 409 com o nome do dono
- POST /api/ai/agents/[id]/entries repetir para o mesmo agente é idempotente
- POST /api/ai/agents/[id]/entries conta de outra org é 404
- POST /api/ai/agents/[id]/entries kind fora do vocabulário é 400

### T17 — src/app/api/ai/agents/[id]/simulate/route.test.ts

- POST /api/ai/agents/[id]/simulate encaminha com a org da sessão e devolve o trace
- POST /api/ai/agents/[id]/simulate agente de outra org é 404 e não chama o runtime
- POST /api/ai/agents/[id]/simulate sem runtime configurado é 503 com o motivo
- POST /api/ai/agents/[id]/simulate 422 do runtime (sem chave, agente inexistente) passa adiante

### T18 — src/lib/ai/__tests__/activity-summary.test.ts

- computeKpis os dez KPIs a partir dos desfechos
- computeKpis sem conversas tudo zera sem dividir por zero
- buildSeries (taxas) resolvidas em % e 1ª resposta em segundos, por balde e por agente
- buildSeries por dia no fuso da loja, empilhado por agente
- buildSeries por hora no período de um dia
- agregados tabela por agente, funil, assuntos, incentivos, qualidade
- agregados mapa de calor 7×24 no fuso
- agregados delta contra o período anterior
- agregados CSV escapa vírgulas e aspas

### T19 — src/components/ai-hub/activity/activity-view.test.ts

- activity-view variação como no protótipo: %, p.p., inversa e "novo"
- activity-view motivos de transferência viram o texto do protótipo e se somam
- activity-view critério conhecido, critério da loja e critério desconhecido
- activity-view formatos e eixos
- activity-view mapa de calor começa na segunda

### T20 — src/lib/ai/__tests__/delivery-settings.test.ts

- getDeliveryDebounceSeconds sem agente ou sem delivery, vale o default de 8s
- getDeliveryDebounceSeconds o valor da loja vale, com clamp de 3..60
- getDeliveryDebounceSeconds erro de leitura cai para o default e não envenena o cache
- getDeliveryDebounceSeconds cacheia por org dentro do TTL

### T21 — src/lib/ai/__tests__/guards.test.ts

- normalizeForMatch remove acentos, baixa caixa e trim
- normalizeForMatch string vazia/nula vira vazia
- matchHandoffKeyword casa substring simples e retorna a keyword ORIGINAL
- matchHandoffKeyword case-insensitive
- matchHandoffKeyword acento-insensitive nos DOIS lados
- matchHandoffKeyword retorna null sem match, sem keywords ou texto vazio
- matchHandoffKeyword ignora keywords vazias/whitespace na lista
- matchHandoffKeyword ignora cada keyword não-string e preserva a string original que casa
- findBlockedTopic acha topico bloqueado na resposta (case/acento-insensitive)
- findBlockedTopic null quando resposta limpa ou lista vazia
- isTransferCooldownActive true quando a transferencia foi ha menos de cooldownSeconds
- isTransferCooldownActive false quando o cooldown ja expirou
- isTransferCooldownActive false sem transferredAt (nunca transferiu)
- isTransferCooldownActive cooldownSeconds null/undefined usa default 300
- isTransferCooldownActive cooldown 0 ou negativo desliga a trava
- isTransferCooldownActive data invalida => false (fail-open, nao trava a IA por lixo no banco)
- isTransferCooldownActive booleano legado desliga somente este cooldown
- isWithinSchedule (porte 1:1 de engine.ts:checkSchedule, item 37) sem bloco de schedule => sempre atende
- isWithinSchedule (porte 1:1 de engine.ts:checkSchedule, item 37) always_active ignora hours/days
- isWithinSchedule (porte 1:1 de engine.ts:checkSchedule, item 37) dentro do horário e do dia configurados => true
- isWithinSchedule (porte 1:1 de engine.ts:checkSchedule, item 37) fora do horário configurado => false
- isWithinSchedule (porte 1:1 de engine.ts:checkSchedule, item 37) dia da semana fora da lista => false
- isWithinSchedule (porte 1:1 de engine.ts:checkSchedule, item 37) days: [] nunca bate com dia nenhum => sempre false (fora de always_active)
- isWithinSchedule (porte 1:1 de engine.ts:checkSchedule, item 37) sem hours/days explícitos usa default 08:00-18:00, seg-sex
- isWithinSchedule (porte 1:1 de engine.ts:checkSchedule, item 37) hours parcial (só start, sem fallback pra end) bloqueia em silêncio — igual ao engine.ts original (fix round 1, achado 2)

### T22 — src/lib/ai/processors/file-extractor.integration.test.ts

- file-extractor (integração, libs reais) extrai texto de um PDF mínimo real com pdf-parse
- file-extractor (integração, libs reais) extrai texto de um DOCX mínimo real com mammoth
- file-extractor (integração, libs reais) extrai texto de PDF real (fixture pdfkit) sem acionar fallback
- file-extractor (integração, libs reais) DOCX fixture NÃO seria extraível pelo fallback regex (prova de valor)

## Runtime e camadas ainda não verificadas

- **P01:** `runtime/tests/unit/test_hub_configuration_parity.py`, 44 aprovados; testes `test_ia58_real_reply_producers_use_saved_configuration`, `test_ia58_knowledge_control_reaches_scoped_retrieval_and_generated_prompt`, `test_ia34_saved_destination_routes_only_to_an_active_same_org_agent`, `test_proactive_transfer_stops_remaining_tools_model_and_judge`, além dos casos de voz/apresentação/adaptação/entrega/juízes/cap. Comando: `uv run --directory runtime pytest tests/unit/test_hub_configuration_parity.py -q`. São produtores reais com DB/LLM I/O substituído. Mutações controladas de adaptação e consumo de conhecimento reprovaram antes da restauração.
- **D01:** `runtime/tests/db/test_ai_outcomes.py::TestEntryOfTheTurn::test_record_turn_writes_the_whatsapp_entry` — aprovado no banco descartável com migrations canônicas.
- **D02:** `runtime/tests/db/test_ai_outcomes.py::TestEntryOfTheTurn::test_without_an_entry_it_stays_null` — aprovado na mesma execução. Evidência: `.superpowers/sdd/auditoria-ia-disposable/eae152cd480f41f2bb8aed8e0eae70a7/artifacts/focal.xml`. Executor `scripts/test-disposable-db.ps1` (Prepare/Replay/Test), nunca DSN arbitrária.
- **E01:** `e2e/ai/regression.spec.ts` — `IA-60 create, save, evaluate, activate and deliver an answer grounded in its source`. Inclui versão/restauração persistidas e preview com rascunho não salvo. Não executado em QA.
- **E02:** mesmo arquivo — `IA-62 unanswered question becomes a gap, is answered in a note and retrieves the new source`. Não executado em QA.
- **E03:** mesmo arquivo — `IA-61 model tool routes to an active specialist and falls back to the team when paused`. Não executado em QA.
- **E04:** mesmo arquivo — `IA-61 asking for a person transfers to Inbox and prevents further AI replies`. Abre o contato e verifica mensagem/IA Off, confirmação com recibo Meta e silêncio após novo inbound. Não executado em QA.

Comando E01–E04: `pnpm test:ai:journeys`; o preflight exige app/runtime/DB/organização/número de QA, credenciais e SHA idêntico. O inbound é injetado com HMAC; o outbound precisa de recibo Meta real. Não há prova de entrega/leitura no aparelho.

As colunas de camadas preservam a classificação do documento. Casos triviais de rótulo/estado e histórico de edição também são exercitados diretamente no navegador; não foram criados testes unitários que apenas copiam enums ou a implementação. As referências T agrupam os contratos executados relacionados, sem contar uma referência como prova de todas as integrações daquele cenário.

Os três skips herdados são dois testes opcionais de concorrência com Redis/Upstash real e um gerador de fixtures de bolhas. Não são aprovação dessas integrações, não são IA-59–62 e não substituem nenhuma jornada obrigatória. Os relatórios de browser obrigatórios recusam qualquer skip, retry/flaky ou execução vazia.
