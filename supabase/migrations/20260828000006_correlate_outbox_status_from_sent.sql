-- ============================================================================
-- item 10 da auditoria, review final — a correlação nunca disparava no
-- caminho real de produção.
--
-- Achado: `mark_outbox_sent` (20260812000004) move a row para 'sent' no
-- instante em que a Meta API responde 200 — ANTES de qualquer webhook de
-- status chegar. O webhook de DELIVERY FAILURE da Meta chega depois, e
-- `internal.correlate_outbox_status` só casava `status in ('sending',
-- 'unknown')`. Uma falha reportada pela Meta encontrava a row já em 'sent',
-- não casava nada, `found = false`, e `last_error` ficava null — exatamente
-- o buraco que 20260828000005 prometeu fechar, mas fechou só nos dois
-- estados que o 200 síncrono já deixou pra trás no caminho real. Os cinco
-- testes de banco do item 10 semeavam 'sending'/'unknown' e passavam
-- honestamente, sem provar nada sobre produção.
--
-- Ruling do controller (decidido, não reabrir): uma falha de entrega
-- relatada pela Meta PRECISA ser gravável numa row que já está 'sent' — é
-- assíncrona por natureza (o 200 da API só confirma que a Meta aceitou o
-- envio, não que o destinatário recebeu).
--
-- Tabela de transição implementada (from status × incoming p_status):
--
--   from \ incoming   |  'sent'              |  'failed'
--   --------------------------------------------------------------------
--   pending            não casa (nunca em voo)  não casa
--   sending             -> sent                  -> failed, last_error
--   unknown             -> sent                  -> failed, last_error
--   sent                não casa (idempotente,    -> failed, last_error
--                        sem-op — já é o estado)   (ESTE é o caso real)
--   failed              não casa (terminal,       não casa (já terminal;
--                        não anda pra trás)        não sobrescreve o
--                                                   last_error com um
--                                                   reenvio do mesmo evento)
--   manual_review       não casa (terminal,       não casa (precisa de
--                        precisa de humano)        revisão humana, não de
--                                                   um webhook tardio)
--
-- Ou seja: 'failed' ganha um terceiro estado de origem ('sent'); 'sent'
-- continua casando só 'sending'/'unknown', do jeito de sempre — nunca anda
-- uma row pra trás a partir de um estado terminal. 'failed' e
-- 'manual_review' ficam de fora dos dois lados: são terminais que só um
-- novo ciclo de envio (não uma correlação de status) deveria reabrir, e
-- isso é escopo de outra função.
--
-- `pending` fica de fora do lado 'failed' de propósito: uma row pending
-- nunca foi enviada à Meta (ou está aguardando retry depois de uma falha
-- transiente via `mark_outbox_failed`, que já carimba `last_error`) — não
-- há POST em voo pra a Meta reportar status sobre.
--
-- Assinatura, retorno e grants continuam os mesmos de 20260828000005 — só o
-- corpo muda. `drop function` explícito + `create function` novo, o padrão
-- do repositório para nunca haver duas versões divergindo.
-- ============================================================================

drop function public.correlate_channel_status(text, text, text, text);
drop function internal.correlate_outbox_status(text, text, text, text);

create function internal.correlate_outbox_status(
    p_idempotency_key     text,
    p_status              text,
    p_provider_message_id text default null,
    p_error               text default null
)
    returns boolean
    language plpgsql
    security definer
    set search_path = pg_catalog, internal
as $$
begin
    if p_status not in ('sent', 'failed') then
        raise exception 'unknown correlation status: %', p_status;
    end if;
    update internal.message_outbox
       set status = p_status,
           provider_message_id = coalesce(p_provider_message_id, provider_message_id),
           sent_at = case when p_status = 'sent' then now() else sent_at end,
           locked_by = null,
           locked_until = null,
           last_error = case when p_status = 'failed' then coalesce(p_error, last_error)
                              else last_error
                         end
     where idempotency_key = p_idempotency_key
       and (
           (p_status = 'failed' and status in ('sending', 'unknown', 'sent'))
           or
           (p_status = 'sent' and status in ('sending', 'unknown'))
       );
    return found;
end
$$;

revoke execute on function internal.correlate_outbox_status(text, text, text, text) from public;
grant execute on function internal.correlate_outbox_status(text, text, text, text) to sender_role;

create function public.correlate_channel_status(
    p_idempotency_key     text,
    p_status              text,
    p_provider_message_id text default null,
    p_error               text default null
)
    returns boolean
    language sql
    security definer
    set search_path = pg_catalog, internal
as $$
    select internal.correlate_outbox_status(
        p_idempotency_key, p_status, p_provider_message_id, p_error
    )
$$;

revoke execute on function public.correlate_channel_status(text, text, text, text) from public;
grant execute on function public.correlate_channel_status(text, text, text, text) to service_role;
