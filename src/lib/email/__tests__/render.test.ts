// =============================================
// Merge tag rendering — regex tolerance + smart tags
// =============================================

import { describe, it, expect } from 'vitest';
import { renderMergeTags } from '../render';
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
