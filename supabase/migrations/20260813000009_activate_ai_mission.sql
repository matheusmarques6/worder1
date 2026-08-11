-- ============================================================================
-- 20260813000009_activate_ai_mission.sql
-- A ativação que a migration 0001 prometeu: arquiva-e-ativa NUM comando —
-- o UPDATE único é a transação, e o índice one-active vira o juiz da corrida
-- (duas ativações simultâneas = um erro de unique, nunca duas ativas).
--
-- SECURITY DEFINER com org explícita: quem chama é o app server
-- (service_role) depois de validar a sessão; a função re-valida que a missão
-- é da org — o id vem da UI, e confiança se verifica.
-- ============================================================================

create function public.activate_ai_mission(
    p_organization_id uuid,
    p_mission_id      uuid
)
    returns boolean
    language plpgsql
    security definer
    set search_path = pg_catalog, public
as $$
declare
    v_family text;
begin
    select m.event_type into v_family
      from public.ai_missions m
     where m.id = p_mission_id
       and m.organization_id = p_organization_id;
    if v_family is null then
        return false;
    end if;

    update public.ai_missions
       set status = case when id = p_mission_id then 'active' else 'archived' end,
           activated_at = case when id = p_mission_id then now() else activated_at end
     where organization_id = p_organization_id
       and event_type = v_family
       and (id = p_mission_id or status = 'active');

    return true;
end
$$;

revoke execute on function public.activate_ai_mission(uuid, uuid) from public;
grant execute on function public.activate_ai_mission(uuid, uuid) to service_role;
