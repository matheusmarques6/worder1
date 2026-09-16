// ═══════════════════════════════════════════════════════════════════
// As variáveis que os e-mails REAIS usam, nas cargas REAIS do gatilho.
//
// As cargas abaixo foram copiadas de `automation_runs.metadata
// .trigger_data`, e as variáveis foram extraídas do HTML dos templates
// salvos. Duas não resolviam:
//
//   {{ trigger.StoreURL }} — 48 ocorrências em 30 templates, 28 deles
//   em fluxo ativo, e TODAS dentro de um `href`. Nenhuma carga traz
//   `StoreURL`: ela é a loja, não é dado do evento. Resultado:
//   `href=""` no logo e no banner do topo — o cabeçalho do e-mail
//   deixava de levar à loja. Nos e-mails de pedido pago e de rastreio
//   que saíram hoje, inclusive.
//
//   {{ trigger.Tracking }} — o catálogo chama `Tracking.Number` e a
//   carga traz `TrackingNumber`. O e-mail de rastreio saía com
//   "Tracking number:" e nada depois. É o conteúdo do e-mail.
//
// As que já resolviam estão aqui também, para não regredirem.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import { resolveTriggerSmartTags } from '../merge-tags'
import { prepareEmailHtml } from '../render'

const LOJA = 'https://medicubeshine.com'

// `trigger_order_paid`, como o webhook despacha: sem itens, sem loja.
const PEDIDO_PAGO = {
  currency: 'USD', order_id: '7881387442495', total_price: 32.47, order_number: 4117,
}

// `trigger_checkout_abandoned`.
const CHECKOUT = {
  Items: [{ ProductName: 'Zero Pore Pad', ItemPrice: 22.69, Quantity: 1, ProductURL: 'https://medicubeshine.com/products/zero' }],
  Value: 22.69, Currency: 'USD', ItemCount: 1,
  event_type: 'checkout_started',
  CheckoutURL: 'https://medicubeshine.com/96807715135/checkouts/ac/hWNG/recover?key=638d',
}

// `trigger_fulfilled_order`.
const ENVIADO = {
  Items: [{ ProductName: 'Serum', ItemPrice: 39.31, Quantity: 1 }],
  OrderId: '7874863857983', Currency: 'USD', event_type: 'fulfilled_order',
  OrderNumber: '4097',
  TrackingUrl: 'https://t.17track.net/en#nums=WNBAA0502227031YQ',
  TrackingNumber: 'WNBAA0502227031YQ', TrackingCompany: '',
}

function resolver(tag: string, evento: any, loja = LOJA) {
  return resolveTriggerSmartTags(`[${tag}]`.replace(`[${tag}]`, `{{${tag}}}`), evento, loja)
}

describe('o link da loja no topo do e-mail', () => {
  it('resolve nas três cargas — nenhuma delas traz StoreURL', () => {
    for (const carga of [PEDIDO_PAGO, CHECKOUT, ENVIADO]) {
      expect(resolver('trigger.StoreURL', carga)).toBe(LOJA)
      expect(resolver('StoreURL', carga)).toBe(LOJA)
    }
  })

  it('dentro do href é onde importava: nada de href vazio', () => {
    const html = '<a href="{{ trigger.StoreURL }}" target="_blank"><img src="x.jpg" /></a>'
    const out = resolveTriggerSmartTags(html, PEDIDO_PAGO, LOJA)
    expect(out).toContain(`href="${LOJA}"`)
    expect(out).not.toContain('href=""')
  })

  it('sem a loja do envio, cai no host do próprio evento', () => {
    const comHost = { ...PEDIDO_PAGO, CheckoutURL: 'https://minhaloja.com/checkouts/ac/x' }
    expect(resolver('trigger.StoreURL', comHost, '')).toContain('minhaloja.com')
  })

  it('a grafia com espaço também resolve', () => {
    const out = resolveTriggerSmartTags('{{  trigger.StoreURL  }}', ENVIADO, LOJA)
    expect(out).toBe(LOJA)
  })
})

describe('o código de rastreio', () => {
  it('a grafia curta resolve para o número — era o conteúdo do e-mail', () => {
    expect(resolver('trigger.Tracking', ENVIADO)).toBe('WNBAA0502227031YQ')
    expect(resolver('Tracking', ENVIADO)).toBe('WNBAA0502227031YQ')
  })

  it('a grafia da carga também resolve', () => {
    expect(resolver('trigger.TrackingNumber', ENVIADO)).toBe('WNBAA0502227031YQ')
    expect(resolver('trigger.TrackingUrl', ENVIADO)).toContain('17track.net')
  })

  it('no texto real do template, sai o número depois dos dois-pontos', () => {
    const html = '<p>Tracking number:&nbsp;{{ trigger.Tracking }}</p>'
    const out = resolveTriggerSmartTags(html, ENVIADO, LOJA)
    expect(out).toContain('Tracking number:&nbsp;WNBAA0502227031YQ')
  })
})

describe('as que já resolviam continuam resolvendo', () => {
  it('link de recuperação no checkout abandonado', () => {
    expect(resolver('CheckoutURL', CHECKOUT)).toContain('/checkouts/ac/hWNG/recover')
    expect(resolver('trigger.CheckoutURL', CHECKOUT)).toContain('/checkouts/ac/hWNG/recover')
  })

  it('número do pedido no pedido pago e no enviado', () => {
    expect(resolver('OrderNumber', PEDIDO_PAGO)).toBe('4117')
    expect(resolver('OrderNumber', ENVIADO)).toBe('4097')
  })

  it('link do produto no checkout abandonado', () => {
    expect(resolver('ProductURL', CHECKOUT)).toContain('/products/zero')
  })
})

// ── A rede de segurança, para a próxima variável que não resolver ──

describe('link vazio no e-mail final', () => {
  const base = {
    emailSendId: '11111111-1111-4111-8111-111111111111',
    baseUrl: 'https://app.worder.com.br',
  }

  it('href que ficou vazio volta para a home da loja', () => {
    const html = prepareEmailHtml({
      ...base,
      html: '<a href="{{variavel_que_nao_existe}}"><img src="https://cdn/logo.png" /></a>',
      mergeData: { store_url: LOJA },
    })
    expect(html).not.toContain('href=""')
    // Passa pelo rastreador como qualquer outro link, então o destino
    // vai codificado dentro dele.
    expect(html).toContain(encodeURIComponent(LOJA))
  })

  it('sem loja conhecida, não se inventa destino', () => {
    const html = prepareEmailHtml({
      ...base,
      html: '<a href="{{variavel_que_nao_existe}}">ir</a>',
      mergeData: {},
    })
    expect(html).toContain('href=""')
  })

  it('link que já tem destino não é tocado', () => {
    const html = prepareEmailHtml({
      ...base,
      html: '<a href="https://outra.com/pagina">ir</a>',
      mergeData: { store_url: LOJA },
    })
    expect(html).toContain(encodeURIComponent('https://outra.com/pagina'))
    expect(html).not.toContain(encodeURIComponent(LOJA))
  })
})
