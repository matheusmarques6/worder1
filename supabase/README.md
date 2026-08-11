# supabase/ — fonte canônica de DDL

## Regra (em vigor desde 12/08/2026)

**Todo DDL novo nasce em `supabase/migrations/`**, com nome `YYYYMMDDHHMMSS_snake_case.sql`,
e é aplicado ao banco vivo via `apply_migration` (MCP Supabase) — que registra a migration
no schema `supabase_migrations`. Disciplina expand-contract; roll-forward only (nunca
reverter migration em produção). Ver `core/agentes-por-evento.md` (§3.0 e Adendo §A.2)
e o estado vivo em `core/STATUS-agentes-por-evento.md`.

A primeira migration canônica é `20260812000001_agents_baseline_prereqs.sql`: baseline
de pré-requisitos conformado ao banco de produção (no-op no vivo; bootstrap no CI).

## Locais CONGELADOS (históricos — não adicionar nada neles)

Estes diretórios acumularam DDL aplicado à mão no SQL Editor ao longo do projeto.
Continuam no repo como referência histórica, mas **nenhum arquivo novo entra neles**
e nada neles deve ser (re)aplicado sem virar migration canônica:

- `supabase/migrations-archive/` — os 123 arquivos da era pré-baseline (4 convenções
  de nome misturadas; nenhum registrado no schema de migrations do banco vivo).
- `supabase/*.sql` (raiz) e `supabase/audits/` — dumps e auditorias pontuais.
- `sql/` — inclui `ai-agents-complete-migration.sql` (origem real de `ai_agents`).
- `docs/*.sql` e `docs/migrations/` — inclui `ALL-MIGRATIONS-CONSOLIDADO.sql`.
- `worder-cloud-api-fixes/` — era o schema autoritativo da Cloud API (agora coberto
  pelo baseline).
- `_archive/sql/`, `src/lib/sql/`, `MIGRATIONS-MVP-RODAR.sql` (raiz).

## Aviso de segurança pendente

O banco vivo está com **RLS desabilitado nas tabelas legadas de `public`** (advisor
crítico do Supabase). A remediação exige aprovação explícita + plano de policies +
regressão de inbox/realtime — rastreada em `core/STATUS-agentes-por-evento.md`.
Tabelas novas do projeto Agentes por Evento nascem com RLS + policies na própria
migration.
