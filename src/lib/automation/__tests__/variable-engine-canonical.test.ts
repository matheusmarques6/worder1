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

describe('variable engine — smart trigger tags stay intact for resolveTriggerSmartTags', () => {
  it('leaves the 6 smart-tag paths literal on miss (resolved downstream in email)', () => {
    for (const tag of [
      'trigger.link',
      'trigger.first_item_image',
      'trigger.first_item_name',
      'trigger.first_item_price',
      'trigger.total',
      'trigger.items_count',
    ]) {
      expect(variableEngine.process(`{{ ${tag} }}`, context)).toBe(`{{ ${tag} }}`);
    }
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
