-- O freio do atendente (pedido 17/08): desligar o agente no botão ou entrar
-- na conversa manualmente precisa CANCELAR a resposta automática já agendada
-- na canônica — senão o runtime responde por cima do humano segundos depois.
--
-- SECURITY DEFINER porque quem puxa o freio é o app (service_role) e a
-- canônica tem RLS de runtime. Resolve o contato pelo telefone (identidade
-- WhatsApp), tolerante a '+' — o webhook grava sem, o E.164 vem com.
--
-- O que ele NÃO faz: matar um turno já em voo (lease tomada, geração em
-- curso). Esse termina pelo caminho normal — juiz e envio — e o freio vale
-- da próxima mensagem em diante. Parar geração no meio é cirurgia de lease,
-- registrada como dívida.

create or replace function public.cancel_pending_ai_response(
    p_organization_id uuid,
    p_phone           text
)
    returns integer
    language plpgsql
    security definer
    set search_path = pg_catalog, public
as $$
declare
    v_count integer;
begin
    update public.conversations c
       set pending_response_at = null
      from public.channel_identities ci
     where ci.organization_id = c.organization_id
       and ci.contact_id = c.contact_id
       and ci.channel = 'whatsapp'
       and c.organization_id = p_organization_id
       and ltrim(ci.external_id, '+') = ltrim(p_phone, '+')
       and c.pending_response_at is not null;
    get diagnostics v_count = row_count;
    return v_count;
end
$$;

revoke execute on function public.cancel_pending_ai_response(uuid, text) from public;
revoke execute on function public.cancel_pending_ai_response(uuid, text) from anon, authenticated;
grant execute on function public.cancel_pending_ai_response(uuid, text) to service_role;
