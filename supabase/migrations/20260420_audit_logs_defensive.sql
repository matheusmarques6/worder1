-- =============================================================
-- audit_logs: garantir colunas que a API de consent LGPD usa.
-- A tabela já existe em produção mas pode ter sido criada com
-- schema diferente (sem user_id ou metadata), o que faz o INSERT
-- de /api/webhooks-admin/consent retornar 400 do PostgREST.
-- =============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  user_id         uuid,
  action          text NOT NULL,
  metadata        jsonb DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Adicionar colunas de forma idempotente caso a tabela já exista
-- com schema antigo
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_id    uuid;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS metadata   jsonb DEFAULT '{}'::jsonb;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS action     text;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS organization_id uuid;

-- Garantir índice usado pela query de leitura do consent
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_action
  ON audit_logs(organization_id, action, created_at DESC);

NOTIFY pgrst, 'reload schema';
