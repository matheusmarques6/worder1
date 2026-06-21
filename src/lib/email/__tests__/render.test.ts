// =============================================
// Merge tag rendering — regex tolerance + smart tags
// =============================================

import { describe, it, expect } from 'vitest';
import { renderMergeTags, rewriteUrlsForTracking } from '../render';
import { resolveTriggerSmartTags } from '../merge-tags';

describe('renderMergeTags whitespace tolerance', () => {
  const data = { checkout_url: 'https://shop.com/recover/abc123', first_name: 'Maria' };

  it('replaces {{tag}} (no spaces)', () => {
    expect(renderMergeTags('Hi {{first_name}}', data)).toBe('Hi Maria');
  });

  it('replaces {{ tag }} (with spaces)', () => {
    expect(renderMergeTags('Hi {{ first_name }}', data)).toBe('Hi Maria');
  });

  it('replaces inside an HTML attribute', () => {
    const html = '<a href="{{checkout_url}}">click</a>';
    expect(renderMergeTags(html, data)).toBe('<a href="https://shop.com/recover/abc123">click</a>');
  });

  it('replaces with whitespace inside attribute', () => {
    const html = '<a href="{{ checkout_url }}">click</a>';
    expect(renderMergeTags(html, data)).toBe('<a href="https://shop.com/recover/abc123">click</a>');
  });

  it('supports fallback {{tag|default}}', () => {
    expect(renderMergeTags('{{ unknown_var | default text }}', data)).toBe('default text');
  });

  it('preserves URL ampersands via escapeHtml safely (HTML attribute context)', () => {
    const out = renderMergeTags('<a href="{{ checkout_url }}">go</a>', {
      checkout_url: 'https://shop.com/recover?key=a&locale=en',
    });
    // & should be escaped to &amp; — that's correct in HTML attribute context
    expect(out).toContain('&amp;locale=en');
  });

  it('leaves unknown tags as empty string', () => {
    expect(renderMergeTags('Hi {{ unknown }}!', data)).toBe('Hi !');
  });
});

describe('resolveTriggerSmartTags', () => {
  it('resolves {{ trigger.link }} to CheckoutURL when present', () => {
    const html = '<a href="{{ trigger.link }}">recover</a>';
    const out = resolveTriggerSmartTags(html, {
      properties: { CheckoutURL: 'https://shop.com/recover/xyz' },
    });
    expect(out).toContain('https://shop.com/recover/xyz');
  });

  it('falls back to raw.abandoned_checkout_url when no top-level CheckoutURL', () => {
    const html = '<a href="{{ trigger.link }}">recover</a>';
    const out = resolveTriggerSmartTags(html, {
      properties: { raw: { abandoned_checkout_url: 'https://shop.com/ac/abc' } },
    });
    expect(out).toContain('https://shop.com/ac/abc');
  });

  it('uses ProductURL for viewed_product events', () => {
    const html = '<a href="{{trigger.link}}">view</a>';
    const out = resolveTriggerSmartTags(html, {
      properties: { ProductURL: 'https://shop.com/products/foo' },
    });
    expect(out).toContain('https://shop.com/products/foo');
  });

  it('replaces multiple smart tags in one pass', () => {
    const html = '<img src="{{ trigger.first_item_image }}"><span>{{ trigger.first_item_name }}</span>';
    const out = resolveTriggerSmartTags(html, {
      properties: {
        Items: [{ ImageURL: 'https://cdn.shop/img.jpg', ProductName: 'Camiseta Black' }],
      },
    });
    expect(out).toContain('https://cdn.shop/img.jpg');
    expect(out).toContain('Camiseta Black');
  });

  it('handles missing event_data gracefully', () => {
    const html = '<a href="{{ trigger.link }}">x</a>';
    const out = resolveTriggerSmartTags(html, null, 'https://store.com');
    expect(out).toContain('https://store.com');
  });

  it('replaces both spaced and unspaced trigger tags', () => {
    const html = '{{trigger.total}} | {{ trigger.total }}';
    const out = resolveTriggerSmartTags(html, { properties: { TotalPrice: 199.9 } });
    expect(out).toBe('199.9 | 199.9');
  });

  it('resolves arbitrary trigger.<path> via lodash-style get', () => {
    // The picker emits any auto-discovered path as {{ trigger.<path> }}
    // — this verifies the generic resolver in resolveTriggerSmartTags
    // reaches deep into raw without per-field code.
    const ev = {
      properties: {
        OrderId: '6539396579517',
        raw: {
          customer: { first_name: 'Gary', default_address: { zip: '15112' } },
          discount_codes: [{ code: 'WELCOME10' }],
        },
      },
    };
    expect(resolveTriggerSmartTags('Hi {{ trigger.OrderId }}', ev)).toBe('Hi 6539396579517');
    expect(resolveTriggerSmartTags('Hi {{ trigger.raw.customer.first_name }}!', ev)).toBe('Hi Gary!');
    expect(resolveTriggerSmartTags('CEP {{ trigger.raw.customer.default_address.zip }}', ev)).toBe('CEP 15112');
    expect(resolveTriggerSmartTags('{{ trigger.raw.discount_codes[0].code }}', ev)).toBe('WELCOME10');
  });

  it('returns empty string for unknown trigger.<path>', () => {
    const out = resolveTriggerSmartTags('x{{ trigger.does.not.exist }}y', { properties: {} });
    expect(out).toBe('xy');
  });

  it('falls back to nested .properties when path under root misses', () => {
    // event_data passed in two shapes:
    //   { properties: { OrderId: '1' } }  — common
    //   { OrderId: '1' }                  — also common after flattening
    const out1 = resolveTriggerSmartTags('{{ trigger.OrderId }}', { properties: { OrderId: '1' } });
    const out2 = resolveTriggerSmartTags('{{ trigger.OrderId }}', { OrderId: '1' });
    expect(out1).toBe('1');
    expect(out2).toBe('1');
  });
});

describe('rewriteUrlsForTracking — Onda 14 hotfix', () => {
  const SEND_ID = 'send-uuid';
  const BASE = 'https://app.worder.com.br';

  it('wraps a plain http(s) link', () => {
    const html = '<a href="https://shop.com/p/123">buy</a>';
    const out = rewriteUrlsForTracking(html, SEND_ID, BASE);
    expect(out).toContain(`${BASE}/api/t/c/${SEND_ID}?url=`);
    expect(out).toContain(encodeURIComponent('https://shop.com/p/123'));
  });

  it('decodes &amp; in href before encoding (no double-escape)', () => {
    // HTML valido: atributo href com & precisa ser &amp;.
    const html = '<a href="https://shop.com/cart?x=1&amp;y=2">buy</a>';
    const out = rewriteUrlsForTracking(html, SEND_ID, BASE);
    // o url= dentro do tracker deve ter o & UMA SO VEZ (decoded), nao %26amp%3B
    expect(out).toContain(encodeURIComponent('https://shop.com/cart?x=1&y=2'));
    expect(out).not.toContain('%26amp%3B');
  });

  it('does NOT wrap orphan suffix from broken merge tag (&suffix)', () => {
    // Bug reproduzido: {{checkout_url}} resolvia vazio, sobrava &amp;discount=…
    const html = '<a href="&amp;discount=DISCOUNT10">complete</a>';
    const out = rewriteUrlsForTracking(html, SEND_ID, BASE);
    // Mantem o href original — nao esconde o problema atras de um tracker.
    expect(out).toBe(html);
    expect(out).not.toContain('/api/t/c/');
  });

  it('does NOT wrap unresolved merge tags', () => {
    const html = '<a href="{{checkout_url}}">x</a>';
    const out = rewriteUrlsForTracking(html, SEND_ID, BASE);
    expect(out).toBe(html);
  });

  it('does NOT wrap mailto/tel/anchor', () => {
    const cases = [
      '<a href="mailto:x@y.com">m</a>',
      '<a href="tel:+5511999999999">t</a>',
      '<a href="#section">a</a>',
    ];
    for (const html of cases) {
      expect(rewriteUrlsForTracking(html, SEND_ID, BASE)).toBe(html);
    }
  });

  it('skips already-wrapped tracking and unsubscribe links', () => {
    const html = [
      `<a href="${BASE}/api/t/c/x?url=y">tracker</a>`,
      `<a href="${BASE}/api/unsubscribe/x">unsub</a>`,
    ].join('');
    expect(rewriteUrlsForTracking(html, SEND_ID, BASE)).toBe(html);
  });

  it('does not wrap relative or non-http schemes (javascript: data:)', () => {
    const cases = [
      '<a href="/loja">rel</a>',
      '<a href="javascript:alert(1)">js</a>',
      '<a href="data:text/html,x">d</a>',
    ];
    for (const html of cases) {
      expect(rewriteUrlsForTracking(html, SEND_ID, BASE)).toBe(html);
    }
  });
});
