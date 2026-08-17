-- Colunas que o código legado consulta/escreve e que nunca existiram no banco
-- vivo — os crons erravam a cada minuto (17/08, logs da Vercel):
--
--   1. recipient-claim (Fase 0/0D anti-double-send): `claimRecipientForSend`
--      escreve `sending_at` e o sweep de quarentena filtra por ela. Sem a
--      coluna o claim falha FECHADO — campanha pulava todo destinatário.
--   2. /api/cron/check-abandoned-carts: consulta status/notified_at/
--      abandoned_at e escreve notified_at/notification_count/
--      last_notification_at.
--
-- Expand puro (ambas as tabelas estão vazias no vivo em 17/08/2026).

alter table public.whatsapp_campaign_recipients
  add column if not exists sending_at timestamptz;

create index if not exists idx_wcr_stuck_sending
  on public.whatsapp_campaign_recipients (sending_at)
  where status = 'sending';

alter table public.abandoned_carts
  add column if not exists status text not null default 'abandoned',
  add column if not exists abandoned_at timestamptz,
  add column if not exists notified_at timestamptz,
  add column if not exists notification_count integer not null default 0,
  add column if not exists last_notification_at timestamptz;

alter table public.abandoned_carts
  alter column abandoned_at set default now();

-- Backfill (no-op com a tabela vazia; correto se algum dia rodar com dados)
update public.abandoned_carts
   set abandoned_at = detected_at
 where abandoned_at is null and detected_at is not null;

update public.abandoned_carts
   set status = 'recovered'
 where recovered_at is not null;

create index if not exists idx_abandoned_carts_cron
  on public.abandoned_carts (organization_id, abandoned_at)
  where status = 'abandoned' and notified_at is null;
