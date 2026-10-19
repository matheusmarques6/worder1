# Estado por SEC-ID — plano Segurança P0/P1

## Estado atual — 19/10/2026

Branch `security/p0-p1-2026-10-17`, PR
[#10](https://github.com/matheusmarques6/worder1/pull/10). Gates pesados serão
executados no CI remoto por escolha do usuário. Isso substitui a exigência de
concluir cada execução pesada neste computador, não a exigência de gates verdes
antes da promoção. Produção não foi alterada nesta retomada.

| Área | Evidência atual | Pendência |
|---|---|---|
| SEC-01 | Triagem de fixture limitada; 15 achados da árvore classificados como sintéticos/preexistentes | Scanner no candidato remoto e revogação externa da chave histórica |
| SEC-02 | Audit de produção: 0 critical, 0 high, 3 moderate; pnpm/Node alinhados | Revalidar CI do candidato |
| SEC-03/04/06 e SEC-05 | Revisão posterior aprovada, 80 testes focais | Migration hospedada; autorização por número continua com negação conservadora |
| SEC-07 | Revisão aprovada, provas do editor preservadas | Gate global no candidato |
| SEC-08 | Revisão concluída, quatro achados corrigidos e revisão posterior aprovada; 54 testes focais | Gates globais, backfill controlado e verificação hospedada |
| SEC-09 | Configuração externa pendente | Definir KMS; chave compartilhada não é envelope externo |
| SEC-10/11 | Fix revisado; grafo incompleto continua `needs_review` | Não declarar exclusão integral nem conformidade LGPD concluída |
| SEC-17 | Código revisado; 18 testes TS e 45 Python focais | 25 casos reais SQL/repositório/Storage HTTP e rollout da mídia privada |
| SEC-18 | Subset mínimo revisado | Gates completos de runtime/banco e configuração das roles hospedadas |
| Redis | 2/2 reais passaram, gate obrigatório adicionado | Execução remota; caminho proprietário legado não certificado |
| Lint | Sem warnings/erros em 19/10; troca de organização coberta | Gate global no candidato |
| Jornadas | CI anterior reprovou por configuração ausente | Provisionar QA e provar bloqueio da promoção |

Os resultados globais abaixo pertencem ao checkout de 17/10. Não são aprovação
das correções posteriores. O último runtime global teve uma falha de fitness
de fixture depois corrigida; a repetição completa continua pendente. A última
repetição do scanner teve timeouts/erros de cleanup local; não foi declarada verde.
Guardas canônicas de banco ficaram incompletas, com três falhas sem diagnóstico
final. Estes resultados precisam ser esclarecidos nos runners antes da promoção.

Ordem de rollout e detalhes atualizados em
`docs/security/PENDENCIAS-SEGURANCA-P0-P1.md`. Nenhuma dispensa de teste foi criada.

## Registro histórico de 17/10/2026

Fonte: `.superpowers/sdd/2026-10-16-security-p0-p1/progress.md` (ledger com os
números e as decisões) e `docs/superpowers/plans/2026-10-16-security-p0-p1.md`.
Atualizado em 17/10/2026, execução local na branch `codex/sync-debug-console-error-FWrLE`,
base `5642010`, nada commitado.

Os estados são os cinco que o plano pede, e nenhum SEC-ID vira um só
"concluído": **corrigido/testado localmente**, **aplicação de dados pendente**,
**configuração externa pendente**, **validado em QA**, **validado em produção**.
Nenhum item chegou a QA ou produção nesta execução — não houve commit, push,
deploy, rotação de chave ou acesso a dados de produção.

| SEC-ID | O que é | Tarefa | Estado | O que falta |
|---|---|---|---|---|
| SEC-01 | Contenção e prevenção de segredos | 2 | corrigido/testado localmente + configuração externa pendente | Revogar externamente a chave Evolution exposta no histórico git (não é removível por código) e rodar o job de segurança remotamente pela primeira vez |
| SEC-02 | Dependências sem vulnerabilidade | 8 | corrigido/testado localmente | Nada local. `audit --prod` ficou 0 critical / 0 high / 3 moderate; os 3 moderate seguem registrados |
| SEC-03 / SEC-04 / SEC-06 | Senha, MFA e vínculo ativo | 3 | corrigido/testado localmente + aplicação de dados pendente | Aplicar a migration `20261017050140` em ambiente hospedado; revisão independente de Auth concluída, prova em banco observado cobriu 8 casos de identidade |
| SEC-05 | Permissões e conversas de agente | 4 | corrigido/testado localmente, **com restrição deliberada** | O acesso restrito a números específicos **nega** em vez de conferir: `agent_permissions.whatsapp_allowed_numbers` existe, mas nenhuma coluna de `whatsapp_conversations` diz de qual número da empresa a conversa é. Fechar exige migration de vínculo + prova em banco |
| SEC-07 | Editor e preview seguros | 5 | corrigido/testado localmente | Nada local. 13/13 focais + 471 vizinhos, revisão independente sem Critical/Important |
| SEC-08 | Credenciais externas cifradas | 7 | implementado, revisão pendente | Revisão independente de criptografia e gates do pacote (34 arquivos TS + 14 Python) |
| SEC-09 | Envelope externo de chaves | 10 | **bloqueado** | Depende de qual provedor de KMS já existe — pergunta assíncrona sem resposta. A ausência de resposta não autoriza criar conta nem provisionar chave |
| SEC-10 | LGPD — exclusão e exportação | 6 | corrigido/testado localmente | Nada local. GREEN 45 + 198 vizinhos, revisão do fix aprovada |
| SEC-11 | LGPD — grafo de dados verificável | 6 | **parcial** | A fronteira conservadora marca `needs_review` para o grafo não provado. Não tratar como fechado |
| SEC-17 | Mídia privada e isolamento | 9 | implementado, prova em banco pendente | Revisão independente, Storage por HTTP real e SQL real. As 157/157 regressões locais não cobrem a migration de mídia posterior |
| SEC-18 | Runtime mínimo | 10 | **parcial** | Subset provado: 119 unitários + 13 casos de banco preparados. Resto do escopo não executado |

## Gates da Tarefa 11

| Gate | Resultado |
|---|---|
| Unitários do app (`vitest run`) | **verde** — 3472 passed, 3 skipped, 0 failed (3475 casos, 322 arquivos), heap 3072 / maxWorkers 1 |
| `test:ci-policy` | **verde** — 44/44 pass, 0 skipped |
| `typecheck` | **verde** — 0 erros TS, heap 6144 |
| `build` | **verde** — exit 0, compilado em 62s, 153 páginas estáticas. Roda lint e verificação de tipos internamente |
| `test:ai:ui` | **verde** — 50 passed, os 50 casos que o plano manda preservar |
| Runtime: unitários | **verde** — 2273 passed, 1238 deselected |
| Runtime: Ruff | **verde** — 0 erros (eram 55, todos de estilo em dois testes novos) |
| Runtime: import-linter | **verde** — 4 contratos KEPT, 0 broken |
| Banco observado (executor descartável) | **verde no escopo corrido** — 23 casos, 0 falhas/erros/skips; não inclui a migration de mídia posterior |
| `pnpm lint` (`--max-warnings=0`) | **vermelho por 1 warning pré-existente** — `exhaustive-deps` em `ChatPanel.tsx:452`, arquivo idêntico ao do HEAD. Não está entre os gates que a Tarefa 11 lista |
| Revisão independente de criptografia e de mídia | **não feita** — Auth, LGPD e HTML têm relatório; SEC-08 e SEC-17 não |
| Gate de segurança no CI | **não executado remotamente** |
| Jornadas reais e bloqueio remoto | **não executado** — depende de QA provisionado |

Nenhum gate acima foi declarado verde por limite de ambiente convertido em skip.
O typecheck e o build estiveram impedidos por falta de memória do sistema
durante parte da execução; foram executados de verdade depois que a memória
foi liberada, não dispensados.

### Regressões do upgrade Next 14→15 encontradas pelo build

Nenhuma em arquivo que este plano tocou, e em todas a compilação passava — quem
reprovava era a fase de lint/tipos:

1. 5 erros `@next/next/no-html-link-for-pages`: a regra passou a cobrir rotas do
   App Router no `eslint-config-next` 15. `<a href="/...">` → `<Link>` em 4 arquivos.
2. `Duplicate identifier 'Link'` em `AutomationsPanel.tsx`, que já importava o
   ícone `Link` do lucide-react. O import do `next/link` ali virou `NextLink`.
3. `contacts/[id]/orders/route.ts` ainda declarava `params: { id: string }` em vez
   de `Promise<…>` — única rota de `src/app` nessa condição, escapou do codemod.

## Pendências externas que nenhum código fecha

1. **Provedor de KMS** — sem resposta; bloqueia SEC-09.
2. **Autorização específica para inspecionar metadados de produção** — a consulta foi
   recusada pela revisão automática e não foi contornada. SQL revisável em
   `docs/security/production-metadata-inspection.sql`.
3. **Revogação da chave Evolution** exposta no histórico git — exposição histórica
   permanece até revogação comprovada.
4. **QA provisionado** — jornadas reais e a demonstração de falha controlada
   bloqueando promoção, sem a qual o gate não pode ser declarado ativo.

## Dívida descoberta durante os gates, fora do escopo deste plano

O controle de acesso por número de WhatsApp está inoperante em todo o app desde
antes deste plano: `conversations/route.ts` filtra por `.in('whatsapp_number_id', …)`
e `permissions/route.ts` grava `whatsapp_number_ids` / `can_transfer_chats` — todas
colunas ausentes do esquema. O PostgREST recusa a linha inteira em silêncio, então
esses filtros nunca funcionaram. Fechar exige desenho de migration e prova em banco
real.
