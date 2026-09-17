// =============================================================
// O mapeamento tem de valer NO ENVIO, não só na tela.
//
// A promessa ao lojista é: "{{ CheckoutURL }} mostra o link do
// checkout independente da integração, e se a minha manda em outro
// campo eu reaponto sem tocar em template". Se o mapeamento não
// chegasse até resolveTriggerSmartTags, a tela de Integrações seria
// decoração.
//
// Aqui exercitamos o resolvedor do e-mail exatamente como o pipeline
// o chama.
// =============================================================

import { describe, it, expect } from 'vitest';
import { resolveTriggerSmartTags } from '../merge-tags';
import { buildMappingIndex } from '@/lib/merge-tags/resolve';

const LOJA = 'https://minhaloja.com';

describe('cascata padrão no corpo do e-mail', () => {
  it('resolve o checkout vindo do campo canônico', () => {
    const html = '<a href="{{ CheckoutURL }}">Voltar</a>';
    const out = resolveTriggerSmartTags(html, {
      properties: { CheckoutURL: 'https://loja.com/recover/1' },
    }, LOJA);
    expect(out).toContain('https://loja.com/recover/1');
  });

  it('resolve o checkout enterrado no payload cru da Shopify', () => {
    const out = resolveTriggerSmartTags('{{ CheckoutURL }}', {
      properties: { raw: { abandoned_checkout_url: 'https://loja.com/recover/2' } },
    }, LOJA);
    expect(out).toBe('https://loja.com/recover/2');
  });

  it('variável nova do catálogo resolve (antes nem existia)', () => {
    const out = resolveTriggerSmartTags('{{ Items[0].SKU }}', {
      properties: { Items: [{ SKU: 'CAM-001' }] },
    }, LOJA);
    expect(out).toBe('CAM-001');
  });

  it('transportadora resolve pelo campo achatado', () => {
    const out = resolveTriggerSmartTags('{{ Tracking.Company }}', {
      properties: { TrackingCompany: 'Correios' },
    }, LOJA);
    expect(out).toBe('Correios');
  });
});

describe('mapeamento do lojista chega ao envio', () => {
  const mapping = buildMappingIndex([
    { tag: 'CheckoutURL', paths: ['raw.meu_campo_de_checkout'] },
  ]);

  it('o campo configurado ganha da cascata padrão', () => {
    const out = resolveTriggerSmartTags(
      '<a href="{{ CheckoutURL }}">ir</a>',
      {
        properties: {
          CheckoutURL: 'https://padrao',
          raw: { meu_campo_de_checkout: 'https://configurado' },
        },
      },
      LOJA,
      { mapping }
    );
    expect(out).toContain('https://configurado');
    expect(out).not.toContain('https://padrao');
  });

  it('sem mapeamento, nada muda para quem nunca abriu a tela', () => {
    const out = resolveTriggerSmartTags(
      '{{ CheckoutURL }}',
      { properties: { CheckoutURL: 'https://padrao' } },
      LOJA
    );
    expect(out).toBe('https://padrao');
  });

  it('valor padrão do mapeamento cobre o evento que não trouxe o campo', () => {
    const comPadrao = buildMappingIndex([
      { tag: 'CheckoutURL', paths: [], defaultValue: 'https://minhaloja.com/carrinho' },
    ]);
    const out = resolveTriggerSmartTags('{{ CheckoutURL }}', { properties: {} }, LOJA, { mapping: comPadrao });
    expect(out).toBe('https://minhaloja.com/carrinho');
  });

  it('mapear uma variável não afeta as outras', () => {
    const out = resolveTriggerSmartTags(
      '{{ OrderNumber }}',
      { properties: { order_number: '1234' } },
      LOJA,
      { mapping }
    );
    expect(out).toBe('1234');
  });
});

describe('nada do que já funcionava pode quebrar', () => {
  it('a grafia antiga com prefixo trigger. continua resolvendo', () => {
    const out = resolveTriggerSmartTags('{{ trigger.CheckoutURL }}', {
      properties: { CheckoutURL: 'https://ok' },
    }, LOJA);
    expect(out).toBe('https://ok');
  });

  it('{{ trigger.link }} continua achando o melhor link do evento', () => {
    const out = resolveTriggerSmartTags('{{ trigger.link }}', {
      properties: { raw: { abandoned_checkout_url: 'https://recuperar' } },
    }, LOJA);
    expect(out).toBe('https://recuperar');
  });

  it('{{ event.<caminho> }} continua resolvendo do payload', () => {
    const out = resolveTriggerSmartTags('{{ event.raw.custom_field }}', {
      properties: { raw: { custom_field: 'valor' } },
    }, LOJA);
    expect(out).toBe('valor');
  });

  it('tag de contato não é consumida aqui — quem resolve é o renderizador', () => {
    const out = resolveTriggerSmartTags('Olá {{ first_name }}', { properties: {} }, LOJA);
    expect(out).toBe('Olá {{ first_name }}');
  });

  it('URL relativa vira absoluta no domínio da loja', () => {
    const out = resolveTriggerSmartTags('{{ ProductURL }}', {
      properties: { ProductURL: '/products/camiseta' },
    }, 'https://loja.myshopify.com');
    expect(out).toBe('https://loja.myshopify.com/products/camiseta');
  });

  it('lista de cupons sai legível, não como JSON', () => {
    const out = resolveTriggerSmartTags('{{ DiscountCodes }}', {
      properties: { DiscountCodes: [{ code: 'CUPOM10', amount: '10' }] },
    }, LOJA);
    expect(out).toBe('CUPOM10');
  });

  it('variável sem valor e sem fallback fica intacta, não vira vazio', () => {
    const out = resolveTriggerSmartTags('{{ Tracking.Number }}', { properties: {} }, LOJA);
    expect(out).toBe('{{ Tracking.Number }}');
  });

  it('o fallback com barra vertical continua valendo', () => {
    const out = resolveTriggerSmartTags('{{ Tracking.Number | em breve }}', { properties: {} }, LOJA);
    expect(out).toBe('em breve');
  });
});
