-- ============================================================================
-- 20260901000007_send_guard_error_day_rolls.sql
-- Auditoria 2026-08-28, item 32 · fix round 2.
--
-- Achado: o dia do contador de excesso só rolava quando a falha ERA de
-- excesso. Enquanto a escada tinha o `if not p_rate_limited then return`
-- antes dela, isso não aparecia — falha comum nunca chegava a ler o contador.
-- O ruling T tirou o `return` (20260901000006) e abriu o buraco: a primeira
-- falha COMUM de um dia novo relia `rate_limit_errors` parado no dia
-- ANTERIOR, e re-armava a janela inteira com ele. Dez excessos ontem mais um
-- 503 hoje calavam o número por 60 s por conta de um dia que já acabou.
--
-- No TS isso não tem como acontecer, e não por cuidado: a chave carrega o dia
-- (`wa:errors:{id}:{dia}`, `rate-limiter.ts:596`) e quem a cria é o `hincrby`,
-- que roda em TODA falha — não só nas de excesso. Num dia novo, qualquer erro
-- soma sobre um hash vazio e o total de códigos de excesso é ZERO até que um
-- excesso de verdade chegue.
--
-- A correção é essa mesma frase em colunas: `error_day` passa a ser o dia da
-- ÚLTIMA FALHA, seja qual for o código, e a virada do dia zera o contador. O
-- que continua valendo por inteiro: só excesso SOMA (a falha comum relê a
-- escada, não a empurra) e a escada é reavaliada em toda falha (ruling T).
-- ============================================================================

create or replace function internal.send_guard_report(
    p_phone_number_id text,
    p_success         boolean,
    p_rate_limited    boolean default false
)
    returns void
    language plpgsql
    security definer
    set search_path = pg_catalog, internal
as $$
declare
    v_day    date := (now() at time zone 'utc')::date;
    v_errors integer;
begin
    if p_phone_number_id is null then
        return;
    end if;

    insert into internal.whatsapp_send_guard (phone_number_id)
    values (p_phone_number_id)
    on conflict (phone_number_id) do nothing;

    if p_success then
        -- Os três estados do TS, lidos das colunas (ver 20260901000005):
        --   CLOSED = falhas < 5 · OPEN = >= 5 com janela viva · HALF_OPEN = >= 5
        --   com a janela vencida. Fecha no terceiro sucesso, nunca no primeiro.
        update internal.whatsapp_send_guard
           set half_open_successes = case
                   when consecutive_failures < 5      then 0
                   when open_until > now()            then half_open_successes
                   when half_open_successes + 1 >= 3  then 0
                   else half_open_successes + 1
               end,
               consecutive_failures = case
                   when consecutive_failures < 5      then 0
                   when open_until > now()            then consecutive_failures
                   when half_open_successes + 1 >= 3  then 0
                   else consecutive_failures
               end,
               open_until = case
                   when consecutive_failures < 5      then null
                   when open_until > now()            then open_until
                   when half_open_successes + 1 >= 3  then null
                   else open_until
               end,
               updated_at = now()
         where phone_number_id = p_phone_number_id;
        return;
    end if;

    -- 5 falhas seguidas → 30 s (send-guard.ts:64-65). O contador não volta a
    -- zero quando a janela vence — fica no limiar, e a próxima falha o cruza na
    -- hora (circuit-breaker.ts:112-115). A falha zera a série de sucessos.
    update internal.whatsapp_send_guard
       set consecutive_failures = consecutive_failures + 1,
           half_open_successes = 0,
           open_until = case when consecutive_failures + 1 >= 5
                             then now() + interval '30 seconds'
                             else open_until
                        end,
           -- O dia rola em TODA falha, como o `hincrby` que cria a chave do dia
           -- no TS. Era aqui que ficava o `case when p_rate_limited`, e era ele
           -- que deixava o contador de ontem vivo para a escada de hoje.
           error_day = v_day,
           -- Dia novo zera; dentro do dia, só excesso SOMA. Uma falha comum
           -- relê a escada abaixo; não a empurra.
           rate_limit_errors = case
               when error_day is distinct from v_day
                   then case when p_rate_limited then 1 else 0 end
               when p_rate_limited then rate_limit_errors + 1
               else rate_limit_errors
           end,
           updated_at = now()
     where phone_number_id = p_phone_number_id
    returning rate_limit_errors into v_errors;

    -- A escada do TS (rate-limiter.ts:613-623), reavaliada em TODA falha — é o
    -- ruling T. O `setex` de lá sobrescreve o TTL, então a janela é recarregada
    -- por inteiro em vez de estendida a partir do que sobrava.
    update internal.whatsapp_send_guard
       set throttled_until = case
               when v_errors >= 50 then now() + interval '10 minutes'
               when v_errors >= 20 then now() + interval '5 minutes'
               when v_errors >= 10 then now() + interval '1 minute'
               else throttled_until
           end
     where phone_number_id = p_phone_number_id;
end
$$;
