-- ============================================================================
-- A tabela que o detector de entrada em segmento SEMPRE precisou e o banco
-- vivo nunca teve.
--
-- `segment_memberships_snapshot` só existe em
-- `supabase/migrations-archive/20260415_segment_snapshots.sql` — arquivada, e
-- portanto nunca aplicada. `to_regclass` no vivo devolvia NULL em 18/08/2026.
--
-- O estrago, medido: o código antigo de /api/cron/detect-segment-changes
-- descartava o erro da leitura (`const { data } = await ...`), então "tabela
-- inexistente" virava "nenhum snapshot" e TODO membro de TODO segmento
-- contava como entrada NOVA a cada 15 minutos. A org piloto tem dois
-- segmentos de ~21,4 mil e ~21,3 mil contatos: ~42,6 mil chamadas de
-- dispatchTrigger por rodada, cada uma com dois round-trips ao Postgres
-- antes de desistir. Isso é o 504 — não a contagem de segmentos (são 8).
-- A gravação do snapshot falhava do mesmo jeito silencioso, então o ciclo se
-- repetia para sempre.
--
-- Nada chegou a disparar porque a org não tem nenhuma automação
-- `trigger_segment` ativa (0 runs na tabela). No dia em que tivesse, seriam
-- 42,6 mil automações de uma vez.
--
-- Diferenças conscientes em relação à versão arquivada:
--
--   1. `FOR ALL USING (true)` saiu. Aquela policy vale para QUALQUER role —
--      com a Data API do Supabase por cima, anon/authenticated leriam
--      `contact_ids` de todas as orgs. Só o cron (service_role, que tem
--      BYPASSRLS) toca esta tabela: RLS ligada SEM policy permissiva e Data
--      API revogada é o recorte fiel.
--   2. FK para customer_segments com ON DELETE CASCADE — snapshot de
--      segmento apagado é lixo que ninguém coleta.
--   3. `snapshotted_at NOT NULL` — o detector usa esse carimbo para saber
--      quando observou pela última vez; nulo não significa nada aqui.
-- ============================================================================

create table if not exists public.segment_memberships_snapshot (
    segment_id      uuid primary key
                    references public.customer_segments(id) on delete cascade,
    organization_id uuid not null,
    contact_ids     uuid[] not null default '{}',
    snapshotted_at  timestamptz not null default now()
);

create index if not exists segment_snapshot_org_idx
    on public.segment_memberships_snapshot (organization_id);

alter table public.segment_memberships_snapshot enable row level security;

-- Sem policy: authenticated/anon não leem nem escrevem. service_role passa
-- por BYPASSRLS, que é como o cron chega aqui.
drop policy if exists "Service role full access" on public.segment_memberships_snapshot;

revoke all on public.segment_memberships_snapshot from public, anon, authenticated;
grant select, insert, update, delete on public.segment_memberships_snapshot to service_role;
