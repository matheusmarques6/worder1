// =============================================================
// Cobertura das correções do construtor de fluxos:
//
//  1. Convergência de ramos — um nó alcançado pelo ramo vencedor não
//     pode ser pulado só porque o ramo perdedor também chega nele.
//  2. Condição legada sem sourceHandle não mata o fluxo inteiro.
//  3. logic_randomizer devolve um branch que casa com os handles reais.
//  4. condition_field resolve os caminhos que a UI oferece
//     (event.* → trigger.data.*, contact.snake_case → camelCase).
//  5. Chave de idempotência canônica por evento de negócio (dedup do
//     disparo triplo de pedido).
//  6. Conector lógico E/OU dos filtros de gatilho.
//  7. Validação de publicação: delay lido do config real, configs
//     obrigatórias por nó, nós sem executor.
// =============================================================

import { describe, it, expect } from 'vitest';
import { ExecutionEngine, type Workflow } from '../execution-engine';
import { nodeExecutors } from '../node-executors';
import { filterLogicOf } from '../trigger-dispatcher';
import { validateFlow } from '../flow-validation';
import { buildEventIdempotencyKey, EventType } from '../../events';

const stubSupabase: any = {
  from() { throw new Error('supabase should not be called in these tests'); },
};

function engine() {
  return new ExecutionEngine({ supabase: stubSupabase, isTest: true });
}

function node(id: string, type: string, category: string, config: any = {}) {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { label: id, category, nodeType: type, config },
  } as any;
}

// -------------------------------------------------------------
// 1 + 2. Roteamento de ramos
// -------------------------------------------------------------
describe('roteamento de ramos de condição', () => {
  it('mantém o nó de reencontro quando os dois ramos convergem', async () => {
    const workflow: Workflow = {
      id: 'wf-merge',
      name: 'Convergência',
      nodes: [
        node('t', 'trigger_signup', 'trigger'),
        node('cond', 'condition_field', 'condition', { field: 'contact.email', operator: 'is_set' }),
        node('sim', 'action_tag', 'action', { tagName: 'sim' }),
        node('nao', 'action_tag', 'action', { tagName: 'nao' }),
        node('fim', 'action_tag', 'action', { tagName: 'fim' }),
      ],
      edges: [
        { id: 'e0', source: 't', target: 'cond' },
        { id: 'e1', source: 'cond', target: 'sim', sourceHandle: 'true' },
        { id: 'e2', source: 'cond', target: 'nao', sourceHandle: 'false' },
        // Os dois ramos voltam a se encontrar no mesmo nó final.
        { id: 'e3', source: 'sim', target: 'fim' },
        { id: 'e4', source: 'nao', target: 'fim' },
      ],
    };

    const result = await engine().execute(workflow, {
      context: { contact: { id: 'c1', email: 'a@b.com' } },
    } as any);

    // Ramo verdadeiro roda, ramo falso é pulado...
    expect(result.nodeResults['sim'].status).toBe('success');
    expect(result.nodeResults['nao'].status).toBe('skipped');
    // ...e o nó de reencontro NÃO pode ser pulado.
    expect(result.nodeResults['fim'].status).toBe('success');
  });

  it('não pula nada quando a condição legada não tem handles nas saídas', async () => {
    const workflow: Workflow = {
      id: 'wf-legacy',
      name: 'Legado sem handle',
      nodes: [
        node('t', 'trigger_signup', 'trigger'),
        node('cond', 'condition_field', 'condition', { field: 'contact.email', operator: 'is_set' }),
        node('a', 'action_tag', 'action', { tagName: 'a' }),
      ],
      edges: [
        { id: 'e0', source: 't', target: 'cond' },
        { id: 'e1', source: 'cond', target: 'a' }, // sem sourceHandle
      ],
    };

    const result = await engine().execute(workflow, {
      context: { contact: { id: 'c1', email: 'a@b.com' } },
    } as any);
    expect(result.nodeResults['a'].status).toBe('success');
  });
});

// -------------------------------------------------------------
// 3. Randomizer
// -------------------------------------------------------------
describe('logic_randomizer', () => {
  it('devolve branch true/false compatível com os handles do nó', async () => {
    const res = await nodeExecutors.logic_randomizer.execute({
      node: {} as any,
      config: { variants: [{ name: 'A', weight: 50 }, { name: 'B', weight: 50 }], _nodeId: 'n1' },
      context: { contact: { id: 'contato-x' } } as any,
      supabase: stubSupabase,
      isTest: true,
    });
    expect(['true', 'false']).toContain(res.branch);
    expect(['A', 'B']).toContain(res.output.variant);
  });

  it('é determinístico para o mesmo contato', async () => {
    const call = () => nodeExecutors.logic_randomizer.execute({
      node: {} as any,
      config: { variants: [{ name: 'A', weight: 50 }, { name: 'B', weight: 50 }], _nodeId: 'n1' },
      context: { contact: { id: 'mesmo-contato' } } as any,
      supabase: stubSupabase,
      isTest: true,
    });
    const [a, b] = await Promise.all([call(), call()]);
    expect(a.branch).toBe(b.branch);
  });
});

// -------------------------------------------------------------
// 4. Resolução de caminhos na condição
// -------------------------------------------------------------
describe('condition_field — caminhos oferecidos pela UI', () => {
  const run = (config: any, context: any) =>
    nodeExecutors.condition_field.execute({
      node: {} as any, config, context, supabase: stubSupabase, isTest: true,
    });

  it('resolve event.* contra trigger.data.*', async () => {
    const res = await run(
      { field: 'event.order_value', operator: 'greater_than', value: '100' },
      { trigger: { data: { order_value: 250 } } }
    );
    expect(res.branch).toBe('true');
  });

  it('resolve contact.first_name contra o contato camelCase do contexto', async () => {
    const res = await run(
      { field: 'contact.first_name', operator: 'equals', value: 'Maria' },
      { contact: { firstName: 'Maria' } }
    );
    expect(res.branch).toBe('true');
  });

  it('continua respeitando o caminho literal quando ele existe', async () => {
    const res = await run(
      { field: 'contact.email', operator: 'contains', value: '@loja' },
      { contact: { email: 'cliente@loja.com' } }
    );
    expect(res.branch).toBe('true');
  });

  it('cai no ramo falso quando o campo realmente não existe', async () => {
    const res = await run(
      { field: 'contact.inexistente', operator: 'equals', value: 'x' },
      { contact: { email: 'a@b.com' } }
    );
    expect(res.branch).toBe('false');
  });
});

// -------------------------------------------------------------
// 5. Idempotência canônica (dedup do disparo triplo)
// -------------------------------------------------------------
describe('buildEventIdempotencyKey', () => {
  it('usa a mesma chave do webhook Shopify para pedido criado', () => {
    const key = buildEventIdempotencyKey(EventType.ORDER_CREATED, {
      organization_id: 'org', order_id: '12345', data: {},
    } as any);
    expect(key).toBe('trigger:placed_order:12345');
  });

  it('deriva do payload quando order_id não vem no topo', () => {
    const key = buildEventIdempotencyKey(EventType.ORDER_CREATED, {
      organization_id: 'org', data: { order_id: '999' },
    } as any);
    expect(key).toBe('trigger:placed_order:999');
  });

  it('dedupa o welcome flow por contato', () => {
    const key = buildEventIdempotencyKey(EventType.CONTACT_CREATED, {
      organization_id: 'org', contact_id: 'c-1', data: {},
    } as any);
    expect(key).toBe('trigger:signup:c-1');
  });

  it('não inventa chave quando não há id estável', () => {
    const key = buildEventIdempotencyKey(EventType.ORDER_CREATED, {
      organization_id: 'org', data: {},
    } as any);
    expect(key).toBeUndefined();
  });
});

// -------------------------------------------------------------
// 6. Conector lógico E/OU
// -------------------------------------------------------------
describe('filterLogicOf', () => {
  it('assume E quando nada foi configurado (fluxos existentes)', () => {
    expect(filterLogicOf(undefined, 'triggerFiltersLogic')).toBe('and');
    expect(filterLogicOf({}, 'audienceFiltersLogic')).toBe('and');
  });

  it('lê OU quando o lojista escolhe', () => {
    expect(filterLogicOf({ triggerFiltersLogic: 'or' }, 'triggerFiltersLogic')).toBe('or');
    expect(filterLogicOf({ audienceFiltersLogic: 'OR' }, 'audienceFiltersLogic')).toBe('or');
  });

  it('ignora valor desconhecido e volta pro E', () => {
    expect(filterLogicOf({ triggerFiltersLogic: 'xyz' }, 'triggerFiltersLogic')).toBe('and');
  });
});

// -------------------------------------------------------------
// 7. Validação de publicação
// -------------------------------------------------------------
describe('validateFlow', () => {
  const trigger = node('t', 'trigger_signup', 'trigger');
  const emailOk = node('mail', 'action_email', 'action', {
    subject: 'Oi', preheader: 'p', senderEmail: 'a@b.com', templateId: 'tpl', emailStatus: 'live',
  });
  const edgeTo = (target: string) => ({ id: `e-${target}`, source: 't', target });

  it('barra delay configurado com valor negativo (lendo config.value real)', () => {
    const delay = node('d', 'control_delay', 'control', { value: -5, unit: 'hours' });
    const r = validateFlow([trigger, delay, emailOk], [edgeTo('d'), { id: 'e2', source: 'd', target: 'mail' }]);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'NEGATIVE_DELAY')).toBe(true);
  });

  it('aceita delay válido', () => {
    const delay = node('d', 'control_delay', 'control', { value: 2, unit: 'days' });
    const r = validateFlow([trigger, delay, emailOk], [edgeTo('d'), { id: 'e2', source: 'd', target: 'mail' }]);
    expect(r.errors.filter(e => e.code === 'NEGATIVE_DELAY')).toHaveLength(0);
  });

  it('barra "aguardar até" sem data nem horário', () => {
    const until = node('u', 'control_delay_until', 'control', {});
    const r = validateFlow([trigger, until, emailOk], [edgeTo('u'), { id: 'e2', source: 'u', target: 'mail' }]);
    expect(r.errors.some(e => e.code === 'DELAY_UNTIL_UNCONFIGURED')).toBe(true);
  });

  it('barra nó de tag sem nome de tag', () => {
    const tag = node('tg', 'action_tag', 'action', {});
    const r = validateFlow([trigger, tag], [edgeTo('tg')]);
    expect(r.errors.some(e => e.code === 'TAG_NAME_REQUIRED')).toBe(true);
  });

  it('barra webhook sem URL e lista sem lista', () => {
    const wh = node('w', 'action_webhook', 'action', {});
    const lst = node('l', 'action_add_to_list', 'action', {});
    const r = validateFlow([trigger, wh, lst], [edgeTo('w'), edgeTo('l')]);
    expect(r.errors.some(e => e.code === 'WEBHOOK_URL_REQUIRED')).toBe(true);
    expect(r.errors.some(e => e.code === 'LIST_REQUIRED')).toBe(true);
  });

  it('barra nó sem executor no motor', () => {
    const dead = node('x', 'action_update_contact', 'action', {});
    const r = validateFlow([trigger, dead, emailOk], [edgeTo('x'), edgeTo('mail')]);
    expect(r.errors.some(e => e.code === 'NODE_TYPE_UNSUPPORTED')).toBe(true);
  });

  it('avisa (sem barrar) que um email fora de Live não será enviado', () => {
    const draft = node('mail', 'action_email', 'action', {
      subject: 'Oi', preheader: 'p', senderEmail: 'a@b.com', templateId: 'tpl', emailStatus: 'draft',
    });
    const r = validateFlow([trigger, draft], [edgeTo('mail')]);
    expect(r.warnings.some(w => w.code === 'EMAIL_NOT_LIVE')).toBe(true);
    expect(r.errors.some(e => e.code === 'EMAIL_NOT_LIVE')).toBe(false);
  });

  it('aprova um fluxo completo e bem configurado', () => {
    const r = validateFlow([trigger, emailOk], [edgeTo('mail')]);
    expect(r.valid).toBe(true);
  });
});
