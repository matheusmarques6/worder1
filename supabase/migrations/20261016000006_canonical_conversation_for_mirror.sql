-- 20261016000006_canonical_conversation_for_mirror.sql
--
-- Plano IA (15/10/2026), M1 passo 11 — runtime/docs/alteracoes/2026-10-15-07.
--
-- O copiloto do inbox recebe o id da conversa do ESPELHO
-- (`whatsapp_cloud_conversations.id`), mas o runtime trabalha sobre a
-- canônica (`public.conversations`). Esta função faz o caminho inverso da
-- `internal.legacy_conversation_guard_state`: espelho → identidade WhatsApp
-- (wa_id, com e sem '+') → contato → conversa canônica mais recente da org.
-- SECURITY DEFINER para o worker não precisar de SELECT no espelho; o escopo
-- é a cláusula `organization_id = p_organization_id`, como nas irmãs.
--
-- down: drop function internal.canonical_conversation_for_mirror(uuid, uuid);

create or replace function internal.canonical_conversation_for_mirror(
  p_organization_id uuid,
  p_mirror_conversation_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = public, internal
as $$
  select c.id
    from public.whatsapp_cloud_conversations wcc
    join public.channel_identities ci
      on ci.organization_id = wcc.organization_id
     and ci.channel = 'whatsapp'
     and (ci.external_id = wcc.wa_id
          or ltrim(ci.external_id, '+') = ltrim(coalesce(wcc.wa_id, wcc.contact_phone), '+'))
    join public.conversations c
      on c.organization_id = wcc.organization_id
     and c.contact_id = ci.contact_id
   where wcc.id = p_mirror_conversation_id
     and wcc.organization_id = p_organization_id
   order by c.last_inbound_at desc nulls last, c.created_at desc
   limit 1;
$$;

revoke execute on function internal.canonical_conversation_for_mirror(uuid, uuid) from public;
grant execute on function internal.canonical_conversation_for_mirror(uuid, uuid) to service_role;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'worker_role') then
    grant execute on function internal.canonical_conversation_for_mirror(uuid, uuid) to worker_role;
  end if;
end $$;
