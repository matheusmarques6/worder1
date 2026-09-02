-- ============================================================================
-- Auditoria 2026-08-28, item 38 — o wamid do último inbound viaja com o claim.
--
-- Pré-requisito do "digitando" (e do tique azul que vem junto, ruling A): a
-- Meta só aceita `typing_indicator` de carona num `status: read` sobre o
-- `message_id` do ÚLTIMO inbound (mesmo endpoint que `claim_outbox_batch` já
-- serve, `POST /{phone_number_id}/messages` — ver `channels/cloud_api.py`).
-- O wamid mora em `public.messages.provider_message_id`
-- (`direction = 'inbound'`, gravado por `public.ingest_inbound_message`); o
-- outbox não o carregava.
--
-- Ruling B do item: rota (1) — `claim_outbox_batch` devolve o wamid, não uma
-- busca própria no sender — porque é onde o dado já viaja, e o único
-- consumidor do tipo `internal.claimed_send` e da função é
-- `repository/engine.py::claim_outbox_batch` (por sua vez só chamado de
-- `queueing/sender.py::sender_pass`); os testes que citam a função
-- (`tests/db/test_outbox_claim.py`, `test_otel_carrier.py`,
-- `test_send_guard_wiring.py`) leem por `select *`/índice até a coluna 8
-- (`kind`) ou por nome de campo do outbox, nunca contam colunas — uma coluna
-- NOVA no fim não quebra nenhum. Mesmo padrão da 9.1b (`otel`): `alter type
-- ... add attribute` + `create or replace function`, assinatura antiga cai
-- (nunca duas versões divergindo).
--
-- `conversation_id` é nullable em `internal.message_outbox` (um toque de
-- funil pode preceder a conversa) — sem conversa, sem inbound, o subselect
-- devolve NULL, e ruling D ("sem wamid, silêncio") cuida do resto no Python.
-- ============================================================================

alter type internal.claimed_send add attribute last_inbound_wamid text;

comment on type internal.claimed_send is
    'Tudo que um envio precisa, numa linha só. channel_external_id: whatsapp → phone_number_id da conta Cloud (a da outbox, ou a conta ativa única da org). last_inbound_wamid: provider_message_id do último inbound da conversa (item 38) — null quando não há conversa/inbound; o sender não manda read/typing nesse caso (ruling D).';

create or replace function internal.claim_outbox_batch(
    p_claim_token uuid,
    p_limit       integer default 50,
    p_lease       interval default interval '60 seconds'
)
    returns setof internal.claimed_send
    language sql
    security definer
    set search_path = pg_catalog, public, internal
as $$
    with claimed as (
        select id
          from internal.message_outbox
         where status = 'pending'
           and next_attempt_at <= now()
         order by next_attempt_at
         for update skip locked
         limit p_limit
    ),
    marked as (
        update internal.message_outbox o
           set status = 'sending',
               locked_by = p_claim_token::text,
               locked_until = now() + p_lease,
               request_started_at = now(),
               attempt_count = o.attempt_count + 1
          from claimed
         where o.id = claimed.id
        returning o.*
    )
    select m.id,
           m.organization_id,
           m.channel,
           case when m.channel = 'whatsapp' then
               coalesce(
                   (select w.phone_number_id
                      from public.whatsapp_business_accounts w
                     where w.id = m.channel_account_id),
                   (select w.phone_number_id
                      from public.whatsapp_business_accounts w
                     where w.organization_id = m.organization_id
                       and w.status = 'active'
                     order by w.created_at
                     limit 1)
               )
           end,
           coalesce(ct.whatsapp, ct.phone),
           m.payload,
           m.idempotency_key,
           m.attempt_count,
           m.kind,
           m.moment_ids,
           m.otel,
           (select msg.provider_message_id
              from public.messages msg
             where msg.conversation_id = m.conversation_id
               and msg.direction = 'inbound'
             order by msg.seq desc
             limit 1)
      from marked m
      join public.contacts ct on ct.id = m.contact_id
$$;
