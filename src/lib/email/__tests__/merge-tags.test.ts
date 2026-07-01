import { describe, it, expect } from 'vitest';
import { resolveTriggerSmartTags } from '../merge-tags';

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
