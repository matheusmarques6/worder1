-- ============================================================================
-- Plano missões-no-nó (decisão do usuário, 12/08) — nome livre da missão.
--
-- A missão ganha um nome que o lojista escolhe ("Recuperação VIP"); a família
-- (cart.abandoned…) vira etiqueta técnica. NULL = a UI mostra o rótulo da
-- família, então nada quebra para as missões existentes.
-- ============================================================================

alter table public.ai_missions add column display_name text;

comment on column public.ai_missions.display_name is
    'Nome livre escolhido pelo lojista. NULL = UI usa o rótulo da família.';
