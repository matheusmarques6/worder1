// =============================================================
// {{store_url}} tem de apontar para o domínio que o CLIENTE vê.
//
// Uma loja Shopify tem dois hosts: o *.myshopify.com da Admin API, que
// nunca muda, e o domínio principal (drgroot.com), que o lojista troca
// quando quer. A variável montava https://<myshopify>, então todo link
// de rodapé levava a um domínio estranho.
// =============================================================

import { describe, it, expect, vi } from 'vitest';
import {
  normalizePublicHost, publicStoreHost, publicStoreUrl, refreshPrimaryDomain, normalizePhone,
} from '../store-url';

describe('normalizePublicHost', () => {
  it('reduz URL completa ao host', () => {
    expect(normalizePublicHost('https://Loja.com/path?x=1')).toBe('loja.com');
    expect(normalizePublicHost('http://www.loja.com/')).toBe('loja.com');
  });

  it('aceita host puro e normaliza caixa', () => {
    expect(normalizePublicHost('DrGroot.COM')).toBe('drgroot.com');
  });

  it('placeholder interno vira vazio — nunca vira link', () => {
    expect(normalizePublicHost('manual-x-abc.worder.local')).toBe('');
    expect(normalizePublicHost('archived-uuid.worder.local')).toBe('');
  });

  it('lixo vira vazio', () => {
    expect(normalizePublicHost('')).toBe('');
    expect(normalizePublicHost(null)).toBe('');
    expect(normalizePublicHost('não é host')).toBe('');
    expect(normalizePublicHost('semponto')).toBe('');
  });
});

describe('publicStoreHost / publicStoreUrl', () => {
  it('prefere o domínio principal', () => {
    const loja = { shop_domain: '0p7tsk-i5.myshopify.com', primary_domain: 'drgroot.com' };
    expect(publicStoreHost(loja)).toBe('drgroot.com');
    expect(publicStoreUrl(loja)).toBe('https://drgroot.com');
  });

  it('sem principal, cai no myshopify — melhor que nada', () => {
    const loja = { shop_domain: '0p7tsk-i5.myshopify.com', primary_domain: null };
    expect(publicStoreUrl(loja)).toBe('https://0p7tsk-i5.myshopify.com');
  });

  it('principal inválido não derruba o fallback', () => {
    const loja = { shop_domain: 'x.myshopify.com', primary_domain: 'manual-x.worder.local' };
    expect(publicStoreUrl(loja)).toBe('https://x.myshopify.com');
  });

  it('sem host nenhum devolve vazio, não "https://"', () => {
    expect(publicStoreUrl({ shop_domain: null, primary_domain: null })).toBe('');
    expect(publicStoreUrl(null)).toBe('');
  });
});

describe('refreshPrimaryDomain', () => {
  function supabaseGravador() {
    const updates: any[] = [];
    const client = {
      from: () => ({
        update: (patch: any) => {
          updates.push(patch);
          return { eq: async () => ({ error: null }) };
        },
      }),
    };
    return { client, updates };
  }

  it('grava o principal quando a Shopify o informa', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: { shop: { myshopifyDomain: 'x.myshopify.com', primaryDomain: { host: 'drgroot.com' } } } }),
    })));
    const { client, updates } = supabaseGravador();
    const r = await refreshPrimaryDomain(client, {
      id: 's1', shop_domain: 'x.myshopify.com', access_token: 'tok', primary_domain: null,
    });
    expect(r).toBe('drgroot.com');
    expect(updates[0].primary_domain).toBe('drgroot.com');
    vi.unstubAllGlobals();
  });

  it('a troca de domínio pelo lojista é acompanhada', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: { shop: { primaryDomain: { host: 'novodominio.com' } } } }),
    })));
    const { client, updates } = supabaseGravador();
    const r = await refreshPrimaryDomain(client, {
      id: 's1', shop_domain: 'x.myshopify.com', access_token: 'tok', primary_domain: 'drgroot.com',
    }, { force: true });
    expect(r).toBe('novodominio.com');
    expect(updates[0].primary_domain).toBe('novodominio.com');
    vi.unstubAllGlobals();
  });

  it('resposta sem principal NÃO apaga o que já sabíamos', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, json: async () => ({ data: { shop: { primaryDomain: null } } }),
    })));
    const { client, updates } = supabaseGravador();
    const r = await refreshPrimaryDomain(client, {
      id: 's1', shop_domain: 'x.myshopify.com', access_token: 'tok', primary_domain: 'drgroot.com',
    }, { force: true });
    expect(r).toBe('drgroot.com');
    expect(updates[0].primary_domain).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it('respeita o intervalo mínimo — não pergunta à Shopify a cada envio', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { client } = supabaseGravador();
    const r = await refreshPrimaryDomain(client, {
      id: 's1', shop_domain: 'x.myshopify.com', access_token: 'tok',
      primary_domain: 'drgroot.com', primary_domain_checked_at: new Date().toISOString(),
    });
    expect(r).toBe('drgroot.com');
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('erro de rede devolve o que tinha, sem explodir a sync', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('rede'); }));
    const { client } = supabaseGravador();
    const r = await refreshPrimaryDomain(client, {
      id: 's1', shop_domain: 'x.myshopify.com', access_token: 'tok', primary_domain: 'drgroot.com',
    }, { force: true });
    expect(r).toBe('drgroot.com');
    vi.unstubAllGlobals();
  });

  it('loja sem token (placeholder) não consulta nada', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { client } = supabaseGravador();
    await refreshPrimaryDomain(client, { id: 's1', shop_domain: 'manual-x.worder.local', access_token: 'manual' });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('normalizePhone — {{store_phone}} tinha coluna e nenhuma fonte', () => {
  it('mantém formato legível e tira lixo', () => {
    expect(normalizePhone(' +55 (31) 99999-9999 ')).toBe('+55 (31) 99999-9999');
    expect(normalizePhone('tel: 31 3333-4444 ramal')).toBe('31 3333-4444');
  });

  it('curto demais ou vazio vira vazio — não entra no rodapé', () => {
    expect(normalizePhone('123')).toBe('');
    expect(normalizePhone('')).toBe('');
    expect(normalizePhone(null)).toBe('');
  });
});

describe('refreshPrimaryDomain também traz o telefone', () => {
  function supabaseGravador() {
    const updates: any[] = [];
    const client = { from: () => ({ update: (patch: any) => { updates.push(patch); return { eq: async () => ({ error: null }) }; } }) };
    return { client, updates };
  }

  it('grava o telefone da Shopify quando existe', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: { shop: { primaryDomain: { host: 'drgroot.com' }, billingAddress: { phone: '+55 31 99999-0000' } } } }),
    })));
    const { client, updates } = supabaseGravador();
    await refreshPrimaryDomain(client, { id: 's1', shop_domain: 'x.myshopify.com', access_token: 'tok' }, { force: true });
    expect(updates[0].shop_phone).toBe('+55 31 99999-0000');
    expect(updates[0].primary_domain).toBe('drgroot.com');
    vi.unstubAllGlobals();
  });

  it('sem telefone na Shopify, não apaga o que já tinha', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, json: async () => ({ data: { shop: { primaryDomain: { host: 'drgroot.com' }, billingAddress: { phone: null } } } }),
    })));
    const { client, updates } = supabaseGravador();
    await refreshPrimaryDomain(client, {
      id: 's1', shop_domain: 'x.myshopify.com', access_token: 'tok', shop_phone: '+55 31 1111-1111',
    }, { force: true });
    expect(updates[0].shop_phone).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it('telefone igual ao salvo não gera gravação redundante', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, json: async () => ({ data: { shop: { primaryDomain: { host: 'drgroot.com' }, billingAddress: { phone: '+55 31 1111-1111' } } } }),
    })));
    const { client, updates } = supabaseGravador();
    await refreshPrimaryDomain(client, {
      id: 's1', shop_domain: 'x.myshopify.com', access_token: 'tok',
      primary_domain: 'drgroot.com', shop_phone: '+55 31 1111-1111',
    }, { force: true });
    expect(updates[0].shop_phone).toBeUndefined();
    expect(updates[0].primary_domain).toBeUndefined();
    vi.unstubAllGlobals();
  });
});
