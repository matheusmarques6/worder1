// ═══════════════════════════════════════════════════════════════════
// O bloco de detalhes do pedido no e-mail de "Pedido Aprovado".
//
// O e-mail chegava com um buraco no lugar do resumo da compra. A causa
// tem dois lados que se encontram:
//
//   O gatilho `trigger_order_paid` despacha só `order_id`,
//   `order_number`, `total_price` e `currency`. Nenhum item. Medido:
//   338 execuções no banco, todas assim.
//
//   E `resolveOrderBlocks`, ao não achar item nenhum, APAGA o bloco do
//   HTML em silêncio. Sem erro, sem log — só o buraco.
//
// O `enrichOrderItemImages` que já rodava ali não cobria isso: ele
// desiste quando a lista está vazia. Ele completa item que existe; não
// cria. Por isso a hidratação é uma etapa nova, antes dele.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveOrderBlocks, hydrateOrderEventData } from '../render'

const FOTO = 'https://cdn.shopify.com/s/files/1/0735/deo.jpg?v=1'

const PEDIDO = {
  line_items: [
    { id: 1, title: 'Fresh That Lasts Deodorant', price: '29.90', quantity: 1,
      product_id: 10466632630591, variant_id: 53695489605951 },
  ],
  currency: 'USD',
  order_number: 1234,
  subtotal_price: '29.90',
  total_price: '29.90',
  total_tax: '0.00',
  total_discounts: '0.00',
  created_at: '2026-09-16T10:00:00Z',
}

function fakeSupabase(linhas: Record<string, any>) {
  const api = (tabela: string): any => {
    const o: any = {
      select: () => o, eq: () => o, limit: () => o, in: () => o,
      then: (r: any) => Promise.resolve({ data: linhas[tabela] ?? [], error: null }).then(r),
    }
    return o
  }
  return { from: api }
}

// A carga real do gatilho, como está nas 338 execuções.
const GATILHO_PEDIDO_PAGO = () => ({
  order_id: '7281908711593',
  order_number: '#1234',
  total_price: 29.9,
  currency: 'USD',
  storeId: 'loja-1',
})

// A configuração como as 11 salvas no banco: nome, preço e quantidade
// ligados. `showName`/`showPrice`/`showQuantity` são checados por
// verdade simples em `resolveOrderBlocks` — omiti-los aqui apagaria as
// linhas do item e o teste mediria outra coisa que não a hidratação.
function blocoPedido() {
  const cfg = encodeURIComponent(JSON.stringify({
    type: 'order-products', showImage: true, showTitle: true,
    titleText: 'Resumo do Pedido', imageWidth: 80,
    showName: true, showPrice: true, showQuantity: true,
  }))
  return `<!-- WORDER_ORDER_BLOCK:${cfg} -->`
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('o bloco some quando o gatilho não traz item', () => {
  it('é assim que o buraco aparecia: sem itens, o bloco é apagado', () => {
    const html = resolveOrderBlocks(blocoPedido(), GATILHO_PEDIDO_PAGO())
    expect(html).not.toContain('WORDER_ORDER_BLOCK')
    expect(html.trim()).toBe('')
  })
})

describe('hydrateOrderEventData', () => {
  it('traz os itens do pedido quando o gatilho só mandou o id', async () => {
    const ev = GATILHO_PEDIDO_PAGO()
    await hydrateOrderEventData(ev, fakeSupabase({ shopify_orders: [PEDIDO] }), 'loja-1', 'org-1')
    expect(Array.isArray((ev as any).Items)).toBe(true)
    expect((ev as any).Items).toHaveLength(1)
    expect((ev as any).Items[0].title).toContain('Deodorant')
  })

  it('completa os totais que faltavam, sem sobrescrever o que veio', async () => {
    const ev = GATILHO_PEDIDO_PAGO()
    await hydrateOrderEventData(ev, fakeSupabase({ shopify_orders: [PEDIDO] }), 'loja-1', 'org-1')
    // Veio do pedido, porque o gatilho não tinha.
    expect((ev as any).subtotal_price).toBe('29.90')
    // O que o gatilho trouxe manda: é o retrato do disparo.
    expect((ev as any).total_price).toBe(29.9)
    expect((ev as any).order_number).toBe('#1234')
  })

  it('evento que já tem itens sai intocado', async () => {
    const ev: any = { Items: [{ ProductName: 'Já veio', ItemPrice: 10, Quantity: 1 }], order_id: '999' }
    await hydrateOrderEventData(ev, fakeSupabase({ shopify_orders: [PEDIDO] }), 'loja-1', 'org-1')
    expect(ev.Items).toHaveLength(1)
    expect(ev.Items[0].ProductName).toBe('Já veio')
  })

  it('sem id nenhum, não consulta nada', async () => {
    const ev: any = { total_price: 10 }
    await hydrateOrderEventData(ev, fakeSupabase({ shopify_orders: [PEDIDO] }), 'loja-1', 'org-1')
    expect(ev.Items).toBeUndefined()
  })

  it('pedido que não existe não quebra o envio', async () => {
    const ev = GATILHO_PEDIDO_PAGO()
    await hydrateOrderEventData(ev, fakeSupabase({ shopify_orders: [] }), 'loja-1', 'org-1')
    expect((ev as any).Items).toBeUndefined()
  })

  it('cai no checkout quando é esse o id que o gatilho tem', async () => {
    const ev: any = { checkout_id: 'abc', currency: 'USD' }
    await hydrateOrderEventData(
      ev,
      fakeSupabase({ shopify_checkouts: [{ line_items: [{ title: 'Do checkout', price: '5.00', quantity: 1 }], currency: 'USD' }] }),
      'loja-1', 'org-1'
    )
    expect(ev.Items).toHaveLength(1)
    expect(ev.Items[0].title).toBe('Do checkout')
  })
})

describe('a linha do item nunca sai em branco', () => {
  // O mesmo buraco por outro caminho: com itens no evento mas sem as
  // chaves `showName`/`showPrice` na configuração, o bloco renderizava
  // a moldura e a linha do produto vinha vazia. O resto do bloco já
  // tratava chave ausente como ligada (`showOrderNumber !== false`);
  // a linha do item era a exceção.
  const evComItem = () => ({
    ...GATILHO_PEDIDO_PAGO(),
    Items: PEDIDO.line_items,
  })

  function bloco(cfg: Record<string, any>) {
    const json = encodeURIComponent(JSON.stringify({
      type: 'order-products', showImage: true, imageWidth: 80, ...cfg,
    }))
    return `<!-- WORDER_ORDER_BLOCK:${json} -->`
  }

  it('configuração sem as chaves mostra nome, quantidade e preço', () => {
    const html = resolveOrderBlocks(bloco({}), evComItem())
    expect(html).toContain('Fresh That Lasts Deodorant')
    expect(html).toContain('$29.90')
    expect(html).toContain('&times; 1')
  })

  it('quem desligou de propósito continua desligado', () => {
    const html = resolveOrderBlocks(
      bloco({ showName: false, showPrice: false, showQuantity: false }),
      evComItem()
    )
    expect(html).not.toContain('Fresh That Lasts Deodorant')
    expect(html).not.toContain('$29.90')
  })

  it('só a quantidade desligada mantém nome e preço', () => {
    const html = resolveOrderBlocks(bloco({ showQuantity: false }), evComItem())
    expect(html).toContain('Fresh That Lasts Deodorant')
    expect(html).toContain('$29.90')
    expect(html).not.toContain('&times; 1')
  })
})

describe('juntas, as duas etapas devolvem o resumo do pedido', () => {
  it('o bloco deixa de sumir e mostra o produto comprado', async () => {
    const ev = GATILHO_PEDIDO_PAGO()
    await hydrateOrderEventData(ev, fakeSupabase({ shopify_orders: [PEDIDO] }), 'loja-1', 'org-1')
    const html = resolveOrderBlocks(blocoPedido(), ev)

    expect(html).toContain('Resumo do Pedido')
    expect(html).toContain('Fresh That Lasts Deodorant')
    // Moeda do pedido, não o R$ cravado.
    expect(html).toContain('$29.90')
    expect(html).not.toContain('WORDER_ORDER_BLOCK')
  })
})
