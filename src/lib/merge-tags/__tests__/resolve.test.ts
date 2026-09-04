// =============================================================
// Resolução de variável de evento.
//
// A promessa é: {{ CheckoutURL }} mostra o link do checkout
// independente de qual integração produziu o evento, e o lojista pode
// reapontar a variável sem tocar em template.
// =============================================================

import { describe, it, expect } from 'vitest';
import { resolveEventTag, buildMappingIndex, normalizeValue } from '../resolve';
import { eventTagsForTrigger, CATALOG_BY_TAG, EVENT_TAGS, PLATFORM_TAGS } from '../catalog';

describe('cascata padrão — mesma variável, payloads diferentes', () => {
  it('acha o checkout no campo canônico', () => {
    const r = resolveEventTag('CheckoutURL', { properties: { CheckoutURL: 'https://a/recover/1' } });
    expect(r.value).toBe('https://a/recover/1');
    expect(r.source).toBe('catalog');
  });

  it('acha o checkout no campo minúsculo de integração antiga', () => {
    expect(resolveEventTag('CheckoutURL', { properties: { checkout_url: 'https://b' } }).value)
      .toBe('https://b');
  });

  it('acha o checkout enterrado no payload cru da Shopify', () => {
    const r = resolveEventTag('CheckoutURL', {
      properties: { raw: { abandoned_checkout_url: 'https://c/recover/9' } },
    });
    expect(r.value).toBe('https://c/recover/9');
    expect(r.matchedPath).toBe('raw.abandoned_checkout_url');
  });

  it('respeita a ordem: o canônico ganha do bruto', () => {
    const r = resolveEventTag('CheckoutURL', {
      properties: { CheckoutURL: 'https://canonico', raw: { abandoned_checkout_url: 'https://bruto' } },
    });
    expect(r.value).toBe('https://canonico');
  });

  it('acha o valor na raiz, em properties ou em raw', () => {
    expect(resolveEventTag('OrderNumber', { OrderNumber: '1' }).value).toBe('1');
    expect(resolveEventTag('OrderNumber', { properties: { order_number: '2' } }).value).toBe('2');
    expect(resolveEventTag('OrderNumber', { properties: { raw: { order_number: '3' } } }).value).toBe('3');
  });

  it('atravessa array por índice', () => {
    const r = resolveEventTag('Items[0].ProductName', {
      properties: { Items: [{ ProductName: 'Camiseta' }, { ProductName: 'Outro' }] },
    });
    expect(r.value).toBe('Camiseta');
  });

  it('tolera diferença de maiúsculas (OrderId x OrderID)', () => {
    expect(resolveEventTag('OrderID', { properties: { OrderId: '4567' } }).value).toBe('4567');
  });

  it('não encontrar é um estado explícito, não string vazia', () => {
    const r = resolveEventTag('CheckoutURL', { properties: {} });
    expect(r.source).toBe('miss');
    expect(r.value).toBeUndefined();
  });
});

describe('mapeamento do lojista', () => {
  it('o caminho configurado ganha da cascata padrão', () => {
    const mapping = buildMappingIndex([{ tag: 'CheckoutURL', paths: ['raw.meu_link'] }]);
    const r = resolveEventTag(
      'CheckoutURL',
      { properties: { CheckoutURL: 'https://padrao', raw: { meu_link: 'https://meu' } } },
      mapping
    );
    expect(r.value).toBe('https://meu');
    expect(r.source).toBe('mapping');
  });

  it('mapeamento que não resolve cai na cascata padrão', () => {
    const mapping = buildMappingIndex([{ tag: 'CheckoutURL', paths: ['raw.nao_existe'] }]);
    const r = resolveEventTag(
      'CheckoutURL',
      { properties: { CheckoutURL: 'https://padrao' } },
      mapping
    );
    expect(r.value).toBe('https://padrao');
    expect(r.source).toBe('catalog');
  });

  it('valor padrão entra só quando nada mais resolve', () => {
    const mapping = buildMappingIndex([
      { tag: 'CheckoutURL', paths: [], defaultValue: 'https://loja.com/carrinho' },
    ]);
    const r = resolveEventTag('CheckoutURL', { properties: {} }, mapping);
    expect(r.value).toBe('https://loja.com/carrinho');
    expect(r.source).toBe('default');
  });

  it('mapeamento de uma variável não afeta as outras', () => {
    const mapping = buildMappingIndex([{ tag: 'CheckoutURL', paths: ['raw.x'] }]);
    const r = resolveEventTag('OrderNumber', { properties: { order_number: '99' } }, mapping);
    expect(r.value).toBe('99');
  });
});

describe('normalizeValue', () => {
  it('junta lista de textos', () => {
    expect(normalizeValue(['CUPOM10', 'FRETE'])).toBe('CUPOM10, FRETE');
  });

  it('entende o formato de cupom da Shopify', () => {
    expect(normalizeValue([{ code: 'CUPOM10', amount: '10' }])).toBe('CUPOM10');
  });

  it('objeto e lista vazia contam como não encontrado', () => {
    expect(normalizeValue({ a: 1 })).toBeUndefined();
    expect(normalizeValue([])).toBeUndefined();
    expect(normalizeValue('')).toBeUndefined();
    expect(normalizeValue(null)).toBeUndefined();
  });

  it('zero e false são valores de verdade, não ausência', () => {
    expect(normalizeValue(0)).toBe('0');
    expect(normalizeValue(false)).toBe('false');
  });
});

describe('catálogo', () => {
  it('nenhuma variável aparece duas vezes', () => {
    const todas = [...PLATFORM_TAGS, ...EVENT_TAGS].map((t) => t.tag);
    expect(new Set(todas).size).toBe(todas.length);
  });

  it('toda variável de evento tem cascata de caminhos', () => {
    for (const t of EVENT_TAGS) {
      expect(t.paths, `${t.tag} sem caminhos`).toBeTruthy();
      expect(t.paths!.length).toBeGreaterThan(0);
    }
  });

  it('nenhuma variável de plataforma tem caminho de evento', () => {
    for (const t of PLATFORM_TAGS) expect(t.paths).toBeUndefined();
  });

  it('o gatilho de checkout abandonado oferece o link de recuperação', () => {
    const tags = eventTagsForTrigger('trigger_checkout_abandoned').map((t) => t.tag);
    expect(tags).toContain('CheckoutURL');
    expect(tags).toContain('Items[0].ProductName');
  });

  it('e NÃO oferece rastreio, que nunca resolveria ali', () => {
    const tags = eventTagsForTrigger('trigger_checkout_abandoned').map((t) => t.tag);
    expect(tags).not.toContain('Tracking.Number');
  });

  it('o gatilho de envio oferece rastreio', () => {
    const tags = eventTagsForTrigger('trigger_fulfilled_order').map((t) => t.tag);
    expect(tags).toContain('Tracking.Number');
    expect(tags).toContain('Tracking.URL');
  });

  it('sem gatilho, oferece tudo', () => {
    expect(eventTagsForTrigger(null)).toHaveLength(EVENT_TAGS.length);
  });

  it('a loja é plataforma, nunca evento — era a duplicata do print', () => {
    expect(CATALOG_BY_TAG.get('store_url')?.family).toBe('platform');
    expect(CATALOG_BY_TAG.get('store_name')?.family).toBe('platform');
    expect(EVENT_TAGS.find((t) => t.tag.toLowerCase().includes('storeurl'))).toBeUndefined();
  });
});
