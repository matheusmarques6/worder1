-- =============================================
-- FIX STAGES PROBABILITY AND FLAGS
-- Atualiza stages existentes com probability e is_won/is_lost
-- =============================================

-- 1. Garantir que colunas existem
ALTER TABLE pipeline_stages ADD COLUMN IF NOT EXISTS probability INTEGER DEFAULT 50;
ALTER TABLE pipeline_stages ADD COLUMN IF NOT EXISTS is_won BOOLEAN DEFAULT false;
ALTER TABLE pipeline_stages ADD COLUMN IF NOT EXISTS is_lost BOOLEAN DEFAULT false;

-- 2. Atualizar stages com nomes de Lead
UPDATE pipeline_stages 
SET probability = 10, is_won = false, is_lost = false 
WHERE LOWER(name) LIKE '%lead%' 
  AND (is_won IS NULL OR is_won = false) 
  AND (is_lost IS NULL OR is_lost = false);

-- 3. Atualizar stages com nomes de Qualificado
UPDATE pipeline_stages 
SET probability = 25, is_won = false, is_lost = false 
WHERE (LOWER(name) LIKE '%qualif%' OR LOWER(name) LIKE '%qualified%')
  AND (is_won IS NULL OR is_won = false) 
  AND (is_lost IS NULL OR is_lost = false);

-- 4. Atualizar stages com nomes de Proposta
UPDATE pipeline_stages 
SET probability = 50, is_won = false, is_lost = false 
WHERE (LOWER(name) LIKE '%proposta%' OR LOWER(name) LIKE '%proposal%')
  AND (is_won IS NULL OR is_won = false) 
  AND (is_lost IS NULL OR is_lost = false);

-- 5. Atualizar stages com nomes de Negociação
UPDATE pipeline_stages 
SET probability = 75, is_won = false, is_lost = false 
WHERE (LOWER(name) LIKE '%negoci%' OR LOWER(name) LIKE '%negotiation%')
  AND (is_won IS NULL OR is_won = false) 
  AND (is_lost IS NULL OR is_lost = false);

-- 6. Atualizar stages de GANHO (is_won = true)
UPDATE pipeline_stages 
SET probability = 100, is_won = true, is_lost = false 
WHERE LOWER(name) LIKE '%won%' 
   OR LOWER(name) LIKE '%ganho%' 
   OR LOWER(name) LIKE '%fechado%'
   OR LOWER(name) LIKE '%closed won%'
   OR LOWER(name) LIKE '%vencido%'
   OR LOWER(name) LIKE '%sucesso%';

-- 7. Atualizar stages de PERDA (is_lost = true)
UPDATE pipeline_stages 
SET probability = 0, is_won = false, is_lost = true 
WHERE LOWER(name) LIKE '%lost%' 
   OR LOWER(name) LIKE '%perdido%' 
   OR LOWER(name) LIKE '%closed lost%'
   OR LOWER(name) LIKE '%cancelado%'
   OR LOWER(name) LIKE '%desistiu%';

-- 8. Garantir que nenhum stage tem ambos is_won e is_lost
UPDATE pipeline_stages 
SET is_lost = false 
WHERE is_won = true AND is_lost = true;

-- 9. Mostrar resultado
SELECT 
  ps.id,
  ps.name,
  ps.probability,
  ps.is_won,
  ps.is_lost,
  p.name as pipeline_name
FROM pipeline_stages ps
JOIN pipelines p ON ps.pipeline_id = p.id
ORDER BY p.name, ps.position;
