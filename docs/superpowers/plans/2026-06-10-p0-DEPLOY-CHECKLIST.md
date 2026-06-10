# P0 Campaign Pipeline — Checklist de Deploy

Branch: claude/fwrle-p0-p3-execution (base: claude/debug-console-error-FWrLE)

## Ordem obrigatória
1. **ANTES do deploy do app**: aplicar `supabase/migrations/20260615_whatsapp_campaign_pipeline.sql` no Supabase (SQL Editor ou mcp apply_migration). O cron novo depende do RPC `claim_due_whatsapp_campaigns`; o webhook degrada graciosamente se `apply_campaign_recipient_webhook` faltar (best-effort).
2. Conferir no banco: `SELECT id, name, scheduled_at FROM whatsapp_campaigns WHERE status='scheduled' AND scheduled_at < NOW();` — as com <48h de atraso DISPARARÃO no primeiro tick; >48h serão canceladas automaticamente. Comunicar/ajustar antes se necessário.
3. Idem scheduled_messages: `SELECT count(*) FROM scheduled_messages WHERE status='pending' AND scheduled_at < NOW();` — atrasadas >6h: recorrentes pulam a ocorrência e reagendam; sem recorrência viram failed/EXPIRED. <6h: serão enviadas.
4. **Redeploy do worker Railway** (ativa o heartbeat). Sem ele, o alerta campaign_worker_stalled dispara em falso assim que houver backlog >10min (1 alerta; auto-resolve quando o worker voltar com fila ok; dedup evita spam).
5. Confirmar limite de crons do plano Vercel: 34 após este pacote (Pro = 40).
6. Env vars necessárias (já existentes): UPSTASH_REDIS_REST_URL/TOKEN (heartbeat), CRON_SECRET.

## O que este pacote muda em produção
- Campanhas agendadas passam a disparar automaticamente (claim atômico, 3/tick/min).
- Mensagens agendadas passam a ser enviadas (25/tick/min, budget 45s, janela 24h validada, opt-out aplicado, recorrência com skip resiliente).
- "Enviar Agora", cancelar, excluir e editar agendamento corrigidos na UI/API.
- Métricas delivered/read de campanha passam a atualizar via webhook (RPC transacional anti-retrógrado).
- Envio de campanha exige template APPROVED e auth na rota.
- Worker Railway monitorado (heartbeat + alerta com dedup/auto-resolve).

## Riscos conhecidos / follow-ups
- Recipients órfãos se insert parcial falhar entre batches (raro; follow-up: recriação idempotente).
- Heartbeat global único (multi-réplica de worker mascara morte de réplica).
- batch enqueue: zadds individuais (otimização futura addBatch pipelined completo).
- UI não exibe status transitórios 'queued'/'processing' (cosmético, segundos).
