-- ============================================================================
-- 20260901000004_send_guard.sql
-- Auditoria 2026-08-28, item 32 — send-guard por número no sender Python.
--
-- Achado: o TS protege cada envio com `send-guard.ts` (breaker + rate limiter
-- por tier da Meta) e o runtime não tem nada disso. O que existe em Python é a
-- classificação de falha com backoff (`queueing/failures.py`): ela reage ao 429
-- DEPOIS de levá-lo, e trata a MENSAGEM. Ninguém trata o NÚMERO. Uma conta em
-- apuros continua sendo martelada até a Meta bloqueá-la.
--
-- A régua mora aqui, no molde do `internal.sender_preflight`
-- (20260813000003): uma função SECURITY DEFINER decide e o sender executa o
-- veredito. Uma cópia em Python dos limiares derivaria da do TS no primeiro
-- dia em que alguém mexesse num dos lados.
--
-- A CHAVE é o `phone_number_id` — o número FÍSICO da Meta —, a mesma do TS e
-- pelo mesmo motivo escrito no cabeçalho de `send-guard.ts:11-18`: chavear por
-- id de tabela racha o estado entre campanha e interativo e permite ~2x o
-- limite real. O sender já a recebe pronta no claim (`channel_external_id`,
-- comentado em 20260813000003:59), então nenhuma consulta nova.
--
-- ESTADO RACHADO, DECLARADO (ruling B/P): o TS conta em Upstash Redis e este
-- estado vive em Postgres. Os dois não se enxergam, e cinco caminhos TS
-- enviam pelo MESMO número de uma org migrada sem que o rollout desligue
-- nenhum deles — campanhas (`campaign-processor.ts:500-501`), inbox humano
-- texto (`inbox/conversations/[id]/messages/route.ts:161`) e mídia
-- (`.../media/route.ts:92`), `cloud/messages/route.ts:233`; só a IA legada
-- (`cloud-sender.ts:211`) é desligada, em `workers/whatsapp-ai-respond/route.ts:85`.
--
-- Por isso esta migration conta duas coisas e SÓ duas: falhas seguidas e
-- sinais de excesso. As duas degradam o TEMPO DE REAÇÃO quando partidas —
-- cada motor se cala mais devagar, nenhum passa a enviar mais do que enviaria
-- sozinho. Pair-rate, throughput e cota diária ficam de FORA porque partidos
-- degradam o TETO: um número aqui seria falso enquanto o outro motor gastar do
-- mesmo teto sem ser visto, e contador que mente é pior que contador nenhum.
--
-- Fail-open é do chamador (ruling D, `send-guard.ts:21`): indisponibilidade da
-- infra do guard PERMITE o envio e loga. O que estas funções devolvem é
-- decisão tomada, nunca ausência de resposta.
-- ============================================================================

create table internal.whatsapp_send_guard (
    -- O número físico da Meta. Não é FK para `whatsapp_business_accounts`
    -- de propósito: DUAS linhas de lá (e de `whatsapp_instances`) podem
    -- apontar para o mesmo número, e é o número que tem limite.
    phone_number_id      text primary key,
    -- Breaker: falhas SEGUIDAS. Um sucesso zera.
    consecutive_failures integer     not null default 0,
    open_until           timestamptz,
    -- Throttle: erros de excesso no dia, em UTC como o TS.
    error_day            date,
    rate_limit_errors    integer     not null default 0,
    throttled_until      timestamptz,
    updated_at           timestamptz not null default now()
);

comment on table internal.whatsapp_send_guard is
    'Estado do send-guard do runtime, por phone_number_id (número físico da '
    'Meta). Divergente do estado do TS em Redis por desenho — ver o cabeçalho '
    'da migration 20260901000004.';

-- ----------------------------------------------------------------------------
-- O veredito, antes do envio
-- ----------------------------------------------------------------------------
-- Zero linhas = pode enviar. Linha ausente (número que nunca falhou) e janela
-- vencida dão o mesmo resultado, que é o certo nos dois casos.
--
-- A ordem é a do TS (`send-guard.ts:130-145`): o breaker é consultado antes do
-- limiter. Com os dois segurando, o motivo que a operação lê é o primeiro da
-- cascata.
create function internal.send_guard_check(p_phone_number_id text)
    returns table (reason text, retry_after interval)
    language sql
    stable
    security definer
    set search_path = pg_catalog, internal
as $$
    select case
               when g.open_until > now() then 'circuit_open'
               when g.throttled_until > now() then 'throttled'
           end,
           case
               when g.open_until > now() then g.open_until - now()
               when g.throttled_until > now() then g.throttled_until - now()
           end
      from internal.whatsapp_send_guard g
     where g.phone_number_id = p_phone_number_id
       and (g.open_until > now() or g.throttled_until > now());
$$;

comment on function internal.send_guard_check(text) is
    'Segurar este número agora? Zero linhas = pode enviar. Breaker antes de '
    'throttle, como checkBeforeSend.';

-- ----------------------------------------------------------------------------
-- O resultado do envio, depois
-- ----------------------------------------------------------------------------
-- Chamada UMA VEZ POR CHAMADA AO GRAPH, não por linha de outbox (ruling N):
-- uma linha vira N bolhas, e é a chamada que a Meta conta e é ela que falha.
create function internal.send_guard_report(
    p_phone_number_id text,
    p_success         boolean,
    -- `queueing/failures.is_rate_limited`: a Meta sinalizou EXCESSO? Um 503 é
    -- falha e NÃO é excesso — throttlar por um outage do Graph calaria a loja
    -- por dez minutos por um erro que não foi dela.
    p_rate_limited    boolean default false
)
    returns void
    language plpgsql
    security definer
    set search_path = pg_catalog, internal
as $$
declare
    -- UTC, como o `toISOString().split('T')[0]` do TS (rate-limiter.ts:727).
    -- `current_date` cru cortaria o dia no fuso do servidor, e os dois motores
    -- virariam o dia em horas diferentes no MESMO número.
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
        -- Paridade com `reportSendResult` (send-guard.ts:162-165): o sucesso
        -- fecha o BREAKER e não toca no throttle. O `recordSuccess` do limiter
        -- é no-op declarado no TS (rate-limiter.ts:629-631) — a janela de
        -- throttle expira sozinha, e é assim que ela deve expirar: o sinal de
        -- excesso veio da Meta, não da nossa contagem de falhas.
        update internal.whatsapp_send_guard
           set consecutive_failures = 0,
               open_until           = null,
               updated_at           = now()
         where phone_number_id = p_phone_number_id;
        return;
    end if;

    -- 5 falhas seguidas → 30 s (send-guard.ts:64-65, os mesmos números que
    -- campaign-processor.ts:650-651 já usa no mesmo número).
    --
    -- O contador NÃO volta a zero quando a janela vence: ele fica no limiar, e
    -- a próxima falha o cruza na hora. É o essencial do HALF_OPEN do TS
    -- (circuit-breaker.ts:112-115, uma falha reabre) sem a máquina de três
    -- estados — o `halfOpenMaxCalls` existe lá para limitar sondas
    -- CONCORRENTES, e o sender é um laço sequencial. Só o sucesso zera.
    update internal.whatsapp_send_guard
       set consecutive_failures = consecutive_failures + 1,
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

comment on function internal.send_guard_report(text, boolean, boolean) is
    'Alimenta breaker e throttle deste número. Uma chamada por chamada ao '
    'Graph, não por linha de outbox.';

-- Nenhum grant na TABELA, nem para sender_role: `internal` não é exposto por
-- HTTP e o acesso passa pelas duas funções, no molde da outbox.
revoke execute on function internal.send_guard_check(text) from public;
revoke execute on function internal.send_guard_report(text, boolean, boolean) from public;

grant execute on function internal.send_guard_check(text) to sender_role;
grant execute on function internal.send_guard_report(text, boolean, boolean) to sender_role;
