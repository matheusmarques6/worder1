-- ============================================================================
-- 20260918010000_activate_ai_mission_row_order.sql
-- A ativação parou de depender da ordem física das linhas.
--
-- A versão de 20260813000009 arquivava-e-ativava num único UPDATE, apostando
-- que o Postgres escreveria o 'archived' da missão em uso antes do 'active'
-- da nova. `ai_missions_one_active_per_family` é índice único comum, não
-- constraint adiável: ele é verificado a cada linha escrita, dentro da
-- instrução. Quando a linha da alvo vinha primeiro no heap, a segunda
-- 'active' existia por um instante e o índice barrava —
-- `duplicate key value violates unique constraint`, na cara do lojista.
--
-- A ordem inverte sozinha: editar a missão em uso reescreve a linha e a joga
-- para o fim do heap, atrás de um rascunho criado antes dela.
--
-- Dois comandos resolvem. A função continua sendo uma transação, então
-- ninguém observa o intervalo entre eles, e o índice segue julgando corrida
-- entre transações — que é o trabalho que ele de fato pode fazer.
-- ============================================================================

create or replace function public.activate_ai_mission(
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

    -- Primeiro esvaziar a vaga. Sem isto, o passo seguinte disputa o índice
    -- com a missão que ele mesmo vai aposentar.
    update public.ai_missions
       set status = 'archived'
     where organization_id = p_organization_id
       and event_type = v_family
       and status = 'active'
       and id <> p_mission_id;

    update public.ai_missions
       set status = 'active',
           activated_at = now()
     where id = p_mission_id;

    return true;
end
$$;
