// =============================================================
// Variable engine × canonical/flat/custom merge tags.
//
// The engine runs FIRST in the automation email pipeline
// (node-executors → variableEngine.process → sendCampaignEmail →
// resolveTriggerSmartTags → renderMergeTags). Two contracts matter:
//
//  1. Canonical un-prefixed tags ({{ CheckoutURL }}, {{ Customer.Email }},
//     {{ Items[0].ProductName }}, ...) RESOLVE from trigger.data in the
//     engine itself — so they work in every channel (email/WhatsApp/SMS).
//  2. Tags the engine does NOT own or cannot resolve (canonical misses,
//     flat email tags, custom.*, unknown "filters" that are really
//     {{tag|fallback}} syntax) are left INTACT — never consumed to '' —
//     so the downstream email resolvers still get their shot. The old
//     behavior blanked {{ CheckoutURL }} in every REAL automation send
//     while preview/test (which skip the engine) looked fine.
// =============================================================

import { describe, it, expect } from 'vitest';
import { variableEngine } from '../variable-engine';

const context: any = {
  trigger: {
    type: 'trigger_checkout_abandoned',
    data: {
      CheckoutURL: 'https://loja.myshopify.com/checkouts/recover/abc?key=1&discount=DISCOUNT10',
      Customer: { Email: 'maria@email.com', FirstName: 'Maria' },
      Items: [{ ProductName: 'Camiseta Premium', ItemPrice: 89.9 }],
    },
    timestamp: new Date().toISOString(),
  },
  nodes: {},
};

describe('variable engine — absolutização de URL relativa (produto visualizado)', () => {
  // Regressão do bug reportado: no gatilho de produto visualizado a automação
  // resolve {{ event.ProductURL }} PELO ENGINE (antes do sendCampaignEmail).
  // Se vier relativo (/products/<slug>), o clique caía em app.worder.com.br → 404.
  const viewCtx: any = {
    store: { domain: 'drgroot.com.br' },
    trigger: { type: 'trigger_viewed_product', data: { ProductURL: '/products/dr-groot-shampoo' } },
    nodes: {},
  };
  it('absolutiza {{ event.ProductURL }} relativo no engine', () => {
    expect(variableEngine.process('{{ event.ProductURL }}', viewCtx)).toBe(
      'https://drgroot.com.br/products/dr-groot-shampoo'
    );
  });
  it('absolutiza a canônica {{ ProductURL }} relativa', () => {
    expect(variableEngine.process('{{ ProductURL }}', viewCtx)).toBe(
      'https://drgroot.com.br/products/dr-groot-shampoo'
    );
  });
  it('não altera URL já absoluta', () => {
    const abs: any = { store: { domain: 'drgroot.com.br' }, trigger: { data: { ProductURL: 'https://loja.com/products/x' } }, nodes: {} };
    expect(variableEngine.process('{{ event.ProductURL }}', abs)).toBe('https://loja.com/products/x');
  });
  it('deriva a loja do evento quando store.domain não existe', () => {
    const evOnly: any = { trigger: { data: { ProductURL: '/products/x', StoreURL: 'https://minha.com.br' } }, nodes: {} };
    expect(variableEngine.process('{{ event.ProductURL }}', evOnly)).toBe('https://minha.com.br/products/x');
  });
  it('caso REAL de produção: sem context.store e sem StoreURL, deriva da url da página do pixel', () => {
    // process-runs NÃO popula context.store; o evento do pixel traz a url da
    // página (absoluta, da loja) + ProductURL relativa. Deve absolutizar usando
    // a url da página como host.
    const prodShape: any = {
      trigger: { type: 'trigger_viewed_product', data: { ProductURL: '/products/x', url: 'https://drgroot.com.br/products/x' } },
      nodes: {},
    };
    expect(variableEngine.process('{{ event.ProductURL }}', prodShape)).toBe('https://drgroot.com.br/products/x');
  });
});

describe('variable engine — canonical un-prefixed tags', () => {
  it('resolves {{ CheckoutURL }} from context.trigger.data', () => {
    expect(variableEngine.process('{{ CheckoutURL }}', context)).toBe(
      'https://loja.myshopify.com/checkouts/recover/abc?key=1&discount=DISCOUNT10'
    );
  });

  it('resolves deep {{ Customer.Email }}', () => {
    expect(variableEngine.process('{{ Customer.Email }}', context)).toBe('maria@email.com');
  });

  it('resolves indexed {{ Items[0].ProductName }}', () => {
    expect(variableEngine.process('{{ Items[0].ProductName }}', context)).toBe('Camiseta Premium');
  });

  it('resolves canonical paths nested under .raw', () => {
    const ctx: any = {
      trigger: { type: 't', data: { raw: { OrderNumber: '1234' } }, timestamp: '' },
    };
    expect(variableEngine.process('{{ OrderNumber }}', ctx)).toBe('1234');
  });

  it('leaves an UNRESOLVED canonical tag intact (non-consuming)', () => {
    expect(variableEngine.process('{{ Tracking.Number }}', context)).toBe('{{ Tracking.Number }}');
  });

  it('still resolves the legacy alias {{ trigger.CheckoutURL }}', () => {
    expect(variableEngine.process('{{ trigger.CheckoutURL }}', context)).toBe(
      'https://loja.myshopify.com/checkouts/recover/abc?key=1&discount=DISCOUNT10'
    );
  });
});

describe('variable engine — flat email tags and custom fields stay intact', () => {
  it('leaves unresolved {{ first_name }} literal for renderMergeTags downstream', () => {
    expect(variableEngine.process('Oi {{ first_name }}!', context)).toBe('Oi {{ first_name }}!');
  });

  it('leaves {{ custom.x }} literal when unresolved', () => {
    expect(variableEngine.process('{{ custom.x }}', context)).toBe('{{ custom.x }}');
  });

  it('treats {{ custom.campo|valor padrão }} (fallback syntax, unknown filter) as not engine-owned', () => {
    expect(variableEngine.process('{{ custom.campo|valor padrão }}', context)).toBe(
      '{{ custom.campo|valor padrão }}'
    );
  });

  it('leaves ANY tag with an unknown filter untouched (renderMergeTags fallback syntax)', () => {
    expect(variableEngine.process('{{ checkout_url|https://loja.com }}', context)).toBe(
      '{{ checkout_url|https://loja.com }}'
    );
  });

  it('still applies KNOWN filters normally', () => {
    expect(variableEngine.process('{{ Customer.FirstName | uppercase }}', context)).toBe('MARIA');
  });
});

describe('variable engine — smart trigger tags resolve IN the engine (WhatsApp/SMS parity)', () => {
  it('resolves {{ trigger.link }} from CheckoutURL via the shared helper', () => {
    expect(variableEngine.process('{{ trigger.link }}', context)).toBe(
      'https://loja.myshopify.com/checkouts/recover/abc?key=1&discount=DISCOUNT10'
    );
  });

  it('resolves first-item smart tags and counts', () => {
    expect(variableEngine.process('{{ trigger.first_item_name }}', context)).toBe('Camiseta Premium');
    expect(variableEngine.process('{{ trigger.first_item_price }}', context)).toBe('89.9');
    expect(variableEngine.process('{{ trigger.items_count }}', context)).toBe('1');
  });

  it('leaves the smart-tag paths literal on a MISS (email pipeline resolves with storeUrl)', () => {
    const emptyCtx: any = { trigger: { type: 't', data: {}, timestamp: '' }, nodes: {} };
    for (const tag of [
      'trigger.link',
      'trigger.first_item_image',
      'trigger.first_item_name',
      'trigger.first_item_price',
      'trigger.total',
      'trigger.items_count',
    ]) {
      expect(variableEngine.process(`{{ ${tag} }}`, emptyCtx)).toBe(`{{ ${tag} }}`);
    }
  });
});

describe('variable engine — canonical array normalization ({{ DiscountCodes }})', () => {
  const ctx: any = {
    trigger: {
      type: 'trigger_order',
      data: {
        DiscountCodes: ['CUPOM10', 'EXTRA5'],
        Customer: { FirstName: 'Maria' },
      },
      timestamp: '',
    },
    nodes: {},
  };

  it('joins scalar arrays like the email resolver (no JSON)', () => {
    expect(variableEngine.process('{{ DiscountCodes }}', ctx)).toBe('CUPOM10, EXTRA5');
  });

  it('joins Shopify { code } object arrays by their codes', () => {
    const shopifyCtx: any = {
      trigger: {
        type: 't',
        data: { DiscountCodes: [{ code: 'BEMVINDO10', amount: '10.0', type: 'percentage' }] },
        timestamp: '',
      },
      nodes: {},
    };
    expect(variableEngine.process('{{ DiscountCodes }}', shopifyCtx)).toBe('BEMVINDO10');
  });

  it('treats other object shapes as a MISS (non-consuming, literal stays)', () => {
    const weirdCtx: any = {
      trigger: { type: 't', data: { DiscountCodes: [{ foo: 'bar' }] }, timestamp: '' },
      nodes: {},
    };
    expect(variableEngine.process('{{ DiscountCodes }}', weirdCtx)).toBe('{{ DiscountCodes }}');
  });

  it('filtros operam no array CRU, não na string joinada', () => {
    // regressão da revisão: normalize rodava ANTES dos filtros e
    // {{ DiscountCodes | first }} virava a string inteira joinada.
    expect(variableEngine.process('{{ DiscountCodes | first }}', ctx)).toBe('CUPOM10');
    expect(variableEngine.process('{{ DiscountCodes | last }}', ctx)).toBe('EXTRA5');
  });

  it('canônica que sai de filtro ainda como array é normalizada (nunca JSON)', () => {
    // ex.: filtro que preserva array — a estringificação final faz o join.
    expect(variableEngine.process('{{ DiscountCodes | sort }}', ctx)).toBe('CUPOM10, EXTRA5');
  });
});

describe('variable engine — escapeHtml option (email HTML body parity)', () => {
  const xssCtx: any = {
    trigger: {
      type: 't',
      data: { Customer: { FirstName: '<b>Maria & Co</b>' } },
      timestamp: '',
    },
    nodes: {},
  };

  it('escapes substituted values when escapeHtml is on', () => {
    expect(
      variableEngine.process('Oi {{ Customer.FirstName }}!', xssCtx, { escapeHtml: true })
    ).toBe('Oi &lt;b&gt;Maria &amp; Co&lt;/b&gt;!');
  });

  it('does NOT escape by default (subjects / WhatsApp / SMS)', () => {
    expect(variableEngine.process('Oi {{ Customer.FirstName }}!', xssCtx)).toBe(
      'Oi <b>Maria & Co</b>!'
    );
  });

  it('never escapes the returned literal on a non-consuming miss', () => {
    expect(variableEngine.process('{{ first_name }}', xssCtx, { escapeHtml: true })).toBe(
      '{{ first_name }}'
    );
  });

  it('escapes & in URLs (valid in href; render.ts un-escapes before tracking)', () => {
    expect(variableEngine.process('{{ CheckoutURL }}', context, { escapeHtml: true })).toBe(
      'https://loja.myshopify.com/checkouts/recover/abc?key=1&amp;discount=DISCOUNT10'
    );
  });
});

describe('variable engine — consumeUnresolved option (WhatsApp/SMS: never ship literals)', () => {
  const opts = { consumeUnresolved: true };

  it("canonical miss → '' instead of the literal", () => {
    expect(variableEngine.process('{{ Tracking.Number }}', context, opts)).toBe('');
  });

  it("flat email tag miss → ''", () => {
    expect(variableEngine.process('Oi {{ first_name }}!', context, opts)).toBe('Oi !');
  });

  it("custom.* miss → ''", () => {
    expect(variableEngine.process('{{ custom.x }}', context, opts)).toBe('');
  });

  it("smart-tag miss → ''", () => {
    const emptyCtx: any = { trigger: { type: 't', data: {}, timestamp: '' }, nodes: {} };
    expect(variableEngine.process('{{ trigger.link }}', emptyCtx, opts)).toBe('');
  });

  it('resolves {{tag|fallback}} syntax in the engine: fallback on miss', () => {
    expect(variableEngine.process('{{ custom.campo|valor padrão }}', context, opts)).toBe(
      'valor padrão'
    );
  });

  it('resolves {{tag|fallback}} syntax in the engine: value when present', () => {
    expect(variableEngine.process('{{ Customer.FirstName|Cliente }}', context, opts)).toBe('Maria');
  });

  it('still RESOLVES canonical + smart tags normally', () => {
    expect(variableEngine.process('{{ CheckoutURL }}', context, opts)).toBe(
      'https://loja.myshopify.com/checkouts/recover/abc?key=1&discount=DISCOUNT10'
    );
    expect(variableEngine.process('{{ trigger.first_item_name }}', context, opts)).toBe(
      'Camiseta Premium'
    );
  });
});

describe('variable engine — unchanged consuming behavior for engine-owned misses', () => {
  it("random {{ unknown_thing }} still resolves to ''", () => {
    expect(variableEngine.process('{{ unknown_thing }}', context)).toBe('');
  });

  it("unresolved {{ trigger.Nope }} still resolves to ''", () => {
    expect(variableEngine.process('{{ trigger.Nope }}', context)).toBe('');
  });

  it("unresolved {{ event.Nope }} still resolves to ''", () => {
    expect(variableEngine.process('{{ event.Nope }}', context)).toBe('');
  });
});
