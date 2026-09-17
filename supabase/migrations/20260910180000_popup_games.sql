-- ============================================================================
-- 20260910180000_popup_games.sql
-- Popups (Fase 4): gamificação. O resultado da roleta/raspadinha é sorteado
-- no servidor e fica gravado na submissão — é a prova do prêmio e o que
-- impede "girar de novo" até cair algo melhor.
--   game_prize: { type, segment, segment_id, label, prize, replay }
-- ============================================================================
do $$
begin
    if to_regclass('public.crm_form_submissions') is null then
        raise notice 'crm_form_submissions ausente — pulando game_prize';
        return;
    end if;
    alter table public.crm_form_submissions add column if not exists game_prize jsonb;
    comment on column public.crm_form_submissions.game_prize is
        'Resultado do jogo (roleta/raspadinha) sorteado no servidor: {type, segment, segment_id, label, prize, replay}';
end $$;
