# Worder — Notas para Claude Code

## AI Module Architecture (Worder AI v1)

Status: em construção (Fases 0-1).

Schema canônico: tabela `ai_agents` (substitui `whatsapp_ai_agents` legada).

Pipeline: monolítico (default) com upgrade para multi-agent paralelo na F6.

Knowledge Layers: institutional/operational/catalog/faq/execution.

Versionamento: `ai_agent_versions` com rollback 1-clique.

Anti-Golpe: bloco "safety" no agente (toggle).

Pasta principal: `src/lib/ai/`.

Workers principais: `src/app/api/workers/ai-respond/` (F1).

UI principal: `src/app/(dashboard)/ai/` e `src/app/(dashboard)/inbox/`.

Documento autorun: ver mensagem original do usuário com o cabeçalho `WORDER AI — AUTORUN COMPLETO`. Resumo arquitetural condensado em `docs/ai-architecture.md`.

Branch ativa: `claude/setup-worder-ai-project-FswZB` (substitui `claude/worder-ai-v1` mencionada no autorun original; ditado pelo harness do agente).
