-- ============================================================================
-- 20260813000010_mission_seeds_v0.sql
-- Os seeds do catálogo (doc §4.5 — [PENDENTE-2]: copy v0 de dev, NÃO aprovada
-- como final). Seeds são POR ORG e nascem 'draft'/'worder_default': ativar é
-- ato explícito do cutover (fatia vertical ativa cart.abandoned na piloto).
--
-- Uma função em vez de INSERTs soltos: o onboarding chama para org nova, o
-- cutover chama para a piloto, e chamar duas vezes não duplica (idempotente
-- por família+origin — se a org já tem QUALQUER missão da família, pula).
-- ============================================================================

create function public.seed_default_missions(p_organization_id uuid)
    returns integer
    language plpgsql
    security definer
    set search_path = pg_catalog, public
as $$
declare
    v_inserted integer := 0;
    v_row record;
begin
    if not exists (select 1 from public.organizations o where o.id = p_organization_id) then
        raise exception 'org % não existe', p_organization_id;
    end if;

    for v_row in
        select * from (values
            ('whatsapp.received',
             'Um contato mandou mensagem espontânea no WhatsApp da loja.',
             'classificar a intenção e ajudar — vender, suportar ou encaminhar, no viés da loja',
             'a pessoa teve a dúvida resolvida ou avançou para compra',
             'a pessoa desistiu sem resposta ou pediu humano e não foi transferida',
             '{"kind": "none"}'::jsonb, false, 5),
            ('cart.abandoned',
             'O contato deixou itens no carrinho e saiu sem finalizar.',
             'recuperar a compra sem parecer cobrança',
             'checkout finalizado a partir do link do carrinho',
             'pediu para não receber mais este tipo de mensagem',
             '{"kind": "none"}'::jsonb, true, 3),
            ('checkout.abandoned',
             'O contato chegou ao checkout e não concluiu o pagamento.',
             'recuperar a compra sem parecer cobrança',
             'pagamento concluído',
             'pediu para não receber mais este tipo de mensagem',
             '{"kind": "none"}'::jsonb, true, 3),
            ('order.fulfilled',
             'O pedido do contato foi enviado.',
             'responder status com dado real; resolver sem vender',
             'a pessoa ficou tranquila quanto à entrega',
             'a conversa virou reclamação sem resposta',
             '{"kind": "none"}'::jsonb, false, 2),
            ('payment.pix.abandoned',
             'O contato gerou um Pix e não pagou.',
             'reenviar o código e destravar o pagamento',
             'pagamento confirmado',
             'a pessoa pediu cancelamento',
             '{"kind": "none"}'::jsonb, false, 2),
            ('payment.boleto.abandoned',
             'O contato gerou um boleto e não pagou.',
             'reenviar o código e destravar o pagamento',
             'pagamento confirmado',
             'a pessoa pediu cancelamento',
             '{"kind": "none"}'::jsonb, false, 2)
        ) as seeds(event_type, situation, objective, success_criteria,
                   failure_criteria, concession, promote_moment, max_turns)
    loop
        if not exists (
            select 1 from public.ai_missions m
             where m.organization_id = p_organization_id
               and m.event_type = v_row.event_type
        ) then
            insert into public.ai_missions
                (organization_id, event_type, status, origin, situation, objective,
                 success_criteria, failure_criteria, concession, promote_moment,
                 max_turns, change_summary)
            values
                (p_organization_id, v_row.event_type, 'draft', 'worder_default',
                 v_row.situation, v_row.objective, v_row.success_criteria,
                 v_row.failure_criteria, v_row.concession, v_row.promote_moment,
                 v_row.max_turns,
                 'seed v0 (PENDENTE-2: copy de dev, revisar antes de ativar)');
            v_inserted := v_inserted + 1;
        end if;
    end loop;

    return v_inserted;
end
$$;

comment on function public.seed_default_missions(uuid) is
    'Seeds §4.5 por org — draft/worder_default, idempotente por família. Ativar é ato explícito (UI ou cutover). Copy v0 é rascunho de dev (PENDENTE-2).';

revoke execute on function public.seed_default_missions(uuid) from public;
grant execute on function public.seed_default_missions(uuid) to service_role;
