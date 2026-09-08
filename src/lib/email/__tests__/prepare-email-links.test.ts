// Todo link do e-mail sai com UTM completa + identificação ANTES de ser
// embrulhado no rastreador de clique — assim o destino final carrega tudo
// mesmo que o redirect falhe. Links do próprio app/tracking ficam limpos.
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: {}, getSupabaseAdmin: () => ({}) }))
vi.mock('@/lib/app-url', () => ({ getAppBaseUrl: () => 'https://app.worder.com.br' }))
vi.mock('@/lib/email/image-rewrite', () => ({ rewriteImagesForEmail: (html: string) => html }))

import { prepareEmailHtml } from '@/lib/email/render'
import { DEFAULT_UTM_SETTINGS, makeLinkParamsResolver } from '@/lib/tracking/link-params'

const SEND = '11111111-1111-4111-8111-111111111111'
const CONTACT = '22222222-2222-4222-8222-222222222222'
const FLOW = '33333333-3333-4333-8333-333333333333'

function innerDestinations(html: string): string[] {
  return Array.from(html.matchAll(/href="([^"]+)"/g))
    .map((m) => m[1].replace(/&amp;/g, '&'))
    .filter((h) => h.includes('/api/t/c/'))
    .map((h) => decodeURIComponent(new URL(h).searchParams.get('url') || ''))
}

describe('prepareEmailHtml + linkParams', () => {
  const linkParams = makeLinkParamsResolver(DEFAULT_UTM_SETTINGS, {
    channel: 'email',
    messageType: 'automation',
    automationName: 'Welcome Series',
    automationId: FLOW,
    messageName: 'Email 1',
    messageId: 'node-1',
    sendId: SEND,
    contactId: CONTACT,
    sentAt: '2026-09-05T12:00:00Z',
  })

  it('o destino dentro do rastreador já leva UTM + identificação; app/tracking ficam limpos', () => {
    const html = `
      <a href="https://drgroot.com/products/shampoo?variant=9">Comprar</a>
      <a href="https://click.drgroot.com/preferences?token=abc">Preferências</a>
      <a href="mailto:oi@drgroot.com">Fale</a>
    `
    const out = prepareEmailHtml({
      html,
      mergeData: {},
      emailSendId: SEND,
      baseUrl: 'https://click.drgroot.com',
      contactId: CONTACT,
      orgId: 'org-1',
      linkParams,
    })

    const dests = innerDestinations(out)
    const store = dests.find((d) => d.startsWith('https://drgroot.com/'))!
    const prefs = dests.find((d) => d.startsWith('https://click.drgroot.com/preferences'))!
    expect(store).toBeTruthy()
    const p = Object.fromEntries(new URL(store).searchParams.entries())
    expect(p.variant).toBe('9')
    expect(p.utm_source).toBe('worder')
    expect(p.utm_medium).toBe('email')
    expect(p.utm_campaign).toBe(`automation: Welcome Series (${FLOW})`)
    expect(p.utm_content).toBe('Email 1 (node-1)')
    expect(p.utm_term).toBe('2026-09-05')
    expect(p.utm_id).toBe(FLOW)
    expect(p.worderContactID).toBe(CONTACT)
    expect(p.worderSendID).toBe(SEND)
    expect(p.worderAutomationID).toBe(FLOW)
    expect(p.worderMessageID).toBe('node-1')

    // Link do domínio de tracking (preferências) não recebe UTM nem
    // identificação (o rastreador de clique continua embrulhando-o, como antes).
    expect(prefs).toBe('https://click.drgroot.com/preferences?token=abc')
    expect(out).toContain('href="mailto:oi@drgroot.com"')
  })

  it('sem linkParams o pipeline segue como antes (só o rastreador)', () => {
    const out = prepareEmailHtml({
      html: '<a href="https://drgroot.com/x">x</a>',
      mergeData: {},
      emailSendId: SEND,
      baseUrl: 'https://click.drgroot.com',
    })
    const dests = innerDestinations(out)
    expect(dests).toEqual(['https://drgroot.com/x'])
  })

  it('merge tag resolvida antes do carimbo: {{store_url}} vira link completo', () => {
    const out = prepareEmailHtml({
      html: '<a href="{{store_url}}/collections/all">Ver tudo</a>',
      mergeData: { store_url: 'https://drgroot.com' },
      emailSendId: SEND,
      baseUrl: 'https://click.drgroot.com',
      linkParams,
    })
    const [dest] = innerDestinations(out)
    expect(dest.startsWith('https://drgroot.com/collections/all?')).toBe(true)
    expect(new URL(dest).searchParams.get('worderSendID')).toBe(SEND)
  })
})
