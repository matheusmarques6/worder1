// @vitest-environment jsdom
//
// O script gerado, rodando de verdade num DOM. Os testes de string
// (script-gen.test.ts) provam que o texto certo está lá; estes provam que
// o texto FAZ a coisa certa: gates bloqueiam, gatilho abre, beacon vai
// para /events com o que a série diária precisa, eventos worder:* saem,
// hold-out é determinístico e pegajoso, auto-apply chama /discount.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { buildPopupScript } from '../generator'

const BU = 'https://app.test'

type Call = { url: string; init?: RequestInit; body: any }

let calls: Call[]
let fetchMock: (url: string, init?: RequestInit) => Promise<Response>
let seq = 0

function design(over: any = {}) {
  return {
    formType: 'popup',
    styles: { width: 480, closeButton: { show: true } },
    steps: [
      {
        blocks: [
          { id: 'b1', type: 'email', props: { placeholder: 'email', required: true } },
          { id: 'c1', type: 'legal-consent', props: { text: 'Aceito receber e-mails', channels: ['email', 'whatsapp'], required: false } },
          { id: 'b2', type: 'button', props: { text: 'Enviar', action: 'submit' } },
        ],
      },
    ],
    successStep: { blocks: [
      { id: 's1', type: 'text', props: { content: 'Obrigado' } },
      { id: 'k1', type: 'coupon', props: { code: 'STATIC10', mode: 'unique' } },
    ] },
    postSubmit: { action: 'show-success', redirectUrl: '', closeDelay: 0 },
    ...over,
  }
}

function behavior(over: any = {}) {
  return {
    display: { timeEnabled: true, delay: 1 },
    visibility: { devices: 'all', visitorType: 'all', hideFromSubscribers: false },
    frequency: { showAfterDays: 7, stopAfterSubmission: true },
    ...over,
  }
}

function nextId() {
  return `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`
}

function run(d: any = design(), b: any = behavior(), id: string = nextId()) {
  const js = buildPopupScript({ id, name: 'Teste', design_json: d, behavior: b }, BU)
  new Function(js)()
  return id
}

// O mesmo sorteio do runtime, para o teste saber de antemão em que grupo
// um visitante cai — e escolher um que caia no controle.
function bucketOf(vid: string, fid: string, pct: number): 'holdout' | 'exposed' {
  const s = `${vid}|${fid}`
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h % 100 < pct ? 'holdout' : 'exposed'
}

function visitorIn(bucket: 'holdout' | 'exposed', fid: string, pct: number): string {
  for (let i = 0; i < 500; i++) {
    const vid = `v-${i}`
    if (bucketOf(vid, fid, pct) === bucket) return vid
  }
  throw new Error('nenhum visitante caiu no grupo pedido')
}

function eventsFor(id: string) {
  return calls.filter((c) => c.url === `${BU}/api/public/forms/${id}/events`).map((c) => c.body)
}

// O popup vive num shadow root: nada dele é visível por document.getElementById.
function root(id: string): ShadowRoot | null {
  return document.getElementById(`wf-host-${id}`)?.shadowRoot ?? null
}
function ov(id: string): HTMLElement | null {
  return (root(id)?.getElementById(`wf-ov-${id}`) as HTMLElement | null) ?? null
}
function formEl(id: string): HTMLFormElement | null {
  return (root(id)?.getElementById(`wf-form-${id}`) as HTMLFormElement | null) ?? null
}

function listen(name: string): any[] {
  const got: any[] = []
  window.addEventListener(`worder:${name}`, (e: any) => got.push(e.detail))
  return got
}

beforeEach(() => {
  vi.useFakeTimers()
  calls = []
  document.body.innerHTML = ''
  document.head.innerHTML = ''
  localStorage.clear()
  sessionStorage.clear()
  document.cookie.split(';').forEach((c) => {
    const n = c.split('=')[0].trim()
    if (n) document.cookie = `${n}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
  })
  document.cookie = '__worder_id=visitor-abc;path=/'
  // O runtime guarda estado por pageview em window (mutex de um popup por
  // vez, contadores compartilhados entre scripts). Cada teste é uma
  // pageview nova.
  for (const k of Object.keys(window)) {
    if (k.startsWith('__wf') || k === '_worderOnsite') delete (window as any)[k]
  }
  Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true })
  // Sem sendBeacon o runtime cai no fetch — e o fetch é o que inspecionamos.
  Object.defineProperty(navigator, 'sendBeacon', { value: undefined, configurable: true })
  fetchMock = async (url: string, init?: RequestInit) => {
    let body: any = null
    if (init?.body && typeof init.body === 'string') {
      try { body = JSON.parse(init.body) } catch { body = init.body }
    }
    calls.push({ url: String(url), init, body })
    if (String(url).endsWith('/api/public/geo')) {
      return new Response(JSON.stringify({ country: 'BR' }), { status: 200 })
    }
    if (String(url).includes('/submit')) {
      return new Response(JSON.stringify({
        success: true,
        submission_id: 'sub-1',
        contact_id: 'ct-1',
        consent: { email: 'granted', whatsapp: 'granted', sms: null },
        coupon: { code: 'POPUP-ABC123', kind: 'percent', value: 10, ends_at: '2030-01-01T00:00:00Z', auto_apply: true, show_code: true },
      }), { status: 200 })
    }
    return new Response('{}', { status: 200 })
  }
  vi.stubGlobal('fetch', vi.fn(fetchMock))
  delete (window as any).Shopify
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('runtime no DOM', () => {
  it('gate de dispositivo bloqueia sem impressão nem popup', () => {
    const id = run(design(), behavior({ visibility: { devices: 'mobile', visitorType: 'all' } }))
    vi.advanceTimersByTime(2000)
    expect(ov(id)).toBeNull()
    expect(eventsFor(id)).toHaveLength(0)
  })

  it('gatilho de tempo abre, manda impressão com visitante e dispara popupView', () => {
    const views = listen('popupView')
    const matched = listen('campaignMatched')
    const id = run()
    expect(ov(id)).toBeNull()
    vi.advanceTimersByTime(1000)
    expect(ov(id)).not.toBeNull()
    const ev = eventsFor(id)
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({ type: 'impression', bucket: 'exposed', visitor_id: 'visitor-abc' })
    expect(ev[0].url).toContain('http')
    expect(views).toHaveLength(1)
    expect(views[0]).toMatchObject({ formId: id, formName: 'Teste', formType: 'popup' })
    expect(matched[0]).toMatchObject({ holdout: false })
    // O beacon é text/plain: sem preflight.
    const imp = calls.find((c) => c.url.endsWith('/events'))!
    expect((imp.init!.headers as any)['Content-Type']).toMatch(/text\/plain/)
  })

  it('o popup vive num shadow root com o próprio CSS, invisível ao CSS do tema', () => {
    const id = run()
    vi.advanceTimersByTime(1000)
    const host = document.getElementById(`wf-host-${id}`)!
    expect(host).not.toBeNull()
    expect(host.shadowRoot).not.toBeNull()
    // Nada do popup está no DOM claro.
    expect(document.getElementById(`wf-ov-${id}`)).toBeNull()
    expect(document.querySelector('form')).toBeNull()
    // Keyframes e reset moram dentro do shadow.
    const css = host.shadowRoot!.querySelector('style')!.textContent!
    expect(css).toContain('@keyframes wfFade')
    expect(css).toContain(':host{all:initial}')
    expect(root(id)!.querySelector('.wf-pop')).not.toBeNull()
    // Fechar remove o host inteiro.
    ov(id)!.querySelector<HTMLElement>('[data-action="close"]')!.click()
    expect(document.getElementById(`wf-host-${id}`)).toBeNull()
  })

  it('prioridade: o popup de maior prioridade fala primeiro; o outro espera e desiste', () => {
    const low = nextId()
    const high = nextId()
    // O de prioridade baixa dispara em 1 s; o alto em 2 s. Sem prioridade,
    // o baixo abriria primeiro e travaria o mutex.
    run(design(), behavior({ priority: 1, display: { timeEnabled: true, delay: 1 } }), low)
    run(design(), behavior({ priority: 10, display: { timeEnabled: true, delay: 2 } }), high)
    vi.advanceTimersByTime(1000)
    expect(ov(low)).toBeNull() // esperando o alto decidir
    vi.advanceTimersByTime(1000)
    expect(ov(high)).not.toBeNull()
    vi.advanceTimersByTime(4000)
    expect(ov(low)).toBeNull() // mutex: só um por página
    expect((window as any).__wfReg[high].state).toBe('shown')
    expect((window as any).__wfReg[low].state).toBe('blocked')
  })

  it('prioridade: se o mais importante for bloqueado por um gate, o outro segue', () => {
    const low = nextId()
    const high = nextId()
    run(design(), behavior({ priority: 1, display: { timeEnabled: true, delay: 1 } }), low)
    run(design(), behavior({ priority: 10, visibility: { devices: 'mobile', visitorType: 'all' } }), high)
    vi.advanceTimersByTime(1000)
    expect(ov(low)).not.toBeNull()
    expect((window as any).__wfReg[high].state).toBe('blocked')
  })

  it('fonts só entram no head quando o popup aparece', () => {
    run()
    expect(document.getElementById('wf-fonts-link')).toBeNull()
    vi.advanceTimersByTime(1000)
    expect(document.getElementById('wf-fonts-link')).not.toBeNull()
  })

  it('bloco de consentimento nasce desmarcado, com nome próprio e canais', () => {
    const id = run()
    vi.advanceTimersByTime(1000)
    const box = formEl(id)!.querySelector<HTMLInputElement>('input[name="consent__c1"]')!
    expect(box).not.toBeNull()
    expect(box.checked).toBe(false)
    expect(box.getAttribute('data-channels')).toBe('email,whatsapp')
  })

  it('submit envia contexto, emite signup e rewardClaimed, e aplica o cupom na Shopify', async () => {
    ;(window as any).Shopify = {}
    const signups = listen('signup')
    const rewards = listen('rewardClaimed')
    const id = run()
    vi.advanceTimersByTime(1000)
    const form = formEl(id) as HTMLFormElement
    const email = form.querySelector<HTMLInputElement>('input[name="email"]')!
    email.value = 'ana@example.com'
    form.querySelector<HTMLInputElement>('input[name="consent__c1"]')!.checked = true
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await vi.runAllTimersAsync()

    const submit = calls.find((c) => c.url === `${BU}/api/public/forms/${id}/submit`)!
    expect(submit.body.answers.email).toBe('ana@example.com')
    expect(submit.body.answers.consent__c1).toBe('on')
    expect(submit.body.visitor_id).toBe('visitor-abc')
    expect(submit.body.page_url).toContain('http')

    expect(signups).toHaveLength(1)
    expect(signups[0]).toMatchObject({ email: 'ana@example.com', submissionId: 'sub-1', consent: { whatsapp: 'granted' } })
    expect(rewards).toHaveLength(1)
    expect(rewards[0]).toMatchObject({ code: 'POPUP-ABC123', kind: 'percent', value: 10, autoApplied: true })

    const apply = calls.find((c) => c.url.startsWith('/discount/POPUP-ABC123'))!
    expect(apply).toBeTruthy()
    expect(apply.init!.credentials).toBe('same-origin')
    expect(JSON.parse(localStorage.getItem('_worder_coupon')!)).toMatchObject({ code: 'POPUP-ABC123' })
    expect(eventsFor(id).some((e) => e.type === 'reward' && e.kind === 'percent')).toBe(true)
    // O código único entra no bloco de cupom da etapa de sucesso.
    expect(root(id)!.getElementById(`wf-succ-${id}`)!.textContent).toContain('POPUP-ABC123')
  })

  it('sem window.Shopify não tenta /discount', async () => {
    const id = run()
    vi.advanceTimersByTime(1000)
    const form = formEl(id) as HTMLFormElement
    form.querySelector<HTMLInputElement>('input[name="email"]')!.value = 'b@example.com'
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await vi.runAllTimersAsync()
    expect(calls.some((c) => c.url.startsWith('/discount/'))).toBe(false)
  })

  it('fechar pelo visitante manda dismissed com a etapa e grava a supressão', () => {
    const closes = listen('popupClose')
    const id = run()
    vi.advanceTimersByTime(1000)
    const closeBtn = ov(id)!.querySelector<HTMLElement>('[data-action="close"]')!
    closeBtn.click()
    const ev = eventsFor(id)
    expect(ev.map((e) => e.type)).toEqual(['impression', 'dismissed'])
    expect(ev[1]).toMatchObject({ step: 0, visitor_id: 'visitor-abc' })
    expect(closes[0]).toMatchObject({ byUser: true, submitted: false })
    expect(document.cookie).toContain(`_wf_${id}=1`)
    expect(ov(id)).toBeNull()
  })

  it('hold-out: determinístico, pegajoso, sem popup, um beacon por pageview', () => {
    const matched = listen('campaignMatched')
    const id = nextId()
    const vid = visitorIn('holdout', id, 30)
    document.cookie = `__worder_id=${vid};path=/`
    run(design(), behavior({ experiment: { holdoutPercent: 30 } }), id)
    vi.advanceTimersByTime(2000)
    expect(ov(id)).toBeNull()
    const ev = eventsFor(id)
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({ type: 'holdout', bucket: 'holdout', visitor_id: vid })
    expect(matched[0]).toMatchObject({ holdout: true })
    expect(JSON.parse(localStorage.getItem(`_wfls_bk_${id}`)!).v).toBe('holdout')
  })

  it('hold-out: quem cai no grupo exposto vê o popup e a impressão sai marcada', () => {
    const id = nextId()
    const vid = visitorIn('exposed', id, 30)
    document.cookie = `__worder_id=${vid};path=/`
    run(design(), behavior({ experiment: { holdoutPercent: 30 } }), id)
    vi.advanceTimersByTime(1000)
    expect(ov(id)).not.toBeNull()
    expect(eventsFor(id)[0]).toMatchObject({ type: 'impression', bucket: 'exposed' })
    expect(JSON.parse(localStorage.getItem(`_wfls_bk_${id}`)!).v).toBe('exposed')
  })

  it('hold-out: o grupo é pegajoso — o sorteio guardado vence um novo cálculo', () => {
    const id = nextId()
    localStorage.setItem(`_wfls_bk_${id}`, JSON.stringify({ v: 'holdout', e: Date.now() + 86400000 }))
    run(design(), behavior({ experiment: { holdoutPercent: 1 } }), id)
    vi.advanceTimersByTime(2000)
    expect(ov(id)).toBeNull()
    expect(eventsFor(id)[0]).toMatchObject({ type: 'holdout' })
  })

  it('hold-out nunca passa de metade dos elegíveis', () => {
    const js = buildPopupScript({ id: nextId(), name: 'x', design_json: design(), behavior: behavior({ experiment: { holdoutPercent: 100 } }) }, BU)
    expect(js).toContain('Math.min(50,nv(expCfg.holdoutPercent,0))')
  })

  it('hold-out 0% nunca sorteia ninguém para o controle', () => {
    const id = run(design(), behavior({ experiment: { holdoutPercent: 0 } }))
    vi.advanceTimersByTime(1000)
    expect(ov(id)).not.toBeNull()
    expect(localStorage.getItem(`_wfls_bk_${id}`)).toBeNull()
  })

  it('gate de país usa /api/public/geo e bloqueia fora da lista', async () => {
    const id = run(design(), behavior({ location: { includeEnabled: true, includeCountries: ['US'] } }))
    await vi.runAllTimersAsync()
    expect(calls.some((c) => c.url === `${BU}/api/public/geo`)).toBe(true)
    expect(calls.some((c) => c.url.includes('ipapi'))).toBe(false)
    expect(ov(id)).toBeNull()
    expect(sessionStorage.getItem('_wf_country')).toBe('BR')
  })

  it('gate de país deixa passar quando o país está na lista', async () => {
    const id = run(design(), behavior({ location: { includeEnabled: true, includeCountries: ['BR', 'PT'] } }))
    await vi.runAllTimersAsync()
    expect(ov(id)).not.toBeNull()
  })
})
