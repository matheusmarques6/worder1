-- ============================================================================
-- 10.4 (Adendo §B) — presentation_mode e client_adaptation no agente.
--
-- presentation_mode: COMO o agente se apresenta (3 modos; default nome_funcao
-- por decisão do doc-fonte §4.4-4). A linha "nunca negue ser IA" NÃO mora
-- aqui — é emitida pelo prompt_compiler, inremovível, fora do alcance do
-- lojista; a UI apenas exibe.
--
-- client_adaptation: os toggles de adaptação ao jeito do cliente (espelhar
-- tom/tamanho/emoji + insistir menos com quem já reclamou + saudação distinta
-- p/ comprador recorrente — §4.4-5). Adaptação NUNCA mexe em dinheiro: por
-- schema, isto é um jsonb de flags de ESTILO; concessão vive nas missões.
-- ============================================================================

alter table public.ai_agents
    add column presentation_mode text not null default 'nome_funcao'
        constraint ai_agents_presentation_mode_check
        check (presentation_mode in ('transparente', 'nome_funcao', 'discreta'));

alter table public.ai_agents
    add column client_adaptation jsonb not null default '{}'::jsonb;

comment on column public.ai_agents.presentation_mode is
    'Como o agente se apresenta (10.4): transparente | nome_funcao | discreta. '
    'A linha "nunca negar ser IA" é do compiler, não deste campo.';
comment on column public.ai_agents.client_adaptation is
    'Flags de adaptação de ESTILO ao cliente (10.4): mirror_tone, '
    'mirror_length, emoji_if_client, insist_less_after_complaint, '
    'distinct_greeting_repeat_buyer. Dinheiro nunca entra aqui.';
