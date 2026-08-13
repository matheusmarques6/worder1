// 10.2 — o model da órbita: cada área lê e escreve COLUNA REAL de ai_agents
// (persona/settings/presentation_mode/client_adaptation). O round-trip é o
// contrato: agente → áreas → patch devolve os mesmos dados nos mesmos lugares,
// e chaves que a órbita não conhece SOBREVIVEM (merge, nunca replace).

import { describe, it, expect } from 'vitest';

import {
  HUB_AREAS,
  agentToHub,
  hubToAgentPatch,
  hubAreaDone,
} from '../agent-hub';

const AGENT = {
  id: 'ag-1',
  name: 'Duda',
  model: 'gpt-4o-mini',
  provider: 'openai',
  presentation_mode: 'transparente',
  client_adaptation: { mirror_tone: true, insist_less_after_complaint: true },
  persona: {
    tone: 'friendly',
    response_length: 'short',
    language: 'pt-BR',
    guidelines: ['Nunca prometer prazo menor que o dos Correios'],
    role_description: 'legado',
  },
  settings: {
    tools: { enabled: ['create_coupon'] },
    safety: {
      blocked_topics: ['Concorrentes'],
      handoff_keywords: ['falar com humano'],
      handoff_confirmation_message: 'Vou te passar para o time!',
    },
    schedule: { always_active: true },
  },
} as any;

describe('a órbita sobre dados reais', () => {
  it('são 9 áreas, nas 9 posições', () => {
    expect(HUB_AREAS).toHaveLength(9);
    expect(HUB_AREAS.map((a) => a.id)).toContain('discovery');
    expect(HUB_AREAS.map((a) => a.id)).not.toContain('papel');
  });

  it('agente → áreas: cada campo vem da coluna certa', () => {
    const hub = agentToHub(AGENT);
    expect(hub.identity).toMatchObject({
      name: 'Duda',
      voice: 'friendly',
      presentation: 'transparente',
    });
    expect(hub.adapt).toMatchObject({
      mirror_tone: true,
      mirror_length: false,
      insist_less_after_complaint: true,
      base_length: 'short',
    });
    expect(hub.limits).toMatchObject({
      blocked: ['Concorrentes'],
      invariants: ['Nunca prometer prazo menor que o dos Correios'],
    });
    expect(hub.handoff).toMatchObject({
      keywords: ['falar com humano'],
      message: 'Vou te passar para o time!',
    });
    expect(hub.tools.enabled).toEqual(['create_coupon']);
    expect(hub.budget).toMatchObject({ model: 'gpt-4o-mini', provider: 'openai' });
  });

  it('áreas → patch: round-trip preserva o que a órbita não conhece', () => {
    const hub = agentToHub(AGENT);
    hub.identity.name = 'Nina';
    hub.identity.presentation = 'discreta';
    hub.adapt.emoji_if_client = true;
    hub.limits.blocked = ['Concorrentes', 'Política'];
    hub.limits.invariants = ['Desconto máximo sem aprovação: 10%'];

    const patch = hubToAgentPatch(AGENT, hub);

    expect(patch.name).toBe('Nina');
    expect(patch.presentation_mode).toBe('discreta');
    expect(patch.client_adaptation).toMatchObject({
      mirror_tone: true,
      emoji_if_client: true,
      insist_less_after_complaint: true,
    });
    expect(patch.persona.guidelines).toEqual(['Desconto máximo sem aprovação: 10%']);
    // O que a órbita não edita, sobrevive:
    expect(patch.persona.role_description).toBe('legado');
    expect(patch.persona.language).toBe('pt-BR');
    expect(patch.settings.schedule).toEqual({ always_active: true });
    expect(patch.settings.safety.blocked_topics).toEqual(['Concorrentes', 'Política']);
    expect(patch.settings.safety.handoff_keywords).toEqual(['falar com humano']);
  });

  it('agente vazio nasce com os defaults do doc (nome_funcao)', () => {
    const hub = agentToHub({ id: 'x', persona: null, settings: null } as any);
    expect(hub.identity.presentation).toBe('nome_funcao');
    expect(hub.adapt.mirror_tone).toBe(false);
    expect(hub.tools.enabled).toEqual([]);
  });

  it('done é derivado do dado, nunca flag solta', () => {
    const hub = agentToHub(AGENT);
    expect(hubAreaDone(hub, 'identity')).toBe(true);
    expect(hubAreaDone(hub, 'limits')).toBe(true);
    const empty = agentToHub({ id: 'x' } as any);
    expect(hubAreaDone(empty, 'identity')).toBe(false);
    expect(hubAreaDone(empty, 'judges')).toBe(true); // Judge 1 é sempre real
  });

  it('juízes do lojista: agente → área → patch, lixo saneado no caminho', () => {
    const agent = {
      ...AGENT,
      settings: {
        ...AGENT.settings,
        judges: {
          custom: [
            { id: 'j1', name: 'Tom formal', criterion: 'Nunca usar gíria.', active: true },
            { id: 'j2', name: 'Vazio', criterion: '   ', active: true }, // sem critério → fora
            'texto', // shape errado → fora
            { name: 'Sem id nem active', criterion: 'Não escrever em CAIXA ALTA.' },
          ],
        },
      },
    } as any;

    const hub = agentToHub(agent);
    expect(hub.judges.custom).toHaveLength(2);
    expect(hub.judges.custom[0]).toEqual({
      id: 'j1', name: 'Tom formal', criterion: 'Nunca usar gíria.', active: true,
    });
    // Entrada legada sem id/active ganha id estável e nasce ativa.
    expect(hub.judges.custom[1].criterion).toBe('Não escrever em CAIXA ALTA.');
    expect(hub.judges.custom[1].active).toBe(true);
    expect(hub.judges.custom[1].id).toBeTruthy();

    hub.judges.custom = [
      ...hub.judges.custom,
      { id: 'j9', name: 'Novo', criterion: 'Sempre citar o prazo oficial.', active: false },
    ];
    const patch = hubToAgentPatch(agent, hub);
    expect(patch.settings.judges.custom).toHaveLength(3);
    expect(patch.settings.judges.custom[2]).toMatchObject({ id: 'j9', active: false });
    // Merge, nunca replace: o resto de settings sobrevive.
    expect(patch.settings.schedule).toEqual({ always_active: true });
  });
});
