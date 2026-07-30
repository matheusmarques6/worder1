-- =============================================
-- whatsapp_ai_run_steps — progresso AO VIVO de uma execucao do agente.
--
-- Por que uma tabela nova e nao agent_traces: agent_traces grava UMA linha no
-- FIM do run (input/output/tokens/latencia), para auditoria posterior. O inbox
-- precisa do oposto — saber o que o agente esta fazendo ENQUANTO faz, antes de
-- a mensagem existir. Hoje, entre a mensagem do cliente e a resposta do bot, a
-- tela fica muda por vários segundos (debounce + transcricao + LLM + tool
-- calls + delays humanizados), sem sinal de que algo esta acontecendo.
--
-- Por que uma tabela e nao um canal broadcast: o agente roda em outro processo
-- (worker /api/workers/whatsapp-ai-respond, disparado por QStash). O browser
-- nao tem conexao com ele. Persistir + Realtime e o transporte que ja funciona
-- no inbox, e de brinde o painel reconstroi o estado se a aba abrir no meio de
-- um run.
--
-- Volume: poucas linhas por resposta do agente. O indice por conversa e o que
-- o painel usa; considerar prune por idade se o volume crescer (mesmo padrao
-- do cron prune-whatsapp-webhook-events).
-- =============================================

CREATE TABLE IF NOT EXISTS whatsapp_ai_run_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  conversation_id UUID NOT NULL,
  -- Agrupa os passos de UMA execucao. Gerado no inicio do run pelo runner.
  run_id          UUID NOT NULL,
  agent_id        UUID,
  -- Vocabulario fechado: ver AI_RUN_STEPS em src/lib/ai/run-steps.ts. Sem
  -- CHECK de proposito — um passo novo no codigo nao deve poder derrubar a
  -- gravacao (o insert e best-effort e nunca quebra a resposta do agente).
  step            TEXT NOT NULL,
  -- Texto curto ja pronto para exibicao (ex.: "Consultando pedidos").
  detail          TEXT,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wars_conversation_created
  ON whatsapp_ai_run_steps (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wars_run
  ON whatsapp_ai_run_steps (run_id);

-- -----------------------------------------------------
-- RLS: leitura por org. INSERT so via service role (fura RLS) — o runner
-- nunca escreve com o JWT do usuario.
--
-- A policy e AUTOCONTIDA de proposito: depende so de auth.uid() (built-in do
-- Supabase, sempre existe) e da tabela profiles. Nenhum helper.
--
-- Historico que justifica isso: o comentario em useCloudInboxRealtime.ts afirma
-- que as tabelas whatsapp_cloud_* usam policies *_org_select via
-- auth.organization_id() (001_enable_rls.sql). No banco de producao essa funcao
-- NAO existe — 001 nunca foi aplicada por completo, provavelmente porque criar
-- funcao no schema `auth` e negado para o role do projeto. Depender de
-- auth.organization_id() ou de user_belongs_to_org() (das tabelas de IA)
-- significaria apostar em migration que pode nao ter rodado.
--
-- Isso importa mais aqui do que numa tabela comum: o servidor de Realtime
-- reexecuta esta policy de SELECT com o JWT do browser para autorizar CADA
-- evento. Policy que falha => canal conecta e nunca entrega nada, sem erro
-- visivel — indistinguivel de "a feature nao funciona".
--
-- O subquery em profiles e permitido pela propria policy de profiles
-- ("id = auth.uid()"), e funciona igual se profiles estiver sem RLS.
-- -----------------------------------------------------
ALTER TABLE whatsapp_ai_run_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "whatsapp_ai_run_steps_org_select" ON whatsapp_ai_run_steps;
CREATE POLICY "whatsapp_ai_run_steps_org_select" ON whatsapp_ai_run_steps
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- -----------------------------------------------------
-- Realtime. Sem isto o painel nunca recebe evento — mesmo padrao de
-- 20260727_enable_cloud_inbox_realtime.sql.
-- -----------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'whatsapp_ai_run_steps'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_ai_run_steps;
  END IF;
END $$;

-- Só INSERT é consumido aqui, mas REPLICA IDENTITY FULL mantém o padrão das
-- outras tabelas do inbox e evita surpresa se um UPDATE for adicionado.
ALTER TABLE whatsapp_ai_run_steps REPLICA IDENTITY FULL;

-- Verificacao
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND tablename = 'whatsapp_ai_run_steps';
