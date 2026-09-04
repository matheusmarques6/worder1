// =============================================================
// Espera de automação no fuso certo.
//
// O motor avaliava "enviar só entre 09:00 e 21:00" com getHours(), ou
// seja, no relógio do SERVIDOR — que na Vercel é UTC. Para uma loja
// brasileira a janela virava 06:00 às 18:00, e o erro era constante:
// nunca aparecia como falha, só como e-mail em hora estranha.
//
// Os testes abaixo rodam o executor de verdade e conferem o horário
// de PAREDE do resultado, que é a única coisa que o lojista percebe.
// =============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { nodeExecutors } from '../node-executors';
import { partsInTz } from '@/lib/scheduling/timezone';
import { __clearTimezoneCache } from '@/lib/scheduling/resolve';

const SP = 'America/Sao_Paulo';

/** Supabase que só sabe responder o fuso da loja e o da organização. */
function supabaseCom(opts: { lojaTz?: string | null; orgTz?: string | null } = {}): any {
  return {
    from(tabela: string) {
      const valor = tabela === 'shopify_stores'
        ? { timezone: opts.lojaTz ?? null }
        : { quiet_hours_timezone: opts.orgTz ?? null };
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: valor, error: null }),
        single: async () => ({ data: valor, error: null }),
      };
      return chain;
    },
  };
}

function contexto(contact: any, storeId: string | null = 'loja-1') {
  return { organizationId: 'org-1', storeId, contact } as any;
}

async function esperar(config: any, context: any, supabase: any) {
  return (nodeExecutors as any).control_delay.execute({
    node: { id: 'd', data: { config } },
    config, context, isTest: false, supabase, organizationId: 'org-1',
  });
}

beforeEach(() => __clearTimezoneCache());

describe('janela de horário do delay', () => {
  const janela = {
    value: 1, unit: 'seconds',
    restrictTime: true, timeFrom: '09:00', timeTo: '21:00',
  };

  it('usa o fuso do contato, não o do servidor', async () => {
    const r = await esperar(
      janela,
      contexto({ id: 'c1', timezone: 'Asia/Tokyo' }),
      supabaseCom({ lojaTz: SP })
    );
    const p = partsInTz('Asia/Tokyo', new Date(r.waitUntil));
    // Seja qual for a hora em que o teste rodar, o resultado tem de
    // cair dentro de 09:00–21:00 no relógio de Tóquio.
    expect(p.hour).toBeGreaterThanOrEqual(9);
    expect(p.hour).toBeLessThanOrEqual(21);
  });

  it('modo "loja" ignora o fuso do contato de propósito', async () => {
    const r = await esperar(
      { ...janela, timezoneMode: 'store' },
      contexto({ id: 'c1', timezone: 'Asia/Tokyo' }),
      supabaseCom({ lojaTz: SP })
    );
    const p = partsInTz(SP, new Date(r.waitUntil));
    expect(p.hour).toBeGreaterThanOrEqual(9);
    expect(p.hour).toBeLessThanOrEqual(21);
  });

  it('sem fuso no contato, deduz pelo país', async () => {
    const r = await esperar(
      janela,
      contexto({ id: 'c1', country: 'PT' }),
      supabaseCom({ lojaTz: SP })
    );
    expect(r.output.timezone).toBe('Europe/Lisbon');
    expect(r.output.timezoneSource).toBe('country');
  });

  it('sem contato nenhum, cai no fuso da loja e continua funcionando', async () => {
    const r = await esperar(janela, contexto(undefined), supabaseCom({ lojaTz: SP }));
    expect(r.output.timezone).toBe(SP);
    expect(r.output.timezoneSource).toBe('store');
    expect(r.status).toBe('waiting');
  });

  it('sem loja nem organização, ainda devolve um horário válido', async () => {
    const r = await esperar(janela, contexto(undefined, null), supabaseCom({}));
    expect(r.status).toBe('waiting');
    expect(new Date(r.waitUntil).getTime()).toBeGreaterThan(0);
  });
});

describe('restrição de dias do delay', () => {
  it('converte a convenção da UI (0=segunda) para a do JS (0=domingo)', async () => {
    // A UI grava [0,1,2,3,4] = seg a sex. O resultado nunca pode cair
    // no fim de semana. A conversão entre as duas convenções já estava
    // certa antes; o que estava errado era o RELÓGIO usado para ler o
    // dia — getDay() no servidor, em UTC. Sábado às 22h no Brasil já é
    // domingo em UTC, então a regra escorregava um dia perto das
    // viradas.
    const r = await esperar(
      {
        value: 1, unit: 'seconds',
        restrictDays: true, allowedDays: [0, 1, 2, 3, 4],
        restrictTime: true, timeFrom: '09:00', timeTo: '18:00',
      },
      contexto({ id: 'c1', timezone: SP }),
      supabaseCom({ lojaTz: SP })
    );
    const p = partsInTz(SP, new Date(r.waitUntil));
    expect(p.weekday).toBeGreaterThanOrEqual(1); // não é domingo
    expect(p.weekday).toBeLessThanOrEqual(5);    // não é sábado
  });

  it('só domingo permitido de fato cai num domingo', async () => {
    // [6] na convenção da UI é domingo.
    const r = await esperar(
      {
        value: 1, unit: 'seconds',
        restrictDays: true, allowedDays: [6],
        restrictTime: true, timeFrom: '10:00', timeTo: '11:00',
      },
      contexto({ id: 'c1', timezone: SP }),
      supabaseCom({ lojaTz: SP })
    );
    expect(partsInTz(SP, new Date(r.waitUntil)).weekday).toBe(0);
  });
});

describe('delay sem restrição', () => {
  it('não consulta fuso nenhum — só soma o tempo', async () => {
    const antes = Date.now();
    const r = await esperar(
      { value: 2, unit: 'hours' },
      contexto({ id: 'c1' }),
      // Um supabase que explode: se o executor consultar, o teste falha.
      { from() { throw new Error('não deveria consultar'); } }
    );
    const delta = new Date(r.waitUntil).getTime() - antes;
    expect(delta).toBeGreaterThan(1.9 * 3600_000);
    expect(delta).toBeLessThan(2.1 * 3600_000);
    expect(r.output.timezone).toBeUndefined();
  });
});

describe('control_delay_until', () => {
  async function ate(config: any, context: any, supabase: any) {
    return (nodeExecutors as any).control_delay_until.execute({
      node: { id: 'du', data: { config } },
      config, context, isTest: false, supabase, organizationId: 'org-1',
    });
  }

  it('"espere até as 09:00" marca 09:00 no relógio do contato', async () => {
    const r = await ate(
      { time: '09:00' },
      contexto({ id: 'c1', timezone: 'Europe/Lisbon' }),
      supabaseCom({ lojaTz: SP })
    );
    const p = partsInTz('Europe/Lisbon', new Date(r.waitUntil));
    expect(p.hour).toBe(9);
    expect(p.minute).toBe(0);
    expect(r.output.timezone).toBe('Europe/Lisbon');
  });

  it('o horário escolhido está sempre no futuro', async () => {
    const r = await ate(
      { time: '09:30' },
      contexto({ id: 'c1', timezone: SP }),
      supabaseCom({ lojaTz: SP })
    );
    expect(new Date(r.waitUntil).getTime()).toBeGreaterThan(Date.now());
    expect(partsInTz(SP, new Date(r.waitUntil)).minute).toBe(30);
  });

  it('data absoluta continua sendo instante, sem reinterpretar fuso', async () => {
    const quando = '2027-01-15T12:00:00.000Z';
    const r = await ate({ datetime: quando }, contexto({ id: 'c1', timezone: 'Asia/Tokyo' }), supabaseCom({}));
    expect(new Date(r.waitUntil).toISOString()).toBe(quando);
  });

  it('data inválida vira erro em vez de NaN silencioso', async () => {
    const r = await ate({ datetime: 'não é data' }, contexto({ id: 'c1' }), supabaseCom({}));
    expect(r.status).toBe('error');
  });

  it('sem configuração nenhuma, erro claro', async () => {
    const r = await ate({}, contexto({ id: 'c1' }), supabaseCom({}));
    expect(r.status).toBe('error');
  });
});
