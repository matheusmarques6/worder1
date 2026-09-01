-- ============================================================================
-- 20260901000005_send_guard_half_open.sql
-- Auditoria 2026-08-28, item 32 · fix round 1, ruling Q.
--
-- Achado da revisão: o breaker fechava com UM sucesso onde o TS exige TRÊS
-- (`successThreshold ?? 3`, `circuit-breaker.ts:53`, implementado no
-- `LUA_RECORD_SUCCESS`: em HALF_OPEN cada sucesso incrementa e só fecha ao
-- chegar ao limiar).
--
-- O relatório da entrega anterior dispensou `successThreshold` e
-- `halfOpenMaxCalls` no mesmo argumento — "limitam sondas concorrentes" —, e
-- isso é verdade para o segundo e FALSO para o primeiro: `successThreshold`
-- não limita sonda nenhuma, ele governa quantos sucessos são precisos para
-- sair da recuperação. O que sobrava era divergência de número não declarada,
-- num ruling (C.1) que pediu paridade de números.
--
-- O efeito era o oposto do pretendido. Numa conta intermitente:
--
--   |                              | TS              | runtime (antes) |
--   | 5 falhas                     | abre 30 s       | abre 30 s       |
--   | passada a janela, 1 sucesso  | segue HALF_OPEN | CLOSED          |
--   | falha seguinte               | reabre na hora  | conta 1, faltam 4 |
--
-- Isto é: o motor NOVO martelava a conta com até 5 falhas por ciclo onde o
-- antigo martelava 1 — o motor novo era o menos conservador dos dois, que é o
-- contrário do risco que o item existe para reduzir.
--
-- `halfOpenMaxCalls` continua de fora, e agora com o argumento certo: ele
-- limita sondas CONCORRENTES, e como uma falha reabre na hora e o sender é um
-- laço sequencial, passa no máximo uma sonda por janela de qualquer forma.
-- ============================================================================

alter table internal.whatsapp_send_guard
    add column half_open_successes integer not null default 0;

comment on column internal.whatsapp_send_guard.half_open_successes is
    'Sucessos seguidos desde que a janela do breaker venceu. Fecha em 3, como '
    'o successThreshold do TS. Zerado por qualquer falha e ao fechar.';

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
        -- Os três estados do TS, lidos das colunas em vez de guardados num
        -- campo próprio (o estado É a combinação, e um campo a mais poderia
        -- discordar dela):
        --
        --   CLOSED    = consecutive_failures < 5
        --   OPEN      = >= 5 e open_until ainda no futuro
        --   HALF_OPEN = >= 5 e a janela já venceu
        --
        -- CLOSED: zera as falhas, como o ramo `elseif state == 'CLOSED'` do
        -- `LUA_RECORD_SUCCESS`. OPEN: não mexe em nada — o Lua do TS trata só
        -- HALF_OPEN e CLOSED, e um sucesso em OPEN passa sem efeito. Na prática
        -- o gate impede esse envio, mas o fail-open pode deixar um passar
        -- durante um outage do guard, e ele não pode dar alta a um número que
        -- ainda está de castigo. HALF_OPEN: conta, e fecha no terceiro.
        --
        -- O throttle segue intocado pelo sucesso, como antes: o
        -- `reportSendResult` só chama `breaker.recordSuccess()`
        -- (`send-guard.ts:162-165`) e o `recordSuccess` do limiter é no-op
        -- declarado no TS.
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

    -- 5 falhas seguidas → 30 s (send-guard.ts:64-65, os mesmos números que
    -- campaign-processor.ts:650-651 já usa no mesmo número).
    --
    -- O contador NÃO volta a zero quando a janela vence: ele fica no limiar, e
    -- a próxima falha o cruza na hora. É o `HALF_OPEN → OPEN` do TS
    -- (circuit-breaker.ts:112-115, uma falha reabre) sem a máquina de três
    -- estados. E a falha zera a série de sucessos, como o `SET KEYS[3] '0'`
    -- da mesma função: dois sucessos de um ciclo somados a um do ciclo
    -- seguinte não podem fechar um número que nunca teve três seguidos.
    update internal.whatsapp_send_guard
       set consecutive_failures = consecutive_failures + 1,
           half_open_successes = 0,
           open_until = case when consecutive_failures + 1 >= 5
                             then now() + interval '30 seconds'
                             else open_until
                        end,
           error_day = case when p_rate_limited then v_day else error_day end,
           rate_limit_errors = case
               when not p_rate_limited      then rate_limit_errors
               when error_day is distinct from v_day then 1
               else rate_limit_errors + 1
           end,
           updated_at = now()
     where phone_number_id = p_phone_number_id
    returning rate_limit_errors into v_errors;

    if not p_rate_limited then
        return;
    end if;

    -- A escada do TS (rate-limiter.ts:613-623). O `setex` de lá SOBRESCREVE o
    -- TTL a cada erro, então aqui a janela também é recarregada por inteiro em
    -- vez de estendida a partir do que sobrava.
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
