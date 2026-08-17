-- Cursor PRÓPRIO do detector de entrada em segmento.
--
-- `/api/cron/detect-segment-changes` ordenava seu lote de 200 por
-- `customer_segments.last_evaluated_at` e nunca escrevia essa coluna. Quem
-- escreve é o cron irmão `/api/cron/recompute-segments` (lote de 500, mesma
-- cadência de 15 min) — ou seja, a ordem de detecção era um efeito colateral
-- do lote do vizinho, não uma rotação. Consequência real: com mais de 200
-- segmentos dinâmicos, a cauda podia nunca ser detectada, e nada no sistema
-- dizia isso.
--
-- Cada cron passa a ter o seu cursor. O detector escreve
-- `last_change_check_at` por segmento CONCLUÍDO (parcial não avança, para
-- voltar na frente da fila na rodada seguinte).
--
-- Expand puro: coluna nula em toda linha existente = todo segmento entra
-- como "nunca detectado" e é drenado primeiro, que é o comportamento certo
-- na primeira rodada depois desta migration.
--
-- GUARDA por to_regclass: `customer_segments` é tabela do app legado e não
-- faz parte do baseline do runtime — no Postgres limpo do CI ela não existe,
-- e esta migration precisa ser no-op lá, não erro.

do $$
begin
    if to_regclass('public.customer_segments') is null then
        return;
    end if;

    alter table public.customer_segments
        add column if not exists last_change_check_at timestamptz;

    -- Índice parcial no MESMO recorte da consulta do cron
    -- (segment_type in ('dynamic','rfm') order by last_change_check_at
    -- nulls first): sem ele o lote de 200 é um sort da tabela inteira a
    -- cada 15 min, e a regra do plano de observabilidade é explícita —
    -- consulta periódica sem coluna de tempo indexada não entra.
    create index if not exists idx_customer_segments_change_cursor
        on public.customer_segments (last_change_check_at nulls first)
        where segment_type in ('dynamic', 'rfm');
end
$$;
