# 2026-10-15-07 · Copiloto do inbox pelo runtime; verificação de paridade do envio

Plano de implementação IA, M1 passos 10 e 11.

## Passo 10 — verificação (sem mudança de comportamento)

Conferido contra `cloud-runner.ts` e `cloud-sender.ts`:

- Janela de 24 h fechada: o preflight do sender (`internal.sender_preflight`)
  rebaixa para template ou suprime antes do envio; um erro da Meta com HTTP
  400 (fora dos códigos de excesso) é classificado `PERMANENT` por
  `failures.classify` e a linha da outbox fica `failed` com o motivo — não há
  a retentativa inútil que o legado faz com `window_closed`.
- Guards de comportamento (`guards.evaluate_inbound_guards`): ativação
  manual, cooldown pós-transferência, cooldown anti-loop de 5 s, teto de
  mensagens por conversa, parar em resposta humana, horário — na mesma
  ordem do TS (`cloud-runner.ts:486-561`), coberto por
  `hub-runtime-parity.test.ts` (TS) e `tests/unit/test_guards*.py`.
- `FORK.md` itens 23 (`agent_traces`) e 26 (falha permanente vira alerta)
  estavam desatualizados: ambos já implementados (`record_accepted_trace`,
  `send_failed`/`mission_touch_failed` + replay automático da DLQ). Marcados
  como resolvidos.

## Passo 11 — o que mudou

O botão "Sugerir resposta" do inbox (CopilotSidebar) passa a ser atendido
pelo runtime: `POST /internal/suggest-reply` compila o MESMO prompt do agente
(`compile_prompt` em modo preview), lê as últimas 20 mensagens da conversa
canônica, consulta a base de conhecimento (quando existe) e pede ao modelo
da ORG (cascata BYO) a próxima mensagem que o atendente humano deve enviar.
Sem Juiz 1: o atendente é o juiz. Custo em `internal.llm_calls` com
`purpose='copilot'` (e `embedding` para a busca), espelhado em
`ai_usage_logs` como `copilot`.

## Por quê

O copiloto legado (`ai-chatbot-service.ts::getCopilotSuggestion`) lia a
tabela antiga `whatsapp_conversations` (a inbox Cloud usa
`whatsapp_cloud_conversations`), então devolvia "Conversation not found"
para conversas reais; usava a chave de plataforma `OPENAI_API_KEY` em vez da
chave da org; e não passava pelo teto de gasto nem pela trilha do runtime.
Com a migração total para o runtime, o copiloto é o último caminho de IA
sobre conversas que ainda rodava no Next.js.

## Como

- Migration `20261016000006_canonical_conversation_for_mirror.sql`:
  `internal.canonical_conversation_for_mirror(org, mirror_id)` — o inverso
  de `legacy_conversation_guard_state`: espelho → `wa_id` → identidade →
  contato → conversa canônica mais recente. SECURITY DEFINER com grant ao
  `worker_role`.
- `repository/agent.py::canonical_conversation_for_mirror`.
- `agent_core/copilot.py`: `copilot_messages` (pura: frame + instrução como
  `system`, conversa como chat, última mensagem sem duplicar) e
  `suggest_reply` (banco, busca de conhecimento com o embedder de
  plataforma, cascata BYO, `MeteredLlm` com `purpose="copilot"`).
  `CopilotUnavailable` nomeia os três motivos de 422: conversa sem
  canônica, org sem agente ativo, org sem chave de LLM.
- `server.py`: rota `/internal/suggest-reply` (mesmo bearer do preview),
  `serve(..., platform_llm, base_secret)`.
- `__main__.py`: `_platform_llm_optional()` — sem `AGENTS_OPENROUTER_API_KEY`
  o listener sobe e o copiloto responde 503 (quem exige a chave na partida
  continua sendo o responder).
- `src/app/api/whatsapp/ai/copilot/route.ts`: com `AGENTS_RUNTIME_URL` +
  `AGENTS_PREVIEW_TOKEN`, faz proxy para o runtime com
  `mirror_conversation_id`; 422 do runtime vira 422; sem runtime configurado
  cai no serviço legado (desenvolvimento). `.env.example` atualizado.

## Testes

`tests/unit/test_copilot.py` (4 casos) para a parte pura. O endpoint segue
o mesmo padrão do preview (sem teste de unidade do socket). Suíte unit: 2104
verdes; `test_listener_connects_in_one_guarded_place` continua verde porque
o cliente de plataforma é opcional no listener.

Pendente (exige banco): caso de db para
`canonical_conversation_for_mirror` e um pipeline de sugestão com LLM
simulado.

## Como verificar em produção

No inbox, abrir uma conversa com histórico e clicar em "Sugerir resposta":
a sugestão vem no tom do agente; `internal.llm_calls` ganha uma linha
`copilot` com `agent_id` e `conversation_id`. Com a org sem chave de LLM, a
tela mostra o motivo (422), não um erro genérico.
