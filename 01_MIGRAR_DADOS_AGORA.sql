-- =============================================
-- PASSO 1: MIGRAR CONTATOS PARA ORGANIZAÇÃO CORRETA
-- Execute AGORA para resolver o problema imediato
-- =============================================

-- 1.1 Migrar contatos da org errada (demo) para a org correta (Convertfy)
UPDATE contacts 
SET organization_id = '6cb9721c-fc7c-490e-b9a6-8393f0717648'
WHERE organization_id = '7521df81-7d9b-407c-8302-794eaef5339e';

-- 1.2 Migrar deals da org errada para a org correta
UPDATE deals 
SET organization_id = '6cb9721c-fc7c-490e-b9a6-8393f0717648'
WHERE organization_id = '7521df81-7d9b-407c-8302-794eaef5339e';

-- 1.3 Migrar pipelines da org errada para a org correta
UPDATE pipelines 
SET organization_id = '6cb9721c-fc7c-490e-b9a6-8393f0717648'
WHERE organization_id = '7521df81-7d9b-407c-8302-794eaef5339e';

-- 1.4 Verificar resultado
SELECT 'contacts' as tabela, organization_id, COUNT(*) as total
FROM contacts GROUP BY organization_id
UNION ALL
SELECT 'deals' as tabela, organization_id, COUNT(*) as total
FROM deals GROUP BY organization_id
UNION ALL
SELECT 'pipelines' as tabela, organization_id, COUNT(*) as total
FROM pipelines GROUP BY organization_id
ORDER BY tabela, total DESC;
