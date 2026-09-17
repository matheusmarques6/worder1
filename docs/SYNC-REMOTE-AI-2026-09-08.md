# Sync remoto e reavaliação do motor de IA — 08/09/2026

## Resultado executivo

A integração foi feita na branch local `integration/sync-remote-ai-2026-09-08`, partindo do motor
auditado em `f0be8061` e incorporando os 46 commits remotos até `4847440c`. A branch original não foi
alterada e nenhum push, deploy ou migration em banco foi executado.

O código integrado compila, gera build de produção e passa as suítes web e unitária do runtime. Ele
é uma boa versão comparativa, mas ainda não deve ser promovido diretamente: o gate DB/RLS não pôde
ser executado sem um Postgres descartável explicitamente isolado, e o item 80 da auditoria continua
aberto no envio de e-mail.

## Referências Git

| Papel | Referência |
|---|---|
| Base comum | `f0196638` |
| Origem local auditada | `f0be8061` |
| Origem remota sincronizada | `4847440c` |
| Branch comparativa | `integration/sync-remote-ai-2026-09-08` |
| Worktree | `.worktrees/sync-remote-ai-2026-09-08` |

## Conflitos encontrados e resolvidos

Foram exatamente três conflitos textuais, iguais aos encontrados na simulação anterior ao merge.

| Arquivo | Por que conflitou | Resolução aplicada | Efeito protegido |
|---|---|---|---|
| `src/app/(dashboard)/settings/ai-usage/page.tsx` | O remoto substituiu a tela pelo novo design de Configurações; a auditoria local havia corrigido a semântica de custo desconhecido. | Mantida a tela remota com `Card`, `Meter`, `Tabs` e `useApi`, reincorporando `unknownCostCalls`, `hasUnknownCost`, `costLabel()` e o aviso de custo parcial. | A interface não apresenta gasto parcial como “custo total”. |
| `src/app/api/ai/custom-tools/[id]/test/route.ts` | O remoto extraiu a mensagem de recusa; a auditoria local limitou a leitura do corpo HTTP. | Mantida a constante remota em `refusal-message.ts` e preservados `MAX_BODY_CHARS`, `MAX_BODY_BYTES`, leitura incremental e cancelamento da stream no teto. | Evita oráculo de DNS interno e resposta remota sem limite de memória. |
| `src/app/api/ai/custom-tools/[id]/test/route.test.ts` | Cada lado testava uma parte diferente da mesma correção. | O teste importa a constante extraída e preserva os casos de texto curto e cancelamento no limite de bytes. | As duas garantias ficam executáveis e não apenas documentadas. |

Nenhuma resolução global `ours`/`theirs` foi usada e não restaram arquivos em estado de conflito.

## Auto-merges críticos revisados

- `src/middleware.ts`: preservou a exceção exata de `/api/ai/process/document` para autenticação
  Bearer interna e incorporou `/api/health`, `/api/v1/` e a exigência de configuração de MFA.
- `src/app/api/webhooks/shopify/route.ts`: preservou a validação HMAC sobre os bytes brutos antes de
  fazer `JSON.parse` e incorporou os ajustes remotos de atribuição, loja e inventário.
- `src/app/api/ai/usage/route.ts`: continua retornando HTTP 500 em erro de consulta e mantém
  `unknownCostCalls`/`hasUnknownCost`; não inventa custo zero para modelo sem preço.
- Migrações: as 18 migrations remotas foram preservadas, sem nome duplicado e sem `DROP TABLE`,
  `DROP COLUMN` ou `TRUNCATE`. Os `DELETE` encontrados pertencem às operações explícitas de revogar
  sessões. As migrations novas habilitam RLS, tornam views `security_invoker`, revogam execução
  pública de funções `SECURITY DEFINER` e fixam `search_path`.
- Isolamento: o remoto passou as rotas `queue/settings`, `queue/assign` e `queue/items` para
  `requireOrgFromAuth`; o item 86 da auditoria foi marcado como resolvido.

## Reavaliação da auditoria

| Item | Estado após o sync | Evidência/impacto |
|---|---|---|
| 74 — Ruff vermelho | **Resolvido nesta branch** | A exceção `T201` ficou limitada ao script de medição, imports/linhas foram formatados e `ruff check .` passou. |
| 80 — `send-batch` sem tenant em pedidos/carrinhos | **Ainda aberto — alto risco** | A campanha agora é conferida por organização, mas `shopify_orders` e `shopify_checkouts` ainda escolhem por e-mail sem `organization_id`/`store_id`. Pode misturar dados e link de checkout entre lojas. |
| 86 — organização vinda do corpo em rotas de fila | **Resolvido pelo remoto** | As três rotas derivam a organização do token e o teste multi-tenant passou 5/5. |
| 94 — segredo de OAuth com fallback literal | **Ainda aberto/depende de ambiente** | `oauth-security.ts` ainda aceita `fallback-secret-change-me`. Produção precisa ter `OAUTH_STATE_SECRET` ou `NEXTAUTH_SECRET` configurado; o estado externo não foi inspecionado. |
| 95 — contratos Python sem type checker | **Ainda aberto** | Permanecem cinco XFAIL conhecidos: quatro classificações de erro `httpx` e a conversão de `success_criteria` em tupla de caracteres. |
| Estado real do banco/RLS | **Não verificado localmente** | Não havia `SUPABASE_DB_URL` para o banco descartável da porta 55322. Nenhuma migration foi aplicada por segurança. |
| Demais pendências da auditoria | **Sem regressão observada; continuam no backlog** | O remoto não alterou o runtime Python. O checklist integrado tem 72 itens marcados e 64 caixas ainda abertas, incluindo decisões de produto, ambiente e provas DB. |

## Gates executados

| Gate | Resultado |
|---|---|
| Baseline antes do merge | `tsc --noEmit` passou; 9 testes focados passaram. |
| Testes focados pós-merge | 16/16 passaram (conflitos, middleware e invariantes multi-tenant). |
| TypeScript | `tsc --noEmit` — exit 0. |
| Build de produção | `next build` — exit 0; 147 páginas estáticas geradas. |
| Vitest completo | 180 arquivos aprovados, 1 ignorado; 1.874 testes aprovados, 3 ignorados. |
| Ruff | Passou após o ajuste do item 74. |
| Import Linter | 4 contratos mantidos, 0 quebrados. |
| Pytest unit | 1.208 aprovados, 521 desmarcados, 5 XFAIL conhecidos. |
| DB/RLS/pipeline | Não executado: banco descartável seguro não disponível. |

## Decisão para produção

**Aprovada como branch comparativa; ainda não aprovada para promoção direta.** Antes de produção:

1. Executar o job `tests-db`/RLS em banco descartável ou via CI, aplicando as 18 migrations do remoto
   junto com as migrations locais do motor.
2. Resolver ou aceitar formalmente o risco do item 80; a correção deve escopar as duas consultas por
   organização/loja e sanitizar o valor usado no filtro PostgREST.
3. Confirmar no ambiente de produção `OAUTH_STATE_SECRET`/`NEXTAUTH_SECRET`, URLs/roles do runtime e
   a linha de rollout da organização piloto, sem expor os valores.
4. Só então promover a branch, mantendo `f0be8061` como referência simples de rollback.

## Rollback

Enquanto a branch não for promovida, o rollback é simplesmente continuar na branch original. Se ela
for integrada depois, o commit de merge terá dois pais, permitindo identificar separadamente a base
auditada e o remoto incorporado. Não foi feito push nem mudança em ambiente externo durante este sync.
