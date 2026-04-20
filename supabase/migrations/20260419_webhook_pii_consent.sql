-- ================================================
-- Outbound Webhooks: PII consent (LGPD)
-- Spec §11. Garante audit_logs mínimo pra registrar
-- aceite de consentimento na 1ª criação de webhook.
-- ================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES auth.users(id),
  action          text NOT NULL,
  metadata        jsonb DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_action
  ON audit_logs(organization_id, action, created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Policies idempotentes (DROP IF EXISTS antes pra não bater com outra
-- migration que possa ter criado a mesma policy).
DROP POLICY IF EXISTS "org_members_read_audit" ON audit_logs;
CREATE POLICY "org_members_read_audit" ON audit_logs
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );
