-- =============================================
-- Email domain DNS status columns.
-- Populated by /api/email/domains/verify from Resend DNS record list.
-- =============================================

alter table if exists public.email_domains
  add column if not exists spf text default 'pending',
  add column if not exists dkim text default 'pending',
  add column if not exists dmarc text default 'pending',
  add column if not exists last_verified_at timestamptz;

create index if not exists idx_email_domains_status on public.email_domains(status);

comment on column public.email_domains.spf is 'pending | verified | failed — derived from Resend records';
comment on column public.email_domains.dkim is 'pending | verified | failed';
comment on column public.email_domains.dmarc is 'pending | verified | failed';
