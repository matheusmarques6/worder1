/** Shared, literal wire payload: Python consumes this same fixture in
 * test_hub_configuration_parity.py. A renamed writer OR reader breaks a side.
 * All expectations below are independent of the writer's output. */
import { afterEach, describe, expect, it } from 'vitest';
import saved from './fixtures/hub-runtime-agent.json';
import runtimeTemplates from './fixtures/hub-runtime-templates.json';
import { agentToHub, hubToAgentPatch, type HubState } from '../agent-hub';
import { AGENT_TEMPLATES, templateJudges } from '../agent-templates';
import { TOOL_CATALOG } from '../tools/catalog';
import { clearDeliveryCache, getDeliveryDebounceSeconds } from '../delivery-settings';

const draft: HubState = {
  identity: { name: 'Aurora', voice: 'luxury', presentation: 'discreta' },
  discovery: { has_mission: false },
  knowledge: { sources: 0 },
  adapt: {
    mirror_tone: true, mirror_length: true, emoji_if_client: true,
    insist_less_after_complaint: true, distinct_greeting_repeat_buyer: true,
    base_length: 'long',
  },
  tools: { enabled: ['transfer_to_human', 'search_knowledge', 'save_customer', 'save_interests',
    'timeline', 'product_lookup', 'order_status', 'create_coupon'] },
  limits: { blocked: ['assunto confidencial'], invariants: ['Informe o prazo oficial da loja.'] },
  handoff: { keywords: ['quero uma pessoa', 'suporte especializado'],
    message: 'A equipe especializada continua daqui.' },
  judges: { custom: [
    { id: 'prazo', name: 'Prazo oficial', criterion: 'Confira o prazo na fonte oficial.', active: true },
    { id: 'desligado', name: 'Desligado', criterion: 'Este critério está desativado.', active: false },
  ] },
  budget: { provider: 'anthropic', model: 'anthropic/claude-sonnet-4.5', cap_usd: 17.25 },
  delivery: { debounce_seconds: 37, split_bubbles: false, typing_rhythm: false },
};

describe('IA-21/22/30–36/58: Construtor → contrato real do runtime', () => {
  afterEach(clearDeliveryCache);

  it('escreve todos os controles em colunas/chaves que o Python consome', () => {
    // Provider is informative in the Builder. Destination is separately owned
    // by BuilderCanvas.save; merge must preserve it when hub areas are saved.
    const original = {
      id: saved.id, provider: 'anthropic', system_prompt: saved.system_prompt,
      persona: { language: 'pt-BR' },
      settings: { safety: { handoff_destination: '22222222-2222-4222-8222-222222222222' } },
    };
    expect({ ...original, ...hubToAgentPatch(original, draft) }).toEqual(saved);
  });

  it('relê os valores salvos sem substituí-los pelos defaults', () => {
    expect(agentToHub(saved)).toEqual(draft);
  });

  it.each(['casual', 'friendly', 'professional', 'luxury'] as const)(
    'IA-21: persiste e relê a voz %s', (voice) => {
      const hub = structuredClone(draft);
      hub.identity.voice = voice;
      const patch = hubToAgentPatch(saved, hub);
      expect(patch.persona.tone).toBe(voice);
      expect(agentToHub({ ...saved, ...patch }).identity.voice).toBe(voice);
    },
  );

  it.each(['transparente', 'nome_funcao', 'discreta'] as const)(
    'IA-22: persiste e relê a apresentação %s', (presentation) => {
      const hub = structuredClone(draft);
      hub.identity.presentation = presentation;
      const patch = hubToAgentPatch(saved, hub);
      expect(patch.presentation_mode).toBe(presentation);
      expect(agentToHub({ ...saved, ...patch }).identity.presentation).toBe(presentation);
    },
  );

  it.each(['mirror_tone', 'mirror_length', 'emoji_if_client',
    'insist_less_after_complaint', 'distinct_greeting_repeat_buyer'] as const)(
    'IA-30: desligar %s não altera os outros ajustes', (flag) => {
      const hub = structuredClone(draft);
      hub.adapt[flag] = false;
      const patch = hubToAgentPatch(saved, hub);
      expect(patch.client_adaptation).toEqual({ ...saved.client_adaptation, [flag]: false });
      expect(agentToHub({ ...saved, ...patch }).adapt).toEqual(hub.adapt);
    },
  );

  it.each([[1, 3], [3, 3], [37, 37], [60, 60], [90, 60]])(
    'IA-36: debounce %s chega ao consumidor do webhook como %s segundos', async (raw, wanted) => {
      const hub = structuredClone(draft);
      hub.delivery.debounce_seconds = raw;
      const patch = hubToAgentPatch(saved, hub);
      // Only database I/O is replaced; sanitation, patching and cache reader are real.
      const query = {
        select: () => query, eq: () => query, order: () => query, limit: () => query,
        maybeSingle: async () => ({ data: patch, error: null }),
      };
      expect(patch.settings.delivery.debounce_seconds).toBe(wanted);
      expect(await getDeliveryDebounceSeconds({ from: () => query }, saved.id)).toBe(wanted);
    },
  );

  it('IA-58: remover listas, juiz e teto não ressuscita configuração antiga', () => {
    const hub = structuredClone(draft);
    hub.tools.enabled = [];
    hub.handoff = { keywords: [], message: '' };
    hub.limits = { blocked: [], invariants: [] };
    hub.judges.custom = [];
    hub.budget.cap_usd = null;
    const roundTrip = agentToHub({ ...saved, ...hubToAgentPatch(saved, hub) });
    expect(roundTrip).toEqual(hub);
  });
});

describe('IA-10: modelos reais não gravam vocabulário desconhecido', () => {
  it.each(AGENT_TEMPLATES)('$id tem todas as configurações propagadas pelo hub', (template) => {
    const row = {
      id: saved.id, name: template.name, system_prompt: template.system_prompt,
      persona: { ...template.persona, guidelines: template.rules },
      client_adaptation: template.client_adaptation,
      settings: {
        tools: { enabled: template.tools },
        safety: { blocked_topics: template.blocked_topics,
          handoff_keywords: template.handoff_keywords,
          handoff_confirmation_message: template.handoff_confirmation_message },
        judges: { custom: templateJudges(template) },
      },
    };
    const hub = agentToHub(row);
    const patch = hubToAgentPatch(row, hub);
    // Frozen wire snapshots consumed by Python, never regenerated at test time.
    const expected = runtimeTemplates.find((item) => item.id === template.id);
    expect(expected).toBeDefined();
    expect({ ...row, id: template.id, model: 'openai/gpt-4o-mini',
      provider: 'openai', presentation_mode: 'nome_funcao',
    }).toEqual(expected);
    expect(patch.persona).toEqual(row.persona);
    expect(patch.settings.tools).toEqual(row.settings.tools);
    expect(patch.settings.safety).toEqual(row.settings.safety);
    expect(patch.settings.judges).toEqual(row.settings.judges);
    expect(Object.keys(template.client_adaptation).every((key) =>
      Object.hasOwn(saved.client_adaptation, key))).toBe(true);
    expect(template.tools.every((tool) =>
      [...TOOL_CATALOG.map((entry) => entry.name), 'create_coupon'].includes(tool))).toBe(true);
    for (const [key, value] of Object.entries(template.client_adaptation)) {
      expect(patch.client_adaptation[key]).toBe(value);
    }
  });
});
