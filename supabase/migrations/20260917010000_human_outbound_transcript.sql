-- W2-T2a: a resposta do atendente humano precisa existir no transcript
-- canônico, senão a IA retoma a conversa sem saber o que foi dito.
create or replace function internal.record_human_outbound_transcript()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, internal, public
as $$
declare
  v_org uuid;
  v_waba uuid;
  v_wa_id text;
  v_phone text;
  v_contact uuid;
  v_conversation uuid;
  v_seq integer;
begin
  if new.direction <> 'outbound'
     or new.sender is distinct from 'human'
     or coalesce(new.sent_by_bot, false) then
    return new;
  end if;

  select wcc.organization_id, wcc.waba_id, wcc.wa_id, wcc.contact_phone
    into v_org, v_waba, v_wa_id, v_phone
    from public.whatsapp_cloud_conversations wcc
   where wcc.id = new.conversation_id;

  if v_org is null then
    return new;
  end if;

  -- O espelho grava o número em duas formas — `wa_id` sem "+" (o formato que
  -- o webhook da Meta usa) e `contact_phone` com "+" (E.164) — por isso as
  -- duas buscas abaixo casam `v_wa_id`/`v_phone` contra as duas colunas do
  -- CRM (`channel_identities.external_id` e `contacts.whatsapp`/`contacts.phone`).
  -- `ingest_inbound_message` resolve por um único `external_id` porque quem
  -- chama já normalizou a entrada; aqui é leitura pura do espelho legado, sem
  -- normalização prévia — não dá para saber de antemão qual forma foi salva.
  --
  -- Mesma resolução de `public.ingest_inbound_message`: identidade de canal
  -- primeiro, contato por telefone depois. Diferença deliberada: um outbound
  -- NÃO cria contato nem conversa; sem destino canônico, o trigger sai.
  select ci.contact_id into v_contact
    from public.channel_identities ci
   where ci.organization_id = v_org
     and ci.channel = 'whatsapp'
     and ci.external_id in (v_wa_id, v_phone);

  if v_contact is null then
    select c.id into v_contact
      from public.contacts c
     where c.organization_id = v_org
       and (c.whatsapp in (v_wa_id, v_phone) or c.phone in (v_wa_id, v_phone))
     order by c.created_at
     limit 1;
  end if;

  if v_contact is null then
    return new;
  end if;

  select c.id into v_conversation
    from public.conversations c
   where c.organization_id = v_org and c.contact_id = v_contact;

  if v_conversation is null then
    return new;
  end if;

  v_seq := internal.next_message_seq(v_conversation, 'outbound');

  insert into public.messages
    (organization_id, conversation_id, direction, seq, channel,
     author_type, content, provider_message_id, created_at, channel_account_id)
  values
    (v_org, v_conversation, 'outbound', v_seq, 'whatsapp', 'human',
     case when nullif(new.text_body, '') is not null
          then jsonb_build_object('text', new.text_body)
          else new.content end,
     new.message_id, coalesce(new."timestamp", now()), v_waba)
  on conflict do nothing;

  return new;
end
$$;

drop trigger if exists record_human_outbound_transcript
  on public.whatsapp_cloud_messages;
create trigger record_human_outbound_transcript
after insert on public.whatsapp_cloud_messages
for each row execute function internal.record_human_outbound_transcript();

revoke all on function internal.record_human_outbound_transcript() from public;
