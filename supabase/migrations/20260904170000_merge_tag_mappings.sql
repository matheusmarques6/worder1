-- =============================================================
-- Mapeamento de variáveis de evento
--
-- O nome da variável é estável ({{ CheckoutURL }}); o caminho até o
-- valor dentro do payload não é. Cada integração manda o link do
-- checkout num campo diferente, e até aqui a única saída era editar o
-- resolvedor no código.
--
-- Esta tabela guarda só o que DIFERE do padrão do catálogo — linha
-- ausente significa "usa a cascata padrão". Isso mantém o
-- comportamento de quem nunca abriu a tela exatamente como era.
-- =============================================================

CREATE TABLE IF NOT EXISTS merge_tag_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- NULL = vale para a organização inteira. Preenchido = só aquela
  -- loja, para quem tem integrações diferentes por loja.
  store_id uuid REFERENCES shopify_stores(id) ON DELETE CASCADE,
  tag text NOT NULL,
  -- Cascata que SUBSTITUI a padrão. Vazia = só o valor padrão importa.
  paths text[] NOT NULL DEFAULT '{}',
  default_value text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE merge_tag_mappings IS
  'Sobrescreve o caminho de uma variavel de evento no payload. Ausencia = cascata padrao do catalogo.';

-- UNIQUE com NULL nao deduplica no Postgres, entao sao dois indices
-- parciais: um para o escopo da organizacao, outro por loja.
CREATE UNIQUE INDEX IF NOT EXISTS uq_merge_tag_mappings_org
  ON merge_tag_mappings (organization_id, tag)
  WHERE store_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_merge_tag_mappings_store
  ON merge_tag_mappings (organization_id, store_id, tag)
  WHERE store_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_merge_tag_mappings_lookup
  ON merge_tag_mappings (organization_id, store_id);

ALTER TABLE merge_tag_mappings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'merge_tag_mappings' AND policyname = 'merge_tag_mappings_org_isolation'
  ) THEN
    CREATE POLICY merge_tag_mappings_org_isolation ON merge_tag_mappings
      FOR ALL
      USING (organization_id IN (
        SELECT organization_id FROM profiles WHERE id = auth.uid()
      ));
  END IF;
END $$;
