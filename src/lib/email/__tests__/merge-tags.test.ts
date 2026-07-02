import { describe, it, expect } from 'vitest';
import {
  resolveTriggerSmartTags,
  computeSmartTagValue,
  normalizeCanonicalValue,
} from '../merge-tags';

// Event payload in the CDP shape resolveTriggerSmartTags reads:
// ev.properties (props) + props.raw for the full Shopify payload.
const eventData = {
  properties: {
    CheckoutURL: 'https://loja.com/checkouts/recover/abc',
    Customer: { Email: 'maria@email.com', FirstName: 'Maria' },
    Items: [{ ProductName: 'Shampoo', ItemPrice: 89.9 }],
    raw: { abandoned_checkout_url: 'https://loja.com/ac/xyz', order_number: 1042 },
  },
};

describe('resolveTriggerSmartTags — tags universais + aliases', () => {
  it('resolve a canônica SEM prefixo ({{ CheckoutURL }})', () => {
    expect(resolveTriggerSmartTags('{{ CheckoutURL }}', eventData)).toBe(
      'https://loja.com/checkouts/recover/abc'
    );
  });

  it('resolve a canônica COM prefixo trigger. (alias legado)', () => {
    expect(resolveTriggerSmartTags('{{ trigger.CheckoutURL }}', eventData)).toBe(
      'https://loja.com/checkouts/recover/abc'
    );
  });

  it('preserva sufixo literal: {{ CheckoutURL }}&discount=DISCOUNT10', () => {
    expect(
      resolveTriggerSmartTags('{{ CheckoutURL }}&discount=DISCOUNT10', eventData)
    ).toBe('https://loja.com/checkouts/recover/abc&discount=DISCOUNT10');
    // e o alias trigger. com o mesmo sufixo (templates já existentes)
    expect(
      resolveTriggerSmartTags('{{ trigger.CheckoutURL }}&discount=DISCOUNT10', eventData)
    ).toBe('https://loja.com/checkouts/recover/abc&discount=DISCOUNT10');
  });

  it('resolve canônicas dotted/bracket sem prefixo (Customer.Email, Items[0].ProductName)', () => {
    expect(resolveTriggerSmartTags('{{ Customer.Email }}', eventData)).toBe('maria@email.com');
    expect(resolveTriggerSmartTags('{{ Items[0].ProductName }}', eventData)).toBe('Shampoo');
  });

  it('resolve raw via namespace limpo {{ event.<path> }} e via alias {{ trigger.<path> }}', () => {
    expect(
      resolveTriggerSmartTags('{{ event.raw.abandoned_checkout_url }}', eventData)
    ).toBe('https://loja.com/ac/xyz');
    expect(
      resolveTriggerSmartTags('{{ trigger.raw.abandoned_checkout_url }}', eventData)
    ).toBe('https://loja.com/ac/xyz');
  });

  it('NÃO clobbera tags flat fora da whitelist ({{ email }}, {{ first_name }} ficam intactas)', () => {
    // Essas são resolvidas depois pelo renderMergeTags a partir do mergeData.
    expect(resolveTriggerSmartTags('{{ email }}', eventData)).toBe('{{ email }}');
    expect(resolveTriggerSmartTags('{{ first_name }}', eventData)).toBe('{{ first_name }}');
  });

  it('{{ event.<path> }} é NÃO-CONSUMIDOR quando o path não está no evento (deixa p/ renderMergeTags)', () => {
    // event.ProductName não existe no topo do payload (está em Items[0]);
    // deve ficar intacto para o renderMergeTags resolver do mergeData.
    expect(resolveTriggerSmartTags('{{ event.ProductName }}', eventData)).toBe(
      '{{ event.ProductName }}'
    );
  });

  it('{{ trigger.<path> }} desconhecido é consumido (comportamento histórico)', () => {
    expect(resolveTriggerSmartTags('{{ trigger.NaoExiste }}', eventData)).toBe('');
  });

  it('sem eventData retorna o html inalterado', () => {
    expect(resolveTriggerSmartTags('{{ CheckoutURL }}', null)).toBe('{{ CheckoutURL }}');
  });
});

// =============================================================
// computeSmartTagValue — helper compartilhado entre o resolver de email
// e o variable engine (WhatsApp/SMS). As chains de fallback vivem SÓ aqui.
// =============================================================
describe('computeSmartTagValue (fonte única das smart tags)', () => {
  it('trigger.link segue a chain canônica (CheckoutURL primeiro)', () => {
    expect(computeSmartTagValue(eventData, 'trigger.link')).toBe(
      'https://loja.com/checkouts/recover/abc'
    );
  });

  it('trigger.link cai para raw.abandoned_checkout_url quando não há canônica', () => {
    const ev = { properties: { raw: { abandoned_checkout_url: 'https://loja.com/ac/xyz' } } };
    expect(computeSmartTagValue(ev, 'trigger.link')).toBe('https://loja.com/ac/xyz');
  });

  it('trigger.first_item_* e trigger.items_count leem Items[0]', () => {
    expect(computeSmartTagValue(eventData, 'trigger.first_item_name')).toBe('Shampoo');
    expect(computeSmartTagValue(eventData, 'trigger.first_item_price')).toBe('89.9');
    expect(computeSmartTagValue(eventData, 'trigger.items_count')).toBe('1');
  });

  it('retorna undefined em MISS genuíno (o canal aplica o default dele)', () => {
    expect(computeSmartTagValue({}, 'trigger.link')).toBeUndefined();
    expect(computeSmartTagValue({}, 'trigger.first_item_name')).toBeUndefined();
    expect(computeSmartTagValue({}, 'trigger.total')).toBeUndefined();
    expect(computeSmartTagValue({}, 'nome_desconhecido')).toBeUndefined();
  });

  it('resolveTriggerSmartTags mantém os defaults de canal (storeUrl / "#" / "0")', () => {
    expect(resolveTriggerSmartTags('{{ trigger.link }}', {}, 'https://loja.com')).toBe(
      'https://loja.com'
    );
    expect(resolveTriggerSmartTags('{{ trigger.link }}', {})).toBe('#');
    expect(resolveTriggerSmartTags('{{ trigger.items_count }}', {})).toBe('0');
    expect(resolveTriggerSmartTags('{{ trigger.first_item_name }}', {})).toBe('');
  });
});

// =============================================================
// normalizeCanonicalValue — semântica de join compartilhada com o engine
// (fix do {{ DiscountCodes }} virando JSON nos canais do engine).
// =============================================================
describe('normalizeCanonicalValue (fonte única do join de arrays)', () => {
  it('array de escalares → join ", "', () => {
    expect(normalizeCanonicalValue(['CUPOM10', 'EXTRA5'])).toBe('CUPOM10, EXTRA5');
  });

  it('array de objetos { code } (formato Shopify) → join dos codes', () => {
    expect(
      normalizeCanonicalValue([{ code: 'BEMVINDO10', amount: '10.0', type: 'percentage' }])
    ).toBe('BEMVINDO10');
  });

  it('objetos/arrays de outros formatos → undefined (miss)', () => {
    expect(normalizeCanonicalValue([{ foo: 'bar' }])).toBeUndefined();
    expect(normalizeCanonicalValue({ a: 1 })).toBeUndefined();
  });

  it('null/undefined → undefined; escalar → String', () => {
    expect(normalizeCanonicalValue(null)).toBeUndefined();
    expect(normalizeCanonicalValue(undefined)).toBeUndefined();
    expect(normalizeCanonicalValue(89.9)).toBe('89.9');
    expect(normalizeCanonicalValue('x')).toBe('x');
  });

  it('{{ DiscountCodes }} no resolver de email também usa o join', () => {
    const ev = { properties: { DiscountCodes: ['CUPOM10', 'EXTRA5'] } };
    expect(resolveTriggerSmartTags('{{ DiscountCodes }}', ev)).toBe('CUPOM10, EXTRA5');
  });
});
