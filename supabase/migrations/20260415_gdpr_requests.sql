-- =============================================
-- GDPR Requests log (Shopify mandatory compliance)
-- Tracks customer data requests, redacts and shop redacts for audit.
-- =============================================

create table if not exists public.gdpr_requests (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  shop_domain text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received',
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists idx_gdpr_requests_shop on public.gdpr_requests(shop_domain);
create index if not exists idx_gdpr_requests_topic on public.gdpr_requests(topic);
create index if not exists idx_gdpr_requests_received on public.gdpr_requests(received_at desc);

alter table public.gdpr_requests enable row level security;

-- Service role only; no end-user access.
drop policy if exists gdpr_requests_service_all on public.gdpr_requests;
create policy gdpr_requests_service_all on public.gdpr_requests
  for all to service_role using (true) with check (true);
