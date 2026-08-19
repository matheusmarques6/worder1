-- check-abandoned-carts ainda quebrava depois da 20260817000001: o filtro
-- default excludeRecovered do cron aplica `.is('recovered_order_id', null)`
-- e essa coluna nunca existiu no banco vivo — 42703 a cada minuto (logs da
-- Vercel, 19/08). A migration de 17/08 adicionou as demais colunas que o
-- cron consulta, mas não esta.
--
-- Expand puro (tabela vazia no vivo em 19/08/2026). Sem FK: o código só lê
-- a coluna como marcador de recuperação (is null); nada a escreve hoje.
--
-- GUARDA por to_regclass: tabela do app LEGADO, fora do baseline do
-- runtime — num Postgres limpo (CI) ela nem existe, e esta migration
-- precisa ser um no-op lá, não um erro.

do $$
begin
    if to_regclass('public.abandoned_carts') is not null then
        alter table public.abandoned_carts
            add column if not exists recovered_order_id uuid;
    end if;
end
$$;
