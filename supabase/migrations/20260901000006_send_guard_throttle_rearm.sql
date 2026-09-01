-- ============================================================================
-- 20260901000006_send_guard_throttle_rearm.sql
-- Auditoria 2026-08-28, item 32 · fix round 1, ruling T.
--
-- Achado da revisão: a primeira entrega replicou UMA esquisitice do throttle do
-- TS (o contador por dia corrido em UTC) e CORRIGIU a outra, sem declarar.
--
-- A outra é esta: `recordError` (`rate-limiter.ts:594-624`) é chamado em TODA
-- falha, e a escada no fim dele roda INCONDICIONALMENTE, seja qual for o
-- código do erro. Consequência no TS: 10 excessos às 10:00 armam 60 s; às
-- 10:05 um 503 qualquer chama `recordError('503')`, o total de códigos de
-- excesso continua 10 no mesmo dia UTC, e o `setex` re-arma a janela inteira
-- por mais 60 s.
--
-- A entrega anterior punha um `if not p_rate_limited then return; end if;`
-- antes da escada — mais defensável em si (um 503 não é excesso, que é o
-- mesmo argumento que faz `is_rate_limited` existir), mas o ruling O mandou
-- replicar a semântica do TS, não escolher entre as duas quirks da mesma
-- função. E aqui replicar é o lado CONSERVADOR: re-armar segura mais tempo e
-- envia menos, que é a direção que o item quer.
--
-- O que NÃO muda, e é a outra metade da regra: uma falha comum continua sem
-- SOMAR ao contador do dia. Só código de excesso incrementa, como no TS, onde
-- o total é a soma apenas dos `rateLimitCodes`. Uma falha comum relê a escada;
-- não a empurra.
--
-- Que a re-armagem por qualquer falha seja discutível vale para os DOIS
-- motores, e é achado registrado — o lugar de mudá-la é nos dois ao mesmo
-- tempo, nunca de um lado só.
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
           error_day = case when p_rate_limited then v_day else error_day end,
           -- Só excesso SOMA. Uma falha comum relê a escada abaixo; não a empurra.
           rate_limit_errors = case
               when not p_rate_limited      then rate_limit_errors
               when error_day is distinct from v_day then 1
               else rate_limit_errors + 1
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
