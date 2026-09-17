-- =============================================
-- Colunas que o código escreve e a tabela não tinha.
--
-- O PostgREST recusa a linha INTEIRA quando não conhece um campo, e o
-- erro não vira exceção: a falha passa calada. Uma varredura comparando
-- cada .insert/.update/.select do código com o esquema de produção achou
-- 147 pares (tabela, coluna) inexistentes. Esta migration cria os que
-- fazem falta nas superfícies deste trabalho; o resto está registrado no
-- retrato do esquema e num teste que reprova drift novo.
--
-- O que estava quebrado por causa disto, em produção:
--
--   email_campaigns.paused_at      → pausar e retomar campanha falhavam.
--                                     A rota respondia "não está num
--                                     estado que permita pausar" para
--                                     QUALQUER campanha, e a tela de
--                                     campanhas tem esse botão.
--   email_campaigns.ab_*           → teste A/B de e-mail inteiro. Criar
--                                     campanha com A/B dava 500, e o cron
--                                     que decide a vencedora pedia sete
--                                     colunas inexistentes: nunca rodou.
--   shopify_stores.tracking_*      → instalar o pixel por ScriptTag
--                                     gravava o id do script e falhava;
--                                     a tela nunca sabia que instalou.
--   shopify_stores.last_error      → a checagem de conexão queria
--                                     registrar POR QUE falhou e perdia
--                                     justamente isso.
--   shopify_stores.last_import_at  → data da última importação de
--                                     clientes, idem.
--
-- Tudo aditivo e anulável: nenhuma linha existente muda de significado.
-- =============================================

do $$
begin
  if to_regclass('public.email_campaigns') is not null then
    -- Pausa
    alter table public.email_campaigns add column if not exists paused_at timestamptz;

    -- Teste A/B (as sete que o código usa)
    alter table public.email_campaigns add column if not exists ab_test_enabled boolean default false;
    alter table public.email_campaigns add column if not exists ab_test_percent integer default 50;
    alter table public.email_campaigns add column if not exists ab_variant_b jsonb;
    alter table public.email_campaigns add column if not exists ab_duration_hours integer default 4;
    alter table public.email_campaigns add column if not exists ab_winner_metric text default 'open_rate';
    alter table public.email_campaigns add column if not exists ab_winner text;
    alter table public.email_campaigns add column if not exists ab_resolved_at timestamptz;
  end if;

  if to_regclass('public.shopify_stores') is not null then
    alter table public.shopify_stores add column if not exists tracking_enabled boolean default false;
    alter table public.shopify_stores add column if not exists tracking_script_id text;
    alter table public.shopify_stores add column if not exists last_error text;
    alter table public.shopify_stores add column if not exists last_import_at timestamptz;
  end if;
end $$;

-- O cron das vencedoras procura campanha com A/B ligado e prazo vencido.
create index if not exists idx_email_campaigns_ab_pendentes
  on public.email_campaigns (sent_at)
  where ab_test_enabled = true and ab_resolved_at is null;

comment on column public.email_campaigns.paused_at is 'Quando o lojista pausou. Nulo ao retomar.';
comment on column public.email_campaigns.ab_winner is 'Variante vencedora (a/b) escolhida pelo cron.';
comment on column public.shopify_stores.tracking_script_id is 'Id do ScriptTag instalado na Shopify (caminho legado do pixel).';
