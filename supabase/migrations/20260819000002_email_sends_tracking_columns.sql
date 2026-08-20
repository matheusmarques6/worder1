-- Colunas de tracking que o código escreve em email_sends e que podem não
-- existir no banco vivo (mesmo padrão da 20260817000001/20260819000001:
-- código na frente do schema). Sintomas observados em 19/08:
--
--   1. /api/t/o (pixel de abertura) fazia SELECT incluindo mpp_opened_at;
--      com a coluna ausente o select erra, o handler engole o erro e
--      NENHUMA abertura é registrada — 372 envios, opened_at=0, enquanto
--      cliques (rota que não referencia a coluna) funcionavam.
--   2. O webhook da Resend escreve delivered_at/bounced_at/complained_at/
--      failed_at ao processar eventos.
--
-- Expand puro, idempotente (add column if not exists). GUARDA por
-- to_regclass: num Postgres limpo (CI) a tabela pode não existir e isto
-- precisa ser no-op lá.

do $$
begin
    if to_regclass('public.email_sends') is not null then
        alter table public.email_sends
            add column if not exists mpp_opened_at timestamptz,
            add column if not exists delivered_at timestamptz,
            add column if not exists bounced_at timestamptz,
            add column if not exists complained_at timestamptz,
            add column if not exists failed_at timestamptz,
            add column if not exists ab_variant text,
            add column if not exists isp_domain text;
    end if;
end
$$;
