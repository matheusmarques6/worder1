// O model da órbita (Adendo §B, 10.2) — a pele nova sobre a MESMA linha de
// ai_agents que o runner legado e o compiler do runtime leem.
//
// Cada área mapeia coluna real: identity → name/persona.tone/presentation_mode;
// adapt → client_adaptation + persona.response_length; limits →
// settings.safety.blocked_topics + persona.guidelines (invariantes); handoff →
// settings.safety.handoff_*; tools → settings.tools.enabled; budget →
// model/provider. A área "discovery" (a 9ª posição, ex-"Papel" — §4.4-3) NÃO
// escreve no agente: edita o viés da missão whatsapp.received via API de
// missões — nada de "Seu papel é VENDER" global.
//
// Round-trip com merge: o patch preserva toda chave de persona/settings que a
// órbita não conhece (o editor legado continua dono do resto).

export interface HubArea {
  id: HubAreaId;
  label: string;
  sub: string;
  color: string;
  tint: string;
}

export type HubAreaId =
  | 'identity'
  | 'discovery'
  | 'adapt'
  | 'knowledge'
  | 'tools'
  | 'limits'
  | 'handoff'
  | 'judges'
  | 'budget';

// As 9 posições do protótipo (ORBIT_POS) — a ordem daqui é a ordem da órbita.
export const HUB_AREAS: HubArea[] = [
  { id: 'identity', label: 'Identidade', sub: 'nome, voz, apresentação', color: 'var(--orange, #F97316)', tint: '#FFF3EA' },
  { id: 'discovery', label: 'Missão descoberta (default)', sub: 'o viés do inbound espontâneo', color: '#3B6EF6', tint: '#EEF3FF' },
  { id: 'adapt', label: 'Adaptação', sub: 'ao jeito do cliente', color: '#7C5CFC', tint: '#F2EFFF' },
  { id: 'knowledge', label: 'Conhecimento', sub: 'fontes e catálogo', color: '#0E9384', tint: '#E6F5F3' },
  { id: 'tools', label: 'Ferramentas', sub: 'o que ele sabe operar', color: '#0B7285', tint: '#E3F3F6' },
  { id: 'limits', label: 'Limites', sub: 'o que nunca fazer', color: '#E5484D', tint: '#FDECEC' },
  { id: 'handoff', label: 'Handoff', sub: 'quando chamar humano', color: '#16A34A', tint: '#E9F7EE' },
  { id: 'judges', label: 'Juízes', sub: 'quem avalia o agente', color: '#E0930B', tint: '#FCF3E0' },
  { id: 'budget', label: 'Motor & budget', sub: 'modelo e custo', color: '#64748B', tint: '#EEF1F5' },
];

export const ORBIT_POS: Array<{ x: number; y: number }> = [
  { x: 50, y: 11 }, { x: 74, y: 19 }, { x: 88, y: 41 }, { x: 82, y: 66 },
  { x: 63, y: 81 }, { x: 37, y: 81 }, { x: 18, y: 66 }, { x: 12, y: 41 },
  { x: 26, y: 19 },
];

export type Voice = 'casual' | 'friendly' | 'professional' | 'luxury';
export type Presentation = 'transparente' | 'nome_funcao' | 'discreta';
export type DiscoveryBias = 'vendedor' | 'suporte' | 'hibrido';

export interface HubState {
  identity: { name: string; voice: Voice; presentation: Presentation };
  // bias null + has_mission true = missão ativa com objetivo personalizado;
  // bias null + has_mission false = a família ainda NEM TEM missão ativa.
  // Dois estados que a UI precisa distinguir para não mentir.
  discovery: { bias: DiscoveryBias | null; has_mission: boolean };
  adapt: {
    mirror_tone: boolean;
    mirror_length: boolean;
    emoji_if_client: boolean;
    insist_less_after_complaint: boolean;
    distinct_greeting_repeat_buyer: boolean;
    base_length: 'short' | 'medium' | 'long';
  };
  knowledge: { sources: number };
  tools: { enabled: string[] };
  limits: { blocked: string[]; invariants: string[] };
  handoff: { keywords: string[]; message: string };
  judges: Record<string, never>;
  budget: { model: string; provider: string };
}

type AgentRow = {
  id: string;
  name?: string | null;
  model?: string | null;
  provider?: string | null;
  presentation_mode?: string | null;
  client_adaptation?: Record<string, unknown> | null;
  persona?: Record<string, any> | null;
  settings?: Record<string, any> | null;
};

const PRESENTATIONS: Presentation[] = ['transparente', 'nome_funcao', 'discreta'];

export function agentToHub(agent: AgentRow): HubState {
  const persona = agent.persona ?? {};
  const settings = agent.settings ?? {};
  const adaptation = (agent.client_adaptation ?? {}) as Record<string, unknown>;
  const safety = settings.safety ?? {};
  const presentation = PRESENTATIONS.includes(agent.presentation_mode as Presentation)
    ? (agent.presentation_mode as Presentation)
    : 'nome_funcao';

  return {
    identity: {
      name: agent.name ?? '',
      voice: (persona.tone as Voice) ?? 'friendly',
      presentation,
    },
    discovery: { bias: null, has_mission: false },
    adapt: {
      mirror_tone: Boolean(adaptation.mirror_tone),
      mirror_length: Boolean(adaptation.mirror_length),
      emoji_if_client: Boolean(adaptation.emoji_if_client),
      insist_less_after_complaint: Boolean(adaptation.insist_less_after_complaint),
      distinct_greeting_repeat_buyer: Boolean(adaptation.distinct_greeting_repeat_buyer),
      base_length: (persona.response_length as 'short' | 'medium' | 'long') ?? 'medium',
    },
    knowledge: { sources: 0 },
    tools: { enabled: [...(settings.tools?.enabled ?? [])] },
    limits: {
      blocked: [...(safety.blocked_topics ?? [])],
      invariants: [...(persona.guidelines ?? [])],
    },
    handoff: {
      keywords: [...(safety.handoff_keywords ?? [])],
      message: safety.handoff_confirmation_message ?? '',
    },
    judges: {},
    budget: {
      model: agent.model ?? 'gpt-4o-mini',
      provider: agent.provider ?? 'openai',
    },
  };
}

export interface AgentHubPatch {
  name: string;
  presentation_mode: Presentation;
  client_adaptation: Record<string, boolean>;
  persona: Record<string, any>;
  settings: Record<string, any>;
  model: string;
}

export function hubToAgentPatch(agent: AgentRow, hub: HubState): AgentHubPatch {
  const persona = { ...(agent.persona ?? {}) };
  const settings = { ...(agent.settings ?? {}) };

  persona.tone = hub.identity.voice;
  persona.response_length = hub.adapt.base_length;
  persona.guidelines = [...hub.limits.invariants];

  settings.tools = { ...(settings.tools ?? {}), enabled: [...hub.tools.enabled] };
  settings.safety = {
    ...(settings.safety ?? {}),
    blocked_topics: [...hub.limits.blocked],
    handoff_keywords: [...hub.handoff.keywords],
    handoff_confirmation_message: hub.handoff.message,
  };

  return {
    name: hub.identity.name,
    presentation_mode: hub.identity.presentation,
    client_adaptation: {
      mirror_tone: hub.adapt.mirror_tone,
      mirror_length: hub.adapt.mirror_length,
      emoji_if_client: hub.adapt.emoji_if_client,
      insist_less_after_complaint: hub.adapt.insist_less_after_complaint,
      distinct_greeting_repeat_buyer: hub.adapt.distinct_greeting_repeat_buyer,
    },
    persona,
    settings,
    model: hub.budget.model,
  };
}

// "Concluída" é derivado do dado — nunca uma flag solta que minta sobre o
// prompt. Juízes é sempre done: o Judge 1 pré-envio é real e obrigatório.
export function hubAreaDone(hub: HubState, area: HubAreaId): boolean {
  switch (area) {
    case 'identity':
      return hub.identity.name.trim().length > 0;
    case 'discovery':
      // Missão ativa com objetivo personalizado É configuração — o nó não
      // pode dizer "a preencher" enquanto o drawer fala de missão existente.
      return hub.discovery.bias !== null || hub.discovery.has_mission;
    case 'adapt':
      return (
        hub.adapt.mirror_tone ||
        hub.adapt.mirror_length ||
        hub.adapt.emoji_if_client ||
        hub.adapt.insist_less_after_complaint ||
        hub.adapt.distinct_greeting_repeat_buyer
      );
    case 'knowledge':
      return hub.knowledge.sources > 0;
    case 'tools':
      return hub.tools.enabled.length > 0;
    case 'limits':
      return hub.limits.blocked.length > 0 || hub.limits.invariants.length > 0;
    case 'handoff':
      return hub.handoff.keywords.length > 0;
    case 'judges':
      return true;
    case 'budget':
      return hub.budget.model.trim().length > 0;
  }
}

export function hubDoneCount(hub: HubState): number {
  return HUB_AREAS.filter((a) => hubAreaDone(hub, a.id)).length;
}

// 10.6 — o viés da missão descoberta vive no OBJECTIVE da missão
// whatsapp.received (um dado, N portas: a radial e a MissionsTab editam o
// mesmo campo). Três textos canônicos; objective fora deles = personalizado.
export const DISCOVERY_OBJECTIVES: Record<DiscoveryBias, string> = {
  vendedor: 'Conduzir à compra: recomendar, tirar dúvida de produto e fechar o pedido.',
  suporte: 'Resolver o problema primeiro, sempre: status, trocas e pagamentos.',
  hibrido: 'Vender quando houver intenção, dar suporte quando houver problema.',
};

export function biasFromObjective(objective: string | null | undefined): DiscoveryBias | null {
  if (!objective) return null;
  const found = (Object.entries(DISCOVERY_OBJECTIVES) as Array<[DiscoveryBias, string]>).find(
    ([, text]) => text === objective.trim(),
  );
  return found ? found[0] : null;
}
