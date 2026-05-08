# Worder AI — Arquitetura

Este módulo segue o autorun completo descrito em `WORDER-AI-AUTORUN.md` (raiz do repositório). O documento define fases (F0 a F6), schema canônico (`ai_agents` + tabelas auxiliares), pipeline de processamento (monolítico na F1, multi-agente paralelo na F6), Knowledge Layers (institutional/operational/catalog/faq/execution), versionamento com rollback, Anti-Golpe e bateria de simulações pré-deploy. Esta fase (F0) consolida fundação: schema migration, refs legadas removidas, infra Redis/QStash configurada e env vars padronizadas. Para detalhes de cada fase e épico, consultar `WORDER-AI-AUTORUN.md`.

## Branch

A branch ativa para este módulo é `claude/setup-worder-ai-project-FswZB` (conforme instruções do harness; substitui `claude/worder-ai-v1` mencionada no autorun original).
