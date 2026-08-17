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
  { id: 'discovery', label: 'Missão · WhatsApp direto', sub: 'quando o cliente chama a loja', color: '#3B6EF6', tint: '#EEF3FF' },
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

// Um juiz criado pelo lojista (settings.judges.custom). No runtime ele vira
// critério REAL do Judge 1 pré-envio — severidade sempre `standard`: reprova
// e regenera, nunca silencia (o veto crítico é da plataforma, D1).
export interface CustomJudge {
  id: string;
  name: string;
  criterion: string;
  active: boolean;
}

// Entrega (Pacote B 17/08): os knobs de COMO a resposta chega — janela de
// agrupamento de rajada e humanização. Moram em settings.delivery; o webhook
// lê o debounce por org e o runtime carrega as flags em cada envio.
export interface DeliveryPrefs {
  debounce_seconds: number;
  split_bubbles: boolean;
  typing_rhythm: boolean;
}

export const DELIVERY_DEBOUNCE_MIN = 3;
export const DELIVERY_DEBOUNCE_MAX = 60;
export const DELIVERY_DEBOUNCE_DEFAULT = 8;

export function sanitizeDelivery(raw: unknown): DeliveryPrefs {
  const record = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const seconds = Number(record.debounce_seconds);
  return {
    debounce_seconds: Number.isFinite(seconds)
      ? Math.min(DELIVERY_DEBOUNCE_MAX, Math.max(DELIVERY_DEBOUNCE_MIN, Math.round(seconds)))
      : DELIVERY_DEBOUNCE_DEFAULT,
    split_bubbles: record.split_bubbles !== false,
    typing_rhythm: record.typing_rhythm !== false,
  };
}

function sanitizeJudges(raw: unknown): CustomJudge[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomJudge[] = [];
  raw.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const judge = entry as Record<string, unknown>;
    if (typeof judge.criterion !== 'string' || !judge.criterion.trim()) return;
    out.push({
      id: typeof judge.id === 'string' && judge.id ? judge.id : `judge-${index + 1}`,
      name: typeof judge.name === 'string' ? judge.name : '',
      criterion: judge.criterion,
      active: judge.active !== false,
    });
  });
  return out;
}

export interface HubState {
  identity: { name: string; voice: Voice; presentation: Presentation };
  // A missão é a ESPECIFICAÇÃO do evento (correção do usuário 13/08): a área
  // "WhatsApp direto" edita o playbook completo de whatsapp.received via
  // MissionEditorModal — o hub só carrega se a família tem ativa (o ponto).
  discovery: { has_mission: boolean };
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
  judges: { custom: CustomJudge[] };
  budget: { model: string; provider: string };
  delivery: DeliveryPrefs;
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
    discovery: { has_mission: false },
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
    judges: { custom: sanitizeJudges(settings.judges?.custom) },
    budget: {
      model: agent.model ?? 'gpt-4o-mini',
      provider: agent.provider ?? 'openai',
    },
    delivery: sanitizeDelivery(settings.delivery),
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
  settings.judges = {
    ...(settings.judges ?? {}),
    custom: hub.judges.custom.map((judge) => ({ ...judge })),
  };
  settings.delivery = { ...sanitizeDelivery(hub.delivery) };

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
      return hub.discovery.has_mission;
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

// O seletor de "viés" (vendedor/suporte/híbrido) morreu na correção 13/08:
// missão é a especificação do EVENTO, e a área WhatsApp direto abre o editor
// completo — o objetivo é texto livre do lojista, não um de três papéis.
