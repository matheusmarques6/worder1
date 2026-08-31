-- ============================================================================
-- item 10 da auditoria, rodada de fix 1 — o motivo da falha passa a chegar
-- na outbox.
--
-- 20260813000003 ligou o webhook de status à outbox (correlate_channel_status
-- → correlate_outbox_status), mas a assinatura não tinha por onde passar o
-- erro da Meta: a row chegava em 'failed' com last_error sempre null. É
-- literalmente a segunda metade do achado original ("falha de entrega da
-- Meta não vira last_error nem alerta") — a primeira metade (status) foi
-- resolvida, esta fecha o resto (alerta é escopo de quem escreve
-- public.alerts, não desta função).
--
-- Um parâmetro novo, opcional, no fim — todo call site existente (o
-- wrapper público, os testes) continua funcionando sem tocar. `last_error`
-- só é escrito quando p_status = 'failed': um status de sucesso nunca
-- sobrescreve um erro anterior com null nem com ruído — a mesma regra que
-- 20260812000004 já aplicava (`case when p_status = 'sent' then null else
-- last_error end`), só que agora com um valor de verdade para gravar do
-- lado 'failed'.
--
-- Assinatura e grants do resto continuam os mesmos — drop + create, o
-- padrão do repositório para nunca duas versões divergirem.
-- ============================================================================

drop function public.correlate_channel_status(text, text, text);
drop function internal.correlate_outbox_status(text, text, text);

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
       and status in ('sending', 'unknown');
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
