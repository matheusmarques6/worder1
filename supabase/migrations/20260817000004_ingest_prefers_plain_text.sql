-- Defeito 1 de 17/08, camada c — estancar a fonte do formato Meta.
--
-- O backfill do ingest preferia `wcm.content` (formato Meta: {"text": {"body":
-- …}}) ao texto plano. O extrator do transcript entregava o JSON cru ao
-- prompt, o modelo IMITOU o envelope e a resposta saiu crua no WhatsApp do
-- cliente. A cópia passa a preferir `text_body` (plano); `content` fica só
-- para mensagens sem texto (mídia). E as linhas já copiadas no formato antigo
-- são achatadas — 19 no vivo em 17/08.
--
-- Única mudança na função: a expressão do `content` na cópia (2b).

create or replace function public.ingest_inbound_message(
    p_organization_id uuid,
    p_channel text,
    p_external_id text,
    p_contact_name text,
    p_content jsonb,
    p_provider_message_id text,
    p_debounce_seconds integer default 8
)
    returns table(conversation_id uuid, contact_id uuid, seq integer, deduplicated boolean)
    language plpgsql
    security definer
    set search_path to 'pg_catalog', 'public', 'internal'
as $function$
-- As colunas do RETURNS TABLE são variáveis OUT; sem isto o plpgsql acha que
-- o `contact_id` do ON CONFLICT é a variável e reprova por ambiguidade. Todo
-- o corpo usa prefixos v_/p_, então só o alvo do ON CONFLICT muda de leitura.
#variable_conflict use_column
declare
    v_contact_id      uuid;
    v_conversation_id uuid;
    v_is_new          boolean := false;
    v_status          text;
    v_seq             integer;
    v_old             record;
    v_copy_seq        integer;
begin
    if p_channel not in ('whatsapp', 'email', 'instagram') then
        raise exception 'canal desconhecido: %', p_channel;
    end if;

    -- Dedup por wamid ANTES de tocar contadores: webhook reentregue não pode
    -- furar seq.
    if p_provider_message_id is not null then
        select m.conversation_id, m.seq
          into v_conversation_id, v_seq
          from public.messages m
         where m.provider_message_id = p_provider_message_id;
        if found then
            select c.contact_id into v_contact_id
              from public.conversations c where c.id = v_conversation_id;
            return query select v_conversation_id, v_contact_id, v_seq, true;
            return;
        end if;
    end if;

    -- 1. Identidade do canal → contato CRM (cria se não houver).
    select ci.contact_id into v_contact_id
      from public.channel_identities ci
     where ci.organization_id = p_organization_id
       and ci.channel = p_channel
       and ci.external_id = p_external_id;

    if v_contact_id is null then
        select c.id into v_contact_id
          from public.contacts c
         where c.organization_id = p_organization_id
           and (c.whatsapp = p_external_id or c.phone = p_external_id)
         order by c.created_at
         limit 1;

        if v_contact_id is null then
            insert into public.contacts (organization_id, phone, whatsapp, first_name, source)
            values (p_organization_id, p_external_id, p_external_id,
                    nullif(p_contact_name, ''), 'whatsapp')
            returning id into v_contact_id;
        end if;

        insert into public.channel_identities (organization_id, contact_id, channel, external_id)
        values (p_organization_id, v_contact_id, p_channel, p_external_id)
        on conflict (organization_id, channel, external_id) do nothing;
    end if;

    -- 2. Conversa canônica (uma por contato por org).
    insert into public.conversations (organization_id, contact_id, last_channel, last_inbound_at)
    values (p_organization_id, v_contact_id, p_channel, now())
    on conflict (organization_id, contact_id) do nothing
    returning id into v_conversation_id;

    if v_conversation_id is not null then
        v_is_new := true;
    else
        select c.id, c.status into v_conversation_id, v_status
          from public.conversations c
         where c.organization_id = p_organization_id and c.contact_id = v_contact_id;

        update public.conversations
           set last_channel = p_channel,
               last_inbound_at = now(),
               status = case when status = 'closed' then 'open' else status end
         where id = v_conversation_id;
    end if;

    -- 2b. Primeira criação: copia as últimas 20 mensagens do espelho cloud
    -- (contexto limitado; sem job global de backfill).
    if v_is_new and p_channel = 'whatsapp' then
        for v_old in
            select wcm.message_id, wcm.direction, wcm.text_body, wcm.content,
                   wcm.sent_by_bot, wcm."timestamp"
              from public.whatsapp_cloud_messages wcm
              join public.whatsapp_cloud_conversations wcc on wcc.id = wcm.conversation_id
             where wcc.organization_id = p_organization_id
               and wcc.wa_id = p_external_id
               and wcm.message_id is distinct from p_provider_message_id
             order by wcm."timestamp" desc
             limit 20
        loop
            v_copy_seq := internal.next_message_seq(
                v_conversation_id,
                case v_old.direction when 'inbound' then 'inbound' else 'outbound' end
            );
            insert into public.messages
                (organization_id, conversation_id, direction, seq, channel, author_type,
                 content, provider_message_id, created_at)
            values
                (p_organization_id, v_conversation_id, v_old.direction, v_copy_seq, 'whatsapp',
                 case when v_old.direction = 'inbound' then 'contact'
                      when v_old.sent_by_bot then 'agent' else 'human' end,
                 -- 17/08: texto plano PRIMEIRO — o formato Meta no histórico
                 -- ensinava o modelo a responder em JSON. `content` só quando
                 -- não há texto (mídia).
                 case when nullif(v_old.text_body, '') is not null
                      then jsonb_build_object('text', v_old.text_body)
                      else v_old.content end,
                 v_old.message_id, v_old."timestamp")
            on conflict do nothing;
        end loop;
    end if;

    -- 3. Seq atômico + mensagem canônica.
    v_seq := internal.next_message_seq(v_conversation_id, 'inbound');

    insert into public.messages
        (organization_id, conversation_id, direction, seq, channel, author_type,
         content, provider_message_id)
    values
        (p_organization_id, v_conversation_id, 'inbound', v_seq, p_channel, 'contact',
         p_content, p_provider_message_id);

    -- 4. Debounce: mensagem nova EMPURRA a janela. Só o coalescer limpa.
    --    Takeover humano não agenda resposta de IA.
    update public.conversations
       set pending_response_at = now() + make_interval(secs => p_debounce_seconds)
     where id = v_conversation_id
       and status = 'open';

    return query select v_conversation_id, v_contact_id, v_seq, false;
end
$function$;

-- Achatamento das linhas já copiadas no formato antigo (19 no vivo, 17/08):
-- {"text": {"body": X}} vira {"text": X}. Linhas sem body (mídia) ficam.
update public.messages
   set content = jsonb_set(content, '{text}', to_jsonb(content #>> '{text,body}'))
 where jsonb_typeof(content -> 'text') = 'object'
   and content #>> '{text,body}' is not null;
