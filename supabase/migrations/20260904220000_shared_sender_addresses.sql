-- =============================================================
-- Endereços no domínio compartilhado (worder.email)
--
-- worder.email é verificado para toda a plataforma: qualquer loja pode
-- enviar por ele sem configurar DNS. A parte antes do @ identifica a
-- loja (based@worder.email) e tem de ser ÚNICA em toda a Worder — duas
-- lojas chamadas "Based" em organizações diferentes não podem assinar
-- o mesmo endereço. Esta tabela é a reserva: a chave primária garante
-- a unicidade mesmo com duas lojas nascendo ao mesmo tempo.
--
-- Quem aloca: src/lib/email/shared-sender.ts (slug do nome da loja,
-- depois slug-2, slug-3…). A loja pode trocar o endereço na tela de
-- E-mail & Domínios; a reserva antiga é liberada.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.shared_sender_addresses (
  domain        TEXT NOT NULL DEFAULT 'worder.email',
  local_part    TEXT NOT NULL,
  store_id      UUID NOT NULL REFERENCES public.shopify_stores(id) ON DELETE CASCADE,
  organization_id UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (domain, local_part),
  CONSTRAINT shared_sender_local_part_format CHECK (local_part ~ '^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$')
);

CREATE INDEX IF NOT EXISTS idx_shared_sender_addresses_store ON public.shared_sender_addresses (store_id);

ALTER TABLE public.shared_sender_addresses ENABLE ROW LEVEL SECURITY;
-- Só o servidor (service role) lê e escreve; nenhuma policy para usuários.
