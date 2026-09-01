-- ============================================================================
-- 20260901000008_send_guard_closed_keeps_successes.sql
-- Auditoria 2026-08-28, item 32 · fix round 2, ruling X.
--
-- Achado da re-revisão (2, Minor): a série de sucessos era zerada em TODA
-- falha e em TODO sucesso de CLOSED, e o `LUA_RECORD_FAILURE` do TS não faz
-- isso. Lá quem zera `successes` é só o ramo HALF_OPEN
-- (`circuit-breaker.ts:112-115`); o ramo CLOSED faz `INCR failures` e nada
-- mais, e o `LUA_RECORD_SUCCESS` em CLOSED zera `failures` e nada mais
-- (`:145-148`). A migration anterior apresentava o zeramento como paridade, e
-- ele não era — é a mesma classe de "corrigir em vez de replicar" que já tinha
-- virado achado no round 0.
--
-- Aqui a assimetria some: em CLOSED (falhas < 5) a série de sucessos fica onde
-- está, e o zeramento passa a valer só para os dois estados em que o TS zera.
--
-- E a parte que precisa ficar escrita, porque é o motivo de isto NÃO ser um
-- fix de comportamento: nenhum estado ALCANÇÁVEL distingue as duas versões.
-- `half_open_successes` só cresce em HALF_OPEN (falhas >= 5), a falha que
-- reabre continua zerando, e o terceiro sucesso que fecha zera junto — então
-- em CLOSED a série já é 0 por construção, e o zeramento era um cinto que
-- nunca teve o que segurar. O que muda é o código dizer o que o TS diz, e
-- parar de dizer "paridade" onde havia divergência.
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
                   -- CLOSED: o TS zera `failures` e NÃO toca em `successes`.
                   when consecutive_failures < 5      then half_open_successes
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
    -- hora (circuit-breaker.ts:112-115).
    update internal.whatsapp_send_guard
       set consecutive_failures = consecutive_failures + 1,
           -- Só HALF_OPEN e OPEN zeram a série, como o ramo HALF_OPEN do
           -- `LUA_RECORD_FAILURE`. Em CLOSED o TS só incrementa as falhas.
           half_open_successes = case when consecutive_failures < 5
                                      then half_open_successes
                                      else 0
                                 end,
           open_until = case when consecutive_failures + 1 >= 5
                             then now() + interval '30 seconds'
                             else open_until
                        end,
           -- O dia rola em TODA falha, como o `hincrby` que cria a chave do dia
           -- no TS (ver 20260901000007).
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
