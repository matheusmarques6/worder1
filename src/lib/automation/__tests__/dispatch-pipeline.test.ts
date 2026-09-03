// =============================================================
// Integração do pipeline UNIFICADO de disparo.
//
// Depois da unificação, EventBus e EventProcessor delegam ao
// dispatchTrigger — que é agora o único lugar que cria automation_runs.
// Estes testes exercitam o pipeline inteiro contra um Supabase de
// mentira e provam, com um fluxo real de ponta a ponta, que:
//
//   - trigger_filters de payload são aplicados (antes ignorados em
//     todo gatilho servido pelos caminhos legados);
//   - o conector E/OU entre os filtros funciona nos dois modos;
//   - o limite de frequência bloqueia a reentrada;
//   - a idempotência descarta o mesmo evento chegando duas vezes —
//     é o que mata o disparo triplo de um pedido;
//   - o escopo de loja não deixa a loja A cair nos fluxos da loja B.
// =============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Supabase de mentira -------------------------------------
// Modela só o que o dispatchTrigger usa: automations (busca dos
// fluxos), automation_runs (idempotência, frequência e insert) e
// organizations (flag de skip). Cada teste declara as linhas.
type Row = Record<string, any>;

const db: {
  automations: Row[];
  automation_runs: Row[];
  organizations: Row[];
  inserted: Row[];
} = { automations: [], automation_runs: [], organizations: [], inserted: [] };

function makeQuery(table: string) {
  // Filtros acumulados; aplicados na resolução (await / maybeSingle).
  const conds: Array<(r: Row) => boolean> = [];
  let insertPayload: Row | null = null;

  const rows = () => {
    const source =
      table === 'automations' ? db.automations :
      table === 'automation_runs' ? db.automation_runs :
      table === 'organizations' ? db.organizations : [];
    return source.filter(r => conds.every(c => c(r)));
  };

  const api: any = {
    select: () => api,
    eq: (col: string, val: any) => { conds.push(r => r[col] === val); return api; },
    neq: (col: string, val: any) => { conds.push(r => r[col] !== val); return api; },
    gte: (col: string, val: any) => { conds.push(r => String(r[col] ?? '') >= String(val)); return api; },
    in: (col: string, vals: any[]) => { conds.push(r => vals.includes(r[col])); return api; },
    or: () => api, // o escopo de loja real é reforçado em JS no dispatcher
    limit: () => api,
    contains: (col: string, val: Row) => {
      conds.push(r => Object.entries(val).every(([k, v]) => r?.[col]?.[k] === v));
      return api;
    },
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    single: async () => {
      if (insertPayload) {
        const row = {
          id: `run-${db.inserted.length + 1}`,
          // O dispatcher filtra por janela de tempo (gte created_at) nas
          // checagens de idempotência e frequência; sem o carimbo, o run
          // recém-criado ficaria invisível para a chamada seguinte.
          created_at: new Date().toISOString(),
          ...insertPayload,
        };
        db.inserted.push(row);
        db.automation_runs.push(row);
        return { data: row, error: null };
      }
      return { data: rows()[0] ?? null, error: null };
    },
    insert: (payload: Row) => { insertPayload = payload; return api; },
    then: (resolve: any) => resolve({ data: rows(), error: null }),
  };
  return api;
}

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (table: string) => makeQuery(table) },
}));

import { dispatchTrigger } from '../trigger-dispatcher';

const ORG = 'org-1';
const STORE_A = '11111111-1111-4111-8111-111111111111';
const STORE_B = '22222222-2222-4222-8222-222222222222';
const CONTACT = 'contact-1';

function automation(over: Row = {}): Row {
  return {
    id: 'auto-1',
    organization_id: ORG,
    status: 'active',
    trigger_type: 'trigger_order',
    trigger_config: {},
    audience_filters: [],
    trigger_filters: [],
    frequency_config: { type: 'unlimited' },
    store_id: null,
    ...over,
  };
}

beforeEach(() => {
  db.automations = [];
  db.automation_runs = [];
  db.organizations = [{ id: ORG, skip_contacts_in_active_flows: false }];
  db.inserted = [];
});

const dispatch = (over: Record<string, any> = {}) =>
  dispatchTrigger({
    organizationId: ORG,
    triggerType: 'trigger_order',
    contactId: CONTACT,
    triggerData: { order_value: 250, Currency: 'BRL' },
    ...over,
  });

describe('pipeline unificado — filtros de payload', () => {
  it('cria o run quando o filtro do gatilho é satisfeito', async () => {
    db.automations = [automation({
      trigger_filters: [{ field: 'order_value', operator: 'greater_than', value: '100' }],
    })];
    const res = await dispatch();
    expect(res.runsCreated).toBe(1);
  });

  it('NÃO cria o run quando o filtro do gatilho reprova', async () => {
    db.automations = [automation({
      trigger_filters: [{ field: 'order_value', operator: 'greater_than', value: '500' }],
    })];
    const res = await dispatch();
    expect(res.runsCreated).toBe(0);
  });
});

describe('pipeline unificado — conector E/OU', () => {
  const twoFilters = [
    { field: 'order_value', operator: 'greater_than', value: '500' }, // falso
    { field: 'currency', operator: 'equals', value: 'BRL' },          // verdadeiro
  ];

  it('com E, uma condição falsa reprova o conjunto', async () => {
    db.automations = [automation({
      trigger_filters: twoFilters,
      trigger_config: { triggerFiltersLogic: 'and' },
    })];
    expect((await dispatch()).runsCreated).toBe(0);
  });

  it('com OU, uma condição verdadeira aprova o conjunto', async () => {
    db.automations = [automation({
      trigger_filters: twoFilters,
      trigger_config: { triggerFiltersLogic: 'or' },
    })];
    expect((await dispatch()).runsCreated).toBe(1);
  });

  it('sem escolha explícita, mantém E (fluxos já salvos não mudam)', async () => {
    db.automations = [automation({ trigger_filters: twoFilters })];
    expect((await dispatch()).runsCreated).toBe(0);
  });
});

describe('pipeline unificado — reentrada e duplicidade', () => {
  it('frequência "once" impede o segundo run do mesmo contato', async () => {
    db.automations = [automation({ frequency_config: { type: 'once' } })];

    expect((await dispatch()).runsCreated).toBe(1);
    // O run criado acima agora conta como execução anterior.
    expect((await dispatch()).runsCreated).toBe(0);
  });

  it('a mesma chave de idempotência descarta o disparo repetido', async () => {
    db.automations = [automation()];
    const key = 'trigger:placed_order:12345';

    const first = await dispatch({ idempotencyKey: key });
    expect(first.runsCreated).toBe(1);

    // É exatamente o caso do pedido que chega pelo webhook, pelo
    // EventBus e pelo pixel: só o primeiro vira run.
    const second = await dispatch({ idempotencyKey: key });
    expect(second.runsCreated).toBe(0);
    const third = await dispatch({ idempotencyKey: key });
    expect(third.runsCreated).toBe(0);

    expect(db.inserted).toHaveLength(1);
  });
});

describe('pipeline unificado — escopo de loja', () => {
  it('evento da loja A não entra em fluxo exclusivo da loja B', async () => {
    db.automations = [automation({ store_id: STORE_B })];
    expect((await dispatch({ storeId: STORE_A })).runsCreated).toBe(0);
  });

  it('evento da loja A entra em fluxo da loja A', async () => {
    db.automations = [automation({ store_id: STORE_A })];
    expect((await dispatch({ storeId: STORE_A })).runsCreated).toBe(1);
  });

  it('evento de loja entra em fluxo org-wide (sem loja definida)', async () => {
    db.automations = [automation({ store_id: null })];
    expect((await dispatch({ storeId: STORE_A })).runsCreated).toBe(1);
  });
});

describe('pipeline unificado — o run gravado', () => {
  it('carrega gatilho, contato, loja e a chave de idempotência', async () => {
    db.automations = [automation({ store_id: STORE_A })];
    await dispatch({ storeId: STORE_A, idempotencyKey: 'k-1' });

    expect(db.inserted).toHaveLength(1);
    const run = db.inserted[0];
    expect(run.organization_id).toBe(ORG);
    expect(run.contact_id).toBe(CONTACT);
    expect(run.trigger_type).toBe('trigger_order');
    expect(run.status).toBe('pending');
    expect(run.metadata.idempotency_key).toBe('k-1');
    expect(run.metadata.store_id).toBe(STORE_A);
    expect(run.metadata.trigger_data.order_value).toBe(250);
  });

  it('agenda o run quando o gatilho pede atraso', async () => {
    db.automations = [automation()];
    await dispatch({ delayMinutes: 60 });
    const run = db.inserted[0];
    expect(run.status).toBe('waiting');
    expect(new Date(run.waiting_until).getTime()).toBeGreaterThan(Date.now());
  });
});
