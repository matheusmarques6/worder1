// =============================================================
// Lápide x loja esperando integração.
//
// As duas usam domínio .worder.local, e tratá-las igual escondia do
// usuário a loja que ele acabou de criar: quem escolhia "configurar
// integração depois" via o modal fechar e nada aparecer no switcher.
// A loja existia no banco — só era invisível, para sempre.
//
// Os exemplos abaixo são as linhas reais que estavam em produção.
// =============================================================

import { describe, it, expect } from 'vitest';
import { isTombstoneStore, isAwaitingIntegration, hasPlaceholderDomain } from '../placeholder';

// Criada por "Adicionar loja", integração ainda não configurada.
const esperandoIntegracao = {
  shop_domain: 'manual-medicube-mtn65lqg.worder.local',
  is_active: true,
};

// Loja mesclada em outra: a linha só existe pelas chaves estrangeiras.
const arquivada = {
  shop_domain: 'archived-17f6c4ab-00e1-405c-8fb2-700ba35b109f.worder.local',
  is_active: false,
};

const lojaReal = { shop_domain: '0p7tsk-i5.myshopify.com', is_active: true };
const lojaRealDesconectada = { shop_domain: '0p7tsk-i5.myshopify.com', is_active: false };

describe('isTombstoneStore', () => {
  it('a lápide arquivada é escondida', () => {
    expect(isTombstoneStore(arquivada)).toBe(true);
  });

  it('a loja esperando integração NÃO é lápide', () => {
    expect(isTombstoneStore(esperandoIntegracao)).toBe(false);
  });

  it('loja com domínio Shopify de verdade nunca é lápide', () => {
    expect(isTombstoneStore(lojaReal)).toBe(false);
    // Nem quando está desativada: desconectar sinaliza, não apaga.
    expect(isTombstoneStore(lojaRealDesconectada)).toBe(false);
  });

  it('placeholder inativo é lápide seja qual for o prefixo', () => {
    expect(isTombstoneStore({ shop_domain: 'manual-x-abc.worder.local', is_active: false })).toBe(true);
  });

  it('linha sem domínio não é lápide', () => {
    expect(isTombstoneStore({ shop_domain: null, is_active: true })).toBe(false);
    expect(isTombstoneStore({})).toBe(false);
  });

  it('is_active ausente conta como ativa — na dúvida, mostra', () => {
    expect(isTombstoneStore({ shop_domain: 'manual-x-abc.worder.local' })).toBe(false);
  });
});

describe('isAwaitingIntegration', () => {
  it('reconhece a loja recém-criada', () => {
    expect(isAwaitingIntegration(esperandoIntegracao)).toBe(true);
  });

  it('não confunde com a arquivada nem com a loja real', () => {
    expect(isAwaitingIntegration(arquivada)).toBe(false);
    expect(isAwaitingIntegration(lojaReal)).toBe(false);
  });
});

describe('hasPlaceholderDomain', () => {
  it('separa domínio sintético de domínio Shopify', () => {
    expect(hasPlaceholderDomain(esperandoIntegracao)).toBe(true);
    expect(hasPlaceholderDomain(arquivada)).toBe(true);
    expect(hasPlaceholderDomain(lojaReal)).toBe(false);
  });

  it('não casa por engano com um domínio que só contém o texto', () => {
    expect(hasPlaceholderDomain({ shop_domain: 'worder.local.myshopify.com' })).toBe(false);
  });
});

describe('a lista do switcher', () => {
  // É a decisão que os três endpoints tomam: /api/stores,
  // /api/shopify/connect e /api/shopify/stores.
  const doBanco = [lojaReal, esperandoIntegracao, arquivada, lojaRealDesconectada];

  it('mostra a loja sem integração e esconde só a arquivada', () => {
    const visiveis = doBanco.filter((s) => !isTombstoneStore(s));
    expect(visiveis).toHaveLength(3);
    expect(visiveis).toContain(esperandoIntegracao);
    expect(visiveis).not.toContain(arquivada);
  });
});
