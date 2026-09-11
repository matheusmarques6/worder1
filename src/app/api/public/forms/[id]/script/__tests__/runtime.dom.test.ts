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
  window.history.replaceState({}, '', '/')
  Object.defineProperty(document, 'referrer', { value: '', configurable: true })
  delete (window as any).__worder
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

  it('ramificação: a opção escolhida decide a próxima etapa, voltar segue a trilha, e o caminho vai no submit', async () => {
    const d = design({
      steps: [
        { id: 'st-a', name: 'A', blocks: [
          { id: 'q', type: 'radio', props: { label: 'Pele', mapTo: 'custom', mapToCustom: 'pele', options: ['Oleosa', 'Seca'], branches: { Oleosa: 'st-c', Seca: 'st-b' } } },
          { id: 'n', type: 'button', props: { text: 'Próxima', action: 'next-step' } },
        ] },
        { id: 'st-b', name: 'B', blocks: [{ id: 'tb', type: 'text', props: { content: 'Etapa B' } }, { id: 'nb', type: 'button', props: { text: 'Próxima', action: 'next-step' } }] },
        { id: 'st-c', name: 'C', blocks: [
          { id: 'tc', type: 'text', props: { content: 'Etapa C' } },
          { id: 'back', type: 'button', props: { text: 'Voltar', action: 'prev-step' } },
          { id: 'e', type: 'email', props: { required: true } },
          { id: 's', type: 'button', props: { text: 'Enviar', action: 'submit' } },
        ] },
      ],
      styles: { width: 480, closeButton: { show: true }, progress: { enabled: true } },
    })
    const views = listen('stepView')
    const id = run(d)
    vi.advanceTimersByTime(1000)
    const root0 = root(id)!
    // Barra de progresso na primeira etapa: 1 de 3.
    expect(root0.querySelector('.wf-progress')!.getAttribute('aria-valuenow')).toBe('33')
    // Escolhe "Oleosa" → pula a etapa B e cai na C.
    const radio = formEl(id)!.querySelector<HTMLInputElement>('input[value="Oleosa"]')!
    radio.checked = true
    formEl(id)!.querySelector<HTMLElement>('[data-action="next-step"]')!.click()
    expect(formEl(id)!.textContent).toContain('Etapa C')
    expect(views.map((v) => v.stepId)).toEqual(['st-a', 'st-c'])
    expect(root(id)!.querySelector('.wf-progress')!.getAttribute('aria-valuenow')).toBe('100')
    // Voltar vai para A (a trilha), não para B (a sequência).
    formEl(id)!.querySelector<HTMLElement>('[data-action="prev-step"]')!.click()
    expect(formEl(id)!.querySelector('input[value="Oleosa"]')).not.toBeNull()
    // De novo para C e envia.
    formEl(id)!.querySelector<HTMLInputElement>('input[value="Oleosa"]')!.checked = true
    formEl(id)!.querySelector<HTMLElement>('[data-action="next-step"]')!.click()
    formEl(id)!.querySelector<HTMLInputElement>('input[name="email"]')!.value = 'q@example.com'
    formEl(id)!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await vi.runAllTimersAsync()
    const submit = calls.find((c) => c.url === `${BU}/api/public/forms/${id}/submit`)!
    // O caminho é a trilha que levou ao envio: voltar desfaz o passo, não acumula histórico.
    expect(submit.body.step_path).toEqual(['st-a', 'st-c'])
    expect(submit.body.answers['custom:pele']).toBe('Oleosa')
    // Etapas intermediárias mandam o beacon 'step'.
    expect(eventsFor(id).filter((e) => e.type === 'step').map((e) => e.step)).toEqual([2, 2])
  })

  it('ramificação: o botão pode apontar para uma etapa fixa', () => {
    const d = design({
      steps: [
        { id: 'st-a', name: 'A', blocks: [{ id: 'n', type: 'button', props: { text: 'Pular', action: 'next-step', nextStepId: 'st-c' } }] },
        { id: 'st-b', name: 'B', blocks: [{ id: 'tb', type: 'text', props: { content: 'Etapa B' } }] },
        { id: 'st-c', name: 'C', blocks: [{ id: 'tc', type: 'text', props: { content: 'Etapa C' } }] },
      ],
    })
    const id = run(d)
    vi.advanceTimersByTime(1000)
    formEl(id)!.querySelector<HTMLElement>('[data-action="next-step"]')!.click()
    expect(formEl(id)!.textContent).toContain('Etapa C')
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

describe('targeting: página, tráfego, carrinho e audiência', () => {
  // Cada run() abaixo é uma pageview nova: o mutex de um popup por vez e o
  // registro de prioridade vivem em window e barrariam o segundo popup.
  function freshPage() {
    for (const k of Object.keys(window)) if (k.startsWith('__wf')) delete (window as any)[k]
  }
  function withFetch(handler: (url: string) => Response | null) {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => handler(String(url)) || fetchMock(url, init)))
  }

  it('tráfego: sem referrer é direto e a impressão e o envio carregam origem e tipo de página', async () => {
    const id = run(design(), behavior({ traffic: { enabled: true, types: ['direct'] } }))
    vi.advanceTimersByTime(1000)
    expect(ov(id)).not.toBeNull()
    const imp = eventsFor(id).find((e) => e.type === 'impression')!
    expect(imp.traffic).toBe('direct')
    expect(imp.page).toBe('index')
    formEl(id)!.querySelector<HTMLInputElement>('input[name="email"]')!.value = 'q@example.com'
    formEl(id)!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await vi.runAllTimersAsync()
    const submit = calls.find((c) => c.url === `${BU}/api/public/forms/${id}/submit`)!
    expect(submit.body.traffic_type).toBe('direct')
    expect(submit.body.page_kind).toBe('index')
  })

  it('tráfego: utm_medium=cpc é pago, fica na sessão e bloqueia quem só quer orgânico', () => {
    window.history.replaceState({}, '', '/?utm_medium=cpc&utm_source=google')
    const a = run(design(), behavior({ traffic: { enabled: true, types: ['organic'] } }))
    vi.advanceTimersByTime(1000)
    expect(ov(a)).toBeNull()
    expect(sessionStorage.getItem('_wf_traffic')).toBe('paid')
    // Navegação interna: sem UTM, referrer é a própria loja — vale o da sessão.
    window.history.replaceState({}, '', '/products/x')
    Object.defineProperty(document, 'referrer', { value: 'http://localhost/?utm_medium=cpc', configurable: true })
    freshPage()
    const b = run(design(), behavior({ traffic: { enabled: true, types: ['paid'] } }))
    vi.advanceTimersByTime(1000)
    expect(ov(b)).not.toBeNull()
  })

  it('tráfego: referrer de buscador é orgânico, de rede social é social, gclid é pago', () => {
    Object.defineProperty(document, 'referrer', { value: 'https://www.google.com/', configurable: true })
    const a = run(design(), behavior({ traffic: { enabled: true, types: ['organic'] } }))
    vi.advanceTimersByTime(1000)
    expect(ov(a)).not.toBeNull()
    sessionStorage.clear()
    Object.defineProperty(document, 'referrer', { value: 'https://l.instagram.com/', configurable: true })
    freshPage()
    const b = run(design(), behavior({ traffic: { enabled: true, types: ['organic'] } }))
    vi.advanceTimersByTime(1000)
    expect(ov(b)).toBeNull()
    expect(sessionStorage.getItem('_wf_traffic')).toBe('social')
    sessionStorage.clear()
    window.history.replaceState({}, '', '/?gclid=abc')
    freshPage()
    run(design(), behavior({ traffic: { enabled: true, types: ['paid'] } }))
    expect(sessionStorage.getItem('_wf_traffic')).toBe('paid')
  })

  it('página: usa o contexto do bloco de tema e filtra por produto em vista', () => {
    ;(window as any).__worder = { template: 'product.custom', product: { handle: 'kit-skincare', type: 'Skincare', vendor: 'Acme', tags: ['promo', 'novo'] } }
    const ok = run(design(), behavior({ page: { enabled: true, templates: ['product'], productHandles: ['kit-*'] } }))
    vi.advanceTimersByTime(1000)
    expect(ov(ok)).not.toBeNull()
    expect(eventsFor(ok).find((e) => e.type === 'impression')!.page).toBe('product')
    freshPage()
    const byTag = run(design(), behavior({ page: { enabled: true, productTags: ['NOVO'] } }))
    vi.advanceTimersByTime(1000)
    expect(ov(byTag)).not.toBeNull()
    freshPage()
    const wrongType = run(design(), behavior({ page: { enabled: true, productTypes: ['Roupas'] } }))
    vi.advanceTimersByTime(1000)
    expect(ov(wrongType)).toBeNull()
    freshPage()
    const wrongTemplate = run(design(), behavior({ page: { enabled: true, templates: ['cart', 'index'] } }))
    vi.advanceTimersByTime(1000)
    expect(ov(wrongTemplate)).toBeNull()
  })

  it('página: sem o bloco de tema deduz pela URL; filtro de produto sem produto bloqueia', () => {
    window.history.replaceState({}, '', '/collections/verao')
    const col = run(design(), behavior({ page: { enabled: true, templates: ['collection'], collectionHandles: ['verao'] } }))
    vi.advanceTimersByTime(1000)
    expect(ov(col)).not.toBeNull()
    freshPage()
    const needsProduct = run(design(), behavior({ page: { enabled: true, productHandles: ['kit-*'] } }))
    vi.advanceTimersByTime(1000)
    expect(ov(needsProduct)).toBeNull()
    window.history.replaceState({}, '', '/products/kit-noite')
    freshPage()
    const prod = run(design(), behavior({ page: { enabled: true, productHandles: ['kit-*'] } }))
    vi.advanceTimersByTime(1000)
    expect(ov(prod)).not.toBeNull()
  })

  it('carrinho: filtra pelo conteúdo via /cart.js — "tem algum" e "não tem nenhum"', async () => {
    withFetch((url) => url.endsWith('/cart.js')
      ? new Response(JSON.stringify({ total_price: 15000, item_count: 2, items: [{ handle: 'camiseta-basica', product_type: 'Roupas', vendor: 'Acme' }, { handle: 'meia', product_type: 'Acessórios', vendor: 'Outro' }] }))
      : null)
    const has = run(design(), behavior({ cart: { enabled: false, contains: { enabled: true, match: 'any', handles: ['camiseta-*'] } } }))
    await vi.runAllTimersAsync()
    expect(ov(has)).not.toBeNull()
    freshPage()
    const none = run(design(), behavior({ cart: { contains: { enabled: true, match: 'none', vendors: ['acme'] } } }))
    await vi.runAllTimersAsync()
    expect(ov(none)).toBeNull()
    freshPage()
    const missing = run(design(), behavior({ cart: { contains: { enabled: true, match: 'any', types: ['Skincare'] } } }))
    await vi.runAllTimersAsync()
    expect(ov(missing)).toBeNull()
    // Valor mínimo continua valendo junto com o conteúdo.
    freshPage()
    const tooCheap = run(design(), behavior({ cart: { enabled: true, minTotal: 500, contains: { enabled: true, match: 'any', handles: ['camiseta-basica'] } } }))
    await vi.runAllTimersAsync()
    expect(ov(tooCheap)).toBeNull()
  })

  it('audiência: consulta o servidor com o id do visitante e respeita a resposta', async () => {
    const seen: string[] = []
    withFetch((url) => {
      if (!url.includes('/preview-allowed')) return null
      seen.push(url)
      return new Response(JSON.stringify({ allowed: false, reason: 'not_in_audience' }))
    })
    const cfg = { audienceTargeting: { mode: 'include', segmentIds: ['11111111-1111-4111-8111-111111111111'], listIds: [] } }
    const a = run(design(), behavior(cfg))
    await vi.runAllTimersAsync()
    expect(ov(a)).toBeNull()
    expect(seen[0]).toContain('vid=visitor-abc')
    // A resposta fica em cache por popup: segunda carga não volta ao servidor.
    freshPage()
    const again = run(design(), behavior(cfg), a)
    await vi.runAllTimersAsync()
    expect(ov(again)).toBeNull()
    expect(seen).toHaveLength(1)
  })

  it('audiência: "somente quem está" sem id de visitante não mostra; "exceto" mostra', async () => {
    document.cookie = '__worder_id=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/'
    const inc = run(design(), behavior({ audienceTargeting: { mode: 'include', segmentIds: ['11111111-1111-4111-8111-111111111111'] } }))
    await vi.runAllTimersAsync()
    expect(ov(inc)).toBeNull()
    expect(calls.some((c) => c.url.includes('/preview-allowed'))).toBe(false)
    freshPage()
    const exc = run(design(), behavior({ audienceTargeting: { mode: 'exclude', segmentIds: ['11111111-1111-4111-8111-111111111111'] } }))
    await vi.runAllTimersAsync()
    expect(ov(exc)).not.toBeNull()
  })
})

describe('experimento A/B no runtime', () => {
  const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  function variantDesign() {
    return design({ steps: [{ blocks: [
      { id: 'tb', type: 'text', props: { content: 'Versão B' } },
      { id: 'b1', type: 'email', props: { placeholder: 'email', required: true } },
      { id: 'b2', type: 'button', props: { text: 'Enviar', action: 'submit' } },
    ] }] })
  }
  function runExp(split: Record<string, number>, id = nextId()) {
    const form = { id, name: 'Teste', design_json: design(), behavior: behavior(), experiment: { id: 'exp-1', mode: 'split' as const, split, variants: [{ id: B, design: variantDesign() }] } }
    new Function(buildPopupScript(form, BU))()
    return id
  }

  it('100% para B: renderiza o design da variante, marca eventos e envio com variant_id, e fica pegajoso', async () => {
    const id = nextId()
    runExp({ [id]: 0, [B]: 100 }, id)
    vi.advanceTimersByTime(1000)
    expect(formEl(id)!.textContent).toContain('Versão B')
    expect(eventsFor(id).find((e) => e.type === 'impression')!.variant_id).toBe(B)
    expect(JSON.parse(localStorage.getItem('_wfls_ab_exp-1')!).v).toBe(B)
    formEl(id)!.querySelector<HTMLInputElement>('input[name="email"]')!.value = 'q@example.com'
    formEl(id)!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await vi.runAllTimersAsync()
    const submit = calls.find((c) => c.url === `${BU}/api/public/forms/${id}/submit`)!
    expect(submit.body.variant_id).toBe(B)
  })

  it('100% para A: design do popup principal e variant_id do próprio popup', () => {
    const id = nextId()
    runExp({ [id]: 100, [B]: 0 }, id)
    vi.advanceTimersByTime(1000)
    expect(formEl(id)!.textContent).not.toContain('Versão B')
    expect(eventsFor(id).find((e) => e.type === 'impression')!.variant_id).toBe(id)
  })

  it('a escolha guardada vence o sorteio (visitante não troca de variante)', () => {
    const id = nextId()
    localStorage.setItem('_wfls_ab_exp-1', JSON.stringify({ v: B, e: Date.now() + 86400000 }))
    runExp({ [id]: 100, [B]: 0 }, id)
    vi.advanceTimersByTime(1000)
    expect(formEl(id)!.textContent).toContain('Versão B')
  })
})

describe('smart triggering: propensão e segunda chance', () => {
  function freshPage() {
    for (const k of Object.keys(window)) if (k.startsWith('__wf')) delete (window as any)[k]
  }
  function closeByUser(id: string) {
    root(id)!.querySelector<HTMLElement>('[data-action="close"]')?.click()
  }

  it('a impressão e o envio carregam o score de propensão', async () => {
    const id = run(design(), behavior())
    vi.advanceTimersByTime(1000)
    const imp = eventsFor(id).find((e) => e.type === 'impression')!
    expect(typeof imp.propensity).toBe('number')
    expect(imp.retrigger).toBe(false)
    formEl(id)!.querySelector<HTMLInputElement>('input[name="email"]')!.value = 'q@example.com'
    formEl(id)!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await vi.runAllTimersAsync()
    const submit = calls.find((c) => c.url === `${BU}/api/public/forms/${id}/submit`)!
    expect(typeof submit.body.propensity_score).toBe('number')
  })

  it('quem fechou volta a ver uma vez na sessão quando a intenção passa do limiar — nunca antes do delay mínimo', () => {
    const id = nextId()
    // Pesos só de permanência e páginas, para o teste controlar o score.
    const beh = behavior({ smartTrigger: { enabled: true, threshold: 50, minDelaySec: 10, weights: { scroll: 0, dwell: 60, pages: 40, products: 0, cart: 0, returning: 0, traffic: 0 } } })
    run(design(), beh, id)
    vi.advanceTimersByTime(1000)
    expect(ov(id)).not.toBeNull()
    closeByUser(id)
    expect(ov(id)).toBeNull()
    expect(sessionStorage.getItem(`_wf_sd_${id}`)).not.toBeNull()
    // Nova página da mesma sessão: a frequência bloquearia; a segunda chance vigia.
    freshPage()
    document.body.innerHTML = ''
    run(design(), beh, id)
    vi.advanceTimersByTime(5000)
    expect(ov(id)).toBeNull() // antes do delay mínimo, mesmo com score
    // 2 páginas (40·2/5=16) + permanência: aos 60 s na sessão o score passa de 50.
    vi.advanceTimersByTime(80000)
    expect(ov(id)).not.toBeNull()
    const imps = eventsFor(id).filter((e) => e.type === 'impression')
    expect(imps[imps.length - 1].retrigger).toBe(true)
    expect(sessionStorage.getItem(`_wf_rt_${id}`)).toBe('1')
    // Fechou de novo: acabou a segunda chance nesta sessão.
    closeByUser(id)
    freshPage()
    document.body.innerHTML = ''
    run(design(), beh, id)
    vi.advanceTimersByTime(200000)
    expect(ov(id)).toBeNull()
  })

  it('sem a opção ligada, quem fechou não vê de novo', () => {
    const id = nextId()
    run(design(), behavior(), id)
    vi.advanceTimersByTime(1000)
    closeByUser(id)
    freshPage()
    document.body.innerHTML = ''
    run(design(), behavior(), id)
    vi.advanceTimersByTime(200000)
    expect(ov(id)).toBeNull()
  })
})

describe('smart offers no runtime', () => {
  function offerDesign(smartOffer: any) {
    return design({
      steps: [{ blocks: [
        { id: 't', type: 'text', props: { content: 'Ganhe {{offer}} agora' } },
        { id: 'b1', type: 'email', props: { placeholder: 'email', required: true } },
        { id: 'k', type: 'coupon', props: { code: 'STATIC10', mode: 'static', discountType: 'percentage', discountValue: 10, tiers: [{ id: 't-big', label: '25% na primeira compra', afterStepId: 'x', discountType: 'percentage', discountValue: 25 }], smartOffer } },
        { id: 'b2', type: 'button', props: { text: 'Quero {{offer}}', action: 'submit' } },
      ] }],
    })
  }
  // Sem pesos a propensão fica em 0 → intenção baixa; com pesos altos de páginas → alta.
  const lowWeights = { scroll: 0, dwell: 0, pages: 0, products: 0, cart: 0, returning: 0, traffic: 0 }
  const highWeights = { ...lowWeights, pages: 500 }

  it('intenção baixa recebe o nível maior e o texto mostra a oferta; o envio leva intenção, grupo e oferta', async () => {
    const id = run(offerDesign({ enabled: true, lowMax: 35, highMin: 70, lowTier: 't-big', midTier: 'base', highTier: 'none', controlPercent: 0 }), behavior({ smartTrigger: { enabled: false, weights: lowWeights } }))
    vi.advanceTimersByTime(1000)
    expect(formEl(id)!.textContent).toContain('Ganhe 25% na primeira compra agora')
    expect(formEl(id)!.querySelector('[data-action="submit"]')!.textContent).toBe('Quero 25% na primeira compra')
    formEl(id)!.querySelector<HTMLInputElement>('input[name="email"]')!.value = 'q@example.com'
    formEl(id)!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await vi.runAllTimersAsync()
    const submit = calls.find((c) => c.url === `${BU}/api/public/forms/${id}/submit`)!
    expect(submit.body).toMatchObject({ intent: 'low', offer_bucket: 'smart', offer_tier: 't-big' })
  })

  it('intenção alta com "sem desconto": o bloco de cupom some e a merge tag fica vazia', () => {
    const id = run(offerDesign({ enabled: true, lowMax: 35, highMin: 70, lowTier: 't-big', midTier: 'base', highTier: 'none', controlPercent: 0 }), behavior({ smartTrigger: { enabled: false, weights: highWeights } }))
    vi.advanceTimersByTime(1000)
    expect(formEl(id)!.textContent).toContain('Ganhe  agora')
    expect(formEl(id)!.textContent).not.toContain('STATIC10')
  })

  it('controle a 100% recebe sempre a base', async () => {
    const id = run(offerDesign({ enabled: true, lowMax: 35, highMin: 70, lowTier: 't-big', midTier: 'base', highTier: 'none', controlPercent: 50 }), behavior({ smartTrigger: { enabled: false, weights: lowWeights } }))
    vi.advanceTimersByTime(1000)
    const txt = formEl(id)!.textContent || ''
    // 50% de controle: ou base (10% OFF) ou o nível — nunca vazio.
    expect(txt.includes('10% OFF') || txt.includes('25% na primeira compra')).toBe(true)
  })

  it('desligado, {{offer}} vira a oferta base e nada vai no envio', async () => {
    const id = run(offerDesign({ enabled: false }), behavior())
    vi.advanceTimersByTime(1000)
    expect(formEl(id)!.textContent).toContain('Ganhe 10% OFF agora')
    formEl(id)!.querySelector<HTMLInputElement>('input[name="email"]')!.value = 'q@example.com'
    formEl(id)!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await vi.runAllTimersAsync()
    const submit = calls.find((c) => c.url === `${BU}/api/public/forms/${id}/submit`)!
    expect(submit.body.offer_bucket).toBeUndefined()
  })
})

describe('gamificação: roleta e raspadinha', () => {
  function freshPage() {
    for (const k of Object.keys(window)) if (k.startsWith('__wf')) delete (window as any)[k]
  }
  // O /submit devolve o que o servidor decidiu (game + cupom); o resto
  // segue o mock padrão.
  function withSubmit(extra: Record<string, any>) {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/submit')) {
        let body: any = null
        try { body = JSON.parse(String(init?.body)) } catch { body = null }
        calls.push({ url: String(url), init, body })
        return new Response(JSON.stringify({ success: true, submission_id: 'sub-1', contact_id: 'ct-1', consent: {}, ...extra }), { status: 200 })
      }
      return fetchMock(url, init)
    }))
  }
  const segments = [
    { id: 's1', label: '10% OFF', prize: 'base', weight: 40, color: '#F97316' },
    { id: 's2', label: 'Quase!', prize: 'none', weight: 20, color: '#111827' },
    { id: 's3', label: 'Frete grátis', prize: 't-ship', weight: 20, color: '#FDBA74' },
    { id: 's4', label: '10% OFF', prize: 'base', weight: 20, color: '#374151' },
  ]
  function gameDesign(block: any) {
    return design({
      steps: [{ blocks: [
        { id: 'b1', type: 'email', props: { placeholder: 'email', required: true } },
        block,
      ] }],
      successStep: { blocks: [
        { id: 's1', type: 'text', props: { content: 'Você ganhou {{prize}}' } },
        { id: 'k1', type: 'coupon', props: { code: 'STATIC10', mode: 'static' } },
      ] },
    })
  }

  // A rotação é lida do ATRIBUTO transform do grupo que gira (wf-wdisc),
  // não do style do <svg>: o aro, o brilho e o ponteiro ficam parados, e
  // quem gira é só o disco.
  function discRot(form: HTMLFormElement): number {
    const g = form.querySelector('g[id^="wf-wdisc-"]') as SVGElement
    const m = /rotate\(([-\d.]+)/.exec(String(g.getAttribute('transform') || ''))
    return m ? parseFloat(m[1]) : NaN
  }

  it('roleta: os segmentos saem do design, o servidor decide e a roleta para no prêmio antes do sucesso', async () => {
    freshPage()
    withSubmit({
      game: { type: 'wheel', segment: 2, segment_id: 's3', label: 'Frete grátis', prize: 't-ship' },
      coupon: { code: 'SHIP-1', kind: 'free_shipping', value: 0, ends_at: null, auto_apply: false, show_code: true },
    })
    const results = listen('gameResult')
    const paradas = listen('gameWheelStop')
    const id = run(gameDesign({ id: 'w1', type: 'wheel', props: { segments, buttonText: 'Girar!' } }))
    await vi.advanceTimersByTimeAsync(1500)
    const form = formEl(id)!
    const svg = form.querySelector('svg[id^="wf-wheel-"]') as SVGElement
    expect(svg).toBeTruthy()
    expect(svg.querySelectorAll('path').length).toBe(4)
    expect(svg.querySelectorAll('text')[2].textContent).toBe('Frete grátis')
    expect(form.querySelector('[data-action="submit"]')!.textContent).toBe('Girar!')
    // Parada, a roleta está na posição zero.
    expect(discRot(form)).toBe(0)
    ;(form.querySelector('input[name="email"]') as HTMLInputElement).value = 'ana@example.com'
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await vi.advanceTimersByTimeAsync(50)
    // Girando: o sucesso ainda não entrou e o prêmio ainda não foi
    // anunciado para quem usa leitor de tela.
    expect(root(id)!.textContent).not.toContain('Você ganhou')
    expect(form.querySelector('[id^="wf-wsr-"]')!.textContent).toBe('')
    expect(results[0]).toMatchObject({ game: 'wheel', segment: 2, label: 'Frete grátis', prize: 't-ship' })
    await vi.advanceTimersByTimeAsync(5500)
    // Parou no centro do terceiro de quatro setores (225°), cinco voltas
    // depois, com folga só dentro do setor.
    const rot = discRot(form)
    expect(rot).toBeGreaterThanOrEqual(1800 - 225 - 18)
    expect(rot).toBeLessThanOrEqual(1800 - 225 + 18)
    // Os outros setores apagam e o sorteado ganha o contorno pulsante.
    const secs = Array.from(svg.querySelectorAll('path[id^="wf-wsec-"]')) as SVGElement[]
    expect(secs.map((s) => s.style.fillOpacity)).toEqual(['0.28', '0.28', '', '0.28'])
    expect(svg.querySelector('path.wf-wglow')).toBeTruthy()
    expect(paradas[0]).toMatchObject({ game: 'wheel', segment: 2, label: 'Frete grátis' })
    expect(root(id)!.textContent).toContain('Você ganhou Frete grátis')
    expect(root(id)!.textContent).toContain('SHIP-1')
  })

  // A roleta tem de PARECER um objeto: aro com volume, pinos nas divisões,
  // brilho fixo no alto, cubo no centro e o ponteiro por fora do que gira.
  // Antes era um gráfico de pizza rodando inteiro — brilho incluído.
  it('roleta: aro, pinos, brilho e ponteiro ficam fora do que gira', async () => {
    freshPage()
    withSubmit({ game: { type: 'wheel', segment: 0, segment_id: 's1', label: '10% OFF', prize: 'base' } })
    const id = run(gameDesign({ id: 'w1', type: 'wheel', props: { segments } }))
    await vi.advanceTimersByTimeAsync(1500)
    const form = formEl(id)!
    const svg = form.querySelector('svg[id^="wf-wheel-"]') as SVGElement
    const disc = form.querySelector('g[id^="wf-wdisc-"]') as SVGElement
    // Dentro do disco: os quatro setores, os quatro rótulos e um pino por
    // divisão. Nada mais — o resto não pode girar.
    expect(disc.querySelectorAll('path[id^="wf-wsec-"]').length).toBe(4)
    expect(disc.querySelectorAll('text').length).toBe(4)
    expect(disc.querySelectorAll('circle').length).toBe(4)
    // Fora dele: aro com gradiente, brilho, cubo.
    const rim = Array.from(svg.querySelectorAll('circle')).find((c) => String(c.getAttribute('stroke') || '').indexOf('wf-wrim-') >= 0)
    expect(rim).toBeTruthy()
    expect(Array.from(svg.querySelectorAll('circle')).some((c) => String(c.getAttribute('fill') || '').indexOf('wf-wsh-') >= 0)).toBe(true)
    expect(svg.querySelector('linearGradient[id^="wf-wrim-"]')).toBeTruthy()
    // O ponteiro é um irmão do svg, com o pivô no topo: é ele que os pinos
    // empurram enquanto o disco passa.
    const ptr = form.querySelector('[id^="wf-wptr-"]') as HTMLElement
    expect(ptr).toBeTruthy()
    expect(ptr.parentElement!.contains(svg)).toBe(true)
    expect(ptr.style.transformOrigin).toBe('50% 13%')
    expect(form.querySelector('[id^="wf-wcf-"]')).toBeTruthy()
    expect(form.querySelector('[id^="wf-wsr-"]')!.getAttribute('role')).toBe('status')
  })

  it('roleta: ganhou joga confete, "tente de novo" não', async () => {
    freshPage()
    withSubmit({ game: { type: 'wheel', segment: 0, segment_id: 's1', label: '10% OFF', prize: 'base' } })
    const id = run(gameDesign({ id: 'w1', type: 'wheel', props: { segments } }))
    await vi.advanceTimersByTimeAsync(1500)
    const form = formEl(id)!
    ;(form.querySelector('input[name="email"]') as HTMLInputElement).value = 'ana@example.com'
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await vi.advanceTimersByTimeAsync(4700)
    expect(form.querySelector('[id^="wf-wcf-"]')!.children.length).toBe(18)

    freshPage()
    withSubmit({ game: { type: 'wheel', segment: 1, segment_id: 's2', label: 'Quase!', prize: 'none' } })
    const id2 = run(gameDesign({ id: 'w1', type: 'wheel', props: { segments } }))
    await vi.advanceTimersByTimeAsync(1500)
    const f2 = formEl(id2)!
    ;(f2.querySelector('input[name="email"]') as HTMLInputElement).value = 'bia@example.com'
    f2.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await vi.advanceTimersByTimeAsync(4700)
    expect(f2.querySelector('[id^="wf-wcf-"]')!.children.length).toBe(0)
  })

  // Quem pediu menos movimento no sistema não recebe cinco voltas, tique
  // nem confete: o disco vai direto para o prêmio.
  it('roleta: prefers-reduced-motion vai direto ao prêmio', async () => {
    freshPage()
    const antes = window.matchMedia
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (q: string) => ({ matches: /reduce/.test(q), media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false }),
    })
    try {
      withSubmit({
        game: { type: 'wheel', segment: 2, segment_id: 's3', label: 'Frete grátis', prize: 't-ship' },
        coupon: { code: 'SHIP-1', kind: 'free_shipping', value: 0, ends_at: null, auto_apply: false, show_code: true },
      })
      const id = run(gameDesign({ id: 'w1', type: 'wheel', props: { segments } }))
      await vi.advanceTimersByTimeAsync(1500)
      const form = formEl(id)!
      ;(form.querySelector('input[name="email"]') as HTMLInputElement).value = 'ana@example.com'
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await vi.advanceTimersByTimeAsync(120)
      // Sem voltas: menos de um giro, e já no setor sorteado (225° − 4 voltas).
      const rot = discRot(form)
      expect(rot).toBeGreaterThanOrEqual(135 - 18)
      expect(rot).toBeLessThanOrEqual(135 + 18)
      expect(form.querySelector('[id^="wf-wcf-"]')!.children.length).toBe(0)
      await vi.advanceTimersByTimeAsync(1600)
      expect(root(id)!.textContent).toContain('Você ganhou Frete grátis')
    } finally {
      Object.defineProperty(window, 'matchMedia', { configurable: true, value: antes })
    }
  })

  it('roleta: o tique pode ser desligado no bloco', async () => {
    freshPage()
    withSubmit({ game: { type: 'wheel', segment: 0, segment_id: 's1', label: '10% OFF', prize: 'base' } })
    const id = run(gameDesign({ id: 'w1', type: 'wheel', props: { segments, sound: false } }))
    await vi.advanceTimersByTimeAsync(1500)
    expect(formEl(id)!.querySelector('[data-game="wheel"]')!.getAttribute('data-sound')).toBe('0')
  })

  // A raspadinha tem de RASPAR: arrastar o dedo (ou o mouse) apaga a
  // lâmina, e o traço acompanha o movimento. Antes, cada evento pintava um
  // círculo solto — com o dedo rápido sobravam buracos — e o cartão só
  // ficava tocável depois do envio, com "cursor: não permitido" em cima.
  function contextoFalso(alphaZerado: () => number) {
    const chamadas: string[] = []
    const ctx: any = {
      chamadas,
      globalCompositeOperation: '', globalAlpha: 1, lineCap: '', lineJoin: '', lineWidth: 0,
      fillStyle: '', strokeStyle: '', font: '', textAlign: '', textBaseline: '',
      beginPath: () => chamadas.push('beginPath'),
      moveTo: () => chamadas.push('moveTo'),
      lineTo: () => chamadas.push('lineTo'),
      stroke: () => chamadas.push('stroke'),
      arc: () => chamadas.push('arc'),
      fill: () => chamadas.push('fill'),
      fillRect: () => chamadas.push('fillRect'),
      fillText: () => chamadas.push('fillText'),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      getImageData: () => {
        // 1 em cada 64 bytes é lido (o alpha); devolvemos a proporção pedida.
        const total = 4096
        const data = new Uint8ClampedArray(total)
        const zerar = Math.floor((total / 64) * alphaZerado())
        for (let i = 0, z = 0; i < total; i += 64, z++) data[i + 3] = z < zerar ? 0 : 255
        return { data }
      },
    }
    return ctx
  }

  async function raspar(id: string, ctx: any, movimentos: number) {
    const cv = root(id)!.querySelector('canvas') as HTMLCanvasElement
    cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: 320, height: 190, right: 320, bottom: 190, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    cv.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 }))
    for (let i = 1; i <= movimentos; i++) {
      cv.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 10 + i * 12, clientY: 10 + i * 5 }))
    }
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(10)
    return cv
  }

  it('raspadinha: arrastar apaga a lâmina com traço contínuo', async () => {
    freshPage()
    const ctx = contextoFalso(() => 0.1)
    const orig = (HTMLCanvasElement.prototype as any).getContext
    ;(HTMLCanvasElement.prototype as any).getContext = () => ctx
    try {
      withSubmit({ game: { type: 'scratch', segment: 0, segment_id: 's1', label: '10% OFF', prize: 'base' }, coupon: null })
      const id = run(gameDesign({ id: 'sc2', type: 'scratch', props: { segments, buttonText: 'Raspar' } }))
      await vi.advanceTimersByTimeAsync(1500)
      const form = formEl(id)!
      ;(form.querySelector('input[name="email"]') as HTMLInputElement).value = 'ana@example.com'
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await vi.advanceTimersByTimeAsync(50)

      ctx.chamadas.length = 0
      const cv = await raspar(id, ctx, 5)

      // Traço contínuo entre um ponto e o outro — não um círculo solto.
      expect(ctx.chamadas).toContain('lineTo')
      expect(ctx.chamadas).toContain('stroke')
      expect(ctx.chamadas.filter((c: string) => c === 'arc').length).toBeGreaterThan(1)
      expect(ctx.globalCompositeOperation).toBe('destination-out')
      // Ainda tem lâmina: 10% apagado não revela.
      expect(cv.style.opacity).not.toBe('0')
    } finally {
      ;(HTMLCanvasElement.prototype as any).getContext = orig
    }
  })

  it('raspadinha: passada a metade, o resto abre sozinho e o prêmio aparece', async () => {
    freshPage()
    const ctx = contextoFalso(() => 0.8)
    const orig = (HTMLCanvasElement.prototype as any).getContext
    ;(HTMLCanvasElement.prototype as any).getContext = () => ctx
    try {
      withSubmit({ game: { type: 'scratch', segment: 0, segment_id: 's1', label: '10% OFF', prize: 'base' }, coupon: null })
      const id = run(gameDesign({ id: 'sc3', type: 'scratch', props: { segments, buttonText: 'Raspar' } }))
      await vi.advanceTimersByTimeAsync(1500)
      const form = formEl(id)!
      ;(form.querySelector('input[name="email"]') as HTMLInputElement).value = 'ana@example.com'
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await vi.advanceTimersByTimeAsync(50)

      const cv = await raspar(id, ctx, 5)
      expect(cv.style.opacity).toBe('0')
      await vi.advanceTimersByTimeAsync(1500)
      expect(root(id)!.textContent).toContain('Você ganhou 10% OFF')
    } finally {
      ;(HTMLCanvasElement.prototype as any).getContext = orig
    }
  })

  it('raspadinha: o cartão não diz "não pode" — e antes do envio leva ao campo que falta', async () => {
    freshPage()
    const ctx = contextoFalso(() => 0)
    const orig = (HTMLCanvasElement.prototype as any).getContext
    ;(HTMLCanvasElement.prototype as any).getContext = () => ctx
    try {
      withSubmit({})
      const id = run(gameDesign({ id: 'sc4', type: 'scratch', props: { segments, buttonText: 'Raspar' } }))
      await vi.advanceTimersByTimeAsync(1500)
      const cv = root(id)!.querySelector('canvas') as HTMLCanvasElement
      expect(cv.getAttribute('style') || '').not.toContain('not-allowed')
      expect(cv.getAttribute('style') || '').toContain('touch-action:none')
      // A lâmina foi pintada com gradiente e listras, não com cinza chapado.
      expect(ctx.chamadas).toContain('fillRect')
      expect(ctx.chamadas.filter((c: string) => c === 'stroke').length).toBeGreaterThan(3)
      // Toque antes do sorteio: em vez de morrer no vazio, foca o e-mail.
      const email = formEl(id)!.querySelector('input[name="email"]') as HTMLInputElement
      cv.dispatchEvent(new Event('pointerdown', { bubbles: true }))
      // Dentro de shadow root o foco fica em root.activeElement.
      expect(root(id)!.activeElement).toBe(email)
    } finally {
      ;(HTMLCanvasElement.prototype as any).getContext = orig
    }
  })

  it('raspadinha: sem canvas revela direto; prêmio "nada" esconde o bloco de cupom', async () => {
    freshPage()
    const orig = (HTMLCanvasElement.prototype as any).getContext
    ;(HTMLCanvasElement.prototype as any).getContext = () => null
    try {
      withSubmit({ game: { type: 'scratch', segment: 1, segment_id: 's2', label: 'Quase!', prize: 'none' }, coupon: null })
      const id = run(gameDesign({ id: 'sc1', type: 'scratch', props: { segments, buttonText: 'Raspar' } }))
      await vi.advanceTimersByTimeAsync(1500)
      const form = formEl(id)!
      expect(form.querySelector('canvas')).toBeTruthy()
      ;(form.querySelector('input[name="email"]') as HTMLInputElement).value = 'ana@example.com'
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await vi.advanceTimersByTimeAsync(50)
      expect(root(id)!.querySelector('[id^="wf-scr-p-"]')!.textContent).toBe('Quase!')
      await vi.advanceTimersByTimeAsync(3000)
      const txt = root(id)!.textContent || ''
      expect(txt).toContain('Você ganhou Quase!')
      expect(txt).not.toContain('STATIC10')
    } finally {
      ;(HTMLCanvasElement.prototype as any).getContext = orig
    }
  })
})

describe('formatos: embed e banner não são modais', () => {
  function freshPage() {
    for (const k of Object.keys(window)) if (k.startsWith('__wf')) delete (window as any)[k]
  }

  it('embed: o formulário fica na página depois do sucesso, sem fechar sozinho', async () => {
    freshPage()
    const id = nextId()
    // O container do lojista traz o id do formulário no atributo.
    const host = document.createElement('div')
    host.setAttribute('data-worder-form', id)
    document.body.appendChild(host)
    const d = design({ formType: 'embed', postSubmit: { action: 'show-success', redirectUrl: '', closeDelay: 1 } })
    run(d, behavior({ display: { timeEnabled: true, delay: 0 } }), id)
    await vi.advanceTimersByTimeAsync(200)
    const form = formEl(id)!
    expect(form).toBeTruthy()
    ;(form.querySelector('input[name="email"]') as HTMLInputElement).value = 'ana@example.com'
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await vi.advanceTimersByTimeAsync(50)
    expect(root(id)!.textContent).toContain('Obrigado')
    // O closeDelay não pode apagar o conteúdo de dentro da página do lojista.
    await vi.advanceTimersByTimeAsync(4000)
    expect(root(id)).toBeTruthy()
    expect(root(id)!.textContent).toContain('Obrigado')
  })

  it('banner não é modal: sem aria-modal e sem prender o Tab', async () => {
    freshPage()
    const id = run(design({ formType: 'banner' }), behavior())
    await vi.advanceTimersByTimeAsync(1500)
    const pop = root(id)!.querySelector('[id^="wf-pop-"]') as HTMLElement
    expect(pop).toBeTruthy()
    expect(pop.getAttribute('aria-modal')).toBeNull()
    expect(pop.getAttribute('role')).toBe('region')
  })

  it('popup segue modal, com aria-modal e diálogo', async () => {
    freshPage()
    const id = run(design(), behavior())
    await vi.advanceTimersByTimeAsync(1500)
    const pop = root(id)!.querySelector('[id^="wf-pop-"]') as HTMLElement
    expect(pop.getAttribute('aria-modal')).toBe('true')
    expect(pop.getAttribute('role')).toBe('dialog')
  })
})

// =============================================
// O formato que as referências usam: foto sangrando, tela cheia no
// celular e botões de escolha empilhados. Nenhum dos três existia — o
// popup só sabia ser um cartão branco com bolinhas de rádio.
// =============================================
describe('formato de popup moderno', () => {
  function freshPage() {
    for (const k of Object.keys(window)) if (k.startsWith('__wf')) delete (window as any)[k]
  }
  beforeEach(() => { freshPage() })

  const FOTO = 'https://cdn.loja.com/capa.jpg'

  it('foto de fundo cobre o cartão e o conteúdo ganha véu para o texto sobreviver', async () => {
    const id = run(design({
      styles: {
        width: 480, closeButton: { show: true }, backgroundColor: '#FFFFFF',
        backgroundImage: { enabled: true, src: FOTO, overlay: { color: '#000000', opacity: 60 } },
      },
    }))
    await vi.advanceTimersByTimeAsync(1500)
    const pop = root(id)!.getElementById(`wf-pop-${id}`) as HTMLElement
    expect(pop.style.cssText).toContain(FOTO)
    expect(pop.style.cssText).toMatch(/background-size:\s*cover/)
    // O conteúdo não pinta branco por cima da foto…
    const conteudo = pop.querySelector('div') as HTMLElement
    expect(conteudo.style.background).not.toBe('rgb(255, 255, 255)')
    // …e o véu é um gradiente, não um bloco chapado.
    expect(conteudo.style.cssText).toContain('linear-gradient')
  })

  it('foto de origem suspeita não vira fundo', async () => {
    const id = run(design({
      styles: { width: 480, closeButton: { show: true }, backgroundImage: { enabled: true, src: 'javascript:alert(1)' } },
    }))
    await vi.advanceTimersByTimeAsync(1500)
    const pop = root(id)!.getElementById(`wf-pop-${id}`) as HTMLElement
    expect(pop.style.cssText).not.toContain('javascript:')
    expect(pop.style.cssText).not.toContain('background-image:url')
  })

  it('no celular, tela cheia de verdade — sem cartão espremido', async () => {
    const largura = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true })
    try {
      const id = run(design({ styles: { width: 480, closeButton: { show: true }, fullscreenMobile: true } }))
      await vi.advanceTimersByTimeAsync(1500)
      const pop = root(id)!.getElementById(`wf-pop-${id}`) as HTMLElement
      // jsdom normaliza o CSS ao aplicar: comparamos pelos valores, não
      // pela string crua.
      expect(pop.style.getPropertyValue('height')).toBe('100dvh')
      expect(pop.style.getPropertyValue('width')).toBe('100vw')
      expect(pop.style.getPropertyValue('border-radius')).toBe('0')
    } finally {
      Object.defineProperty(window, 'innerWidth', { value: largura, configurable: true })
    }
  })

  it('escolha: clicar responde e avança na mesma ação', async () => {
    const escolhas = listen('choice')
    const id = run(design({
      steps: [
        { id: 'p1', blocks: [{ id: 'ch', type: 'choice', props: {
          label: 'O que você procura hoje?', mapTo: 'custom', mapToCustom: 'interesse',
          options: [{ label: 'Bikinis', value: 'bikini' }, { label: 'Inteiro', value: 'inteiro', next: 'p3' }],
          declineText: 'Não, obrigado',
        } }] },
        { id: 'p2', blocks: [{ id: 'e2', type: 'email', props: { required: true } }, { id: 'b2', type: 'button', props: { text: 'Quero', action: 'submit' } }] },
        { id: 'p3', blocks: [{ id: 'e3', type: 'email', props: { required: true } }, { id: 'b3', type: 'button', props: { text: 'Quero inteiro', action: 'submit' } }] },
      ],
    }))
    await vi.advanceTimersByTimeAsync(1500)

    const botoes = root(id)!.querySelectorAll('button.wf-ch')
    expect(botoes.length).toBe(2)
    // Sem bolinha de rádio: são botões de largura total.
    expect(root(id)!.querySelector('input[type="radio"]')).toBeNull()
    expect((botoes[0] as HTMLElement).style.width).toBe('100%')

    ;(botoes[1] as HTMLElement).click()
    await vi.advanceTimersByTimeAsync(20)

    // A opção com destino próprio pulou a etapa do meio…
    expect(root(id)!.textContent).toContain('Quero inteiro')
    // …e a resposta foi anunciada para quem escuta (a etapa já trocou, o
    // campo escondido saiu com ela — a persistência é o próximo teste).
    expect(escolhas).toHaveLength(1)
    expect(escolhas[0]).toMatchObject({ value: 'inteiro', step: 0 })
  })

  it('escolha: a resposta chega no servidor junto do e-mail', async () => {
    const id = run(design({
      steps: [
        { id: 'p1', blocks: [{ id: 'ch', type: 'choice', props: {
          mapTo: 'custom', mapToCustom: 'interesse', options: ['Cabelo', 'Corpo'],
        } }] },
        { id: 'p2', blocks: [{ id: 'e2', type: 'email', props: { required: true } }, { id: 'b2', type: 'button', props: { text: 'Enviar', action: 'submit' } }] },
      ],
    }))
    await vi.advanceTimersByTimeAsync(1500)
    ;(root(id)!.querySelectorAll('button.wf-ch')[0] as HTMLElement).click()
    await vi.advanceTimersByTimeAsync(20)
    const form = formEl(id)!
    ;(form.querySelector('input[name="email"]') as HTMLInputElement).value = 'ana@example.com'
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await vi.advanceTimersByTimeAsync(50)
    const envio = calls.find((c) => c.url.includes('/submit'))
    expect(envio?.body?.answers?.['custom:interesse']).toBe('Cabelo')
  })

  it('escolha: o "não, obrigado" fecha o popup', async () => {
    const id = run(design({
      steps: [{ id: 'p1', blocks: [{ id: 'ch', type: 'choice', props: { options: ['A', 'B'], declineText: 'Não, obrigado' } }] }],
    }))
    await vi.advanceTimersByTimeAsync(1500)
    const recusa = Array.from(root(id)!.querySelectorAll('button')).find((b) => b.textContent === 'Não, obrigado')!
    expect(recusa).toBeTruthy()
    recusa.click()
    await vi.advanceTimersByTimeAsync(20)
    expect(root(id)?.getElementById(`wf-ov-${id}`)).toBeFalsy()
  })
})

describe('jogo sem botão colado', () => {
  function freshPage() {
    for (const k of Object.keys(window)) if (k.startsWith('__wf')) delete (window as any)[k]
  }
  beforeEach(() => { freshPage() })

  it('showButton:false entrega só o cartão — quem dispara é o botão da etapa', async () => {
    const id = run(design({
      steps: [{ blocks: [
        { id: 'sc', type: 'scratch', props: { showButton: false, segments: [{ id: 's1', label: '10% OFF', prize: 'base', weight: 100 }] } },
        { id: 'e1', type: 'email', props: { required: true } },
        { id: 'b1', type: 'button', props: { text: 'Raspar e ver meu prêmio', action: 'submit' } },
      ] }],
    }))
    await vi.advanceTimersByTimeAsync(1500)
    const jogo = root(id)!.querySelector('[data-game="scratch"]') as HTMLElement
    expect(jogo).toBeTruthy()
    // Nenhum botão dentro do bloco do jogo…
    expect(jogo.querySelector('button')).toBeNull()
    // …e o botão da etapa continua sendo o que envia.
    const acao = Array.from(root(id)!.querySelectorAll('button')).find(b => b.textContent === 'Raspar e ver meu prêmio')
    expect(acao?.getAttribute('data-action')).toBe('submit')
  })
})
