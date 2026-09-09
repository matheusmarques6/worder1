// =============================================
// Regras de exibição em linguagem natural.
//
// "Mostrar só para quem chegou de anúncio, no celular, na página de
// produto, depois de 10 segundos, e nunca para quem já é inscrito" vira um
// patch de behavior que o editor aplica. O modelo devolve JSON por tool
// use (saída estruturada), e TUDO passa por normalização aqui: só chaves
// conhecidas, só valores válidos, ids de segmento/lista só os da org. O
// modelo sugere; o editor mostra o que mudou; o lojista confirma.
// =============================================
import { TRAFFIC_TYPES, PAGE_TEMPLATES } from './targeting'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-haiku-4-5-20251001'

export interface TargetingContext {
  segments: Array<{ id: string; name: string }>
  lists: Array<{ id: string; name: string }>
}

export interface TargetingPatch {
  display?: { exitEnabled?: boolean; timeEnabled?: boolean; delay?: number; scrollEnabled?: boolean; scrollPercent?: number; pageViewEnabled?: boolean; pageViewCount?: number; matchAll?: boolean }
  visibility?: { devices?: 'all' | 'desktop' | 'mobile'; visitorType?: 'all' | 'new' | 'returning'; hideFromSubscribers?: boolean }
  frequency?: { showAfterDays?: number; stopAfterSubmission?: boolean }
  urls?: { includeEnabled?: boolean; includeUrls?: string[]; excludeEnabled?: boolean; excludeUrls?: string[] }
  location?: { includeEnabled?: boolean; includeCountries?: string[]; excludeEnabled?: boolean; excludeCountries?: string[] }
  page?: { enabled?: boolean; templates?: string[]; productHandles?: string[]; productTypes?: string[]; productVendors?: string[]; productTags?: string[]; collectionHandles?: string[] }
  traffic?: { enabled?: boolean; types?: string[] }
  cart?: { enabled?: boolean; minTotal?: number; maxTotal?: number; minItems?: number; contains?: { enabled?: boolean; match?: 'any' | 'none'; handles?: string[]; types?: string[]; vendors?: string[] } }
  audienceTargeting?: { mode?: 'off' | 'include' | 'exclude'; segmentIds?: string[]; listIds?: string[] }
  smartTrigger?: { enabled?: boolean; threshold?: number; minDelaySec?: number }
  experiment?: { holdoutPercent?: number }
}

export interface TargetingSuggestion {
  patch: TargetingPatch
  /** O que o modelo entendeu, em uma frase por regra — para o lojista conferir. */
  summary: string[]
  /** O que foi pedido e não existe no produto. */
  unsupported: string[]
}

const TOOL_DEF = {
  name: 'set_popup_rules',
  description: 'Define as regras de exibição de um popup a partir do pedido do lojista. Só inclua as chaves que o pedido mencionar; o resto fica como está.',
  input_schema: {
    type: 'object',
    properties: {
      display: { type: 'object', properties: { exitEnabled: { type: 'boolean' }, timeEnabled: { type: 'boolean' }, delay: { type: 'number', description: 'segundos' }, scrollEnabled: { type: 'boolean' }, scrollPercent: { type: 'number' }, pageViewEnabled: { type: 'boolean' }, pageViewCount: { type: 'number' }, matchAll: { type: 'boolean', description: 'true = todas as condições; false = qualquer uma' } } },
      visibility: { type: 'object', properties: { devices: { type: 'string', enum: ['all', 'desktop', 'mobile'] }, visitorType: { type: 'string', enum: ['all', 'new', 'returning'] }, hideFromSubscribers: { type: 'boolean' } } },
      frequency: { type: 'object', properties: { showAfterDays: { type: 'number' }, stopAfterSubmission: { type: 'boolean' } } },
      urls: { type: 'object', properties: { includeEnabled: { type: 'boolean' }, includeUrls: { type: 'array', items: { type: 'string' } }, excludeEnabled: { type: 'boolean' }, excludeUrls: { type: 'array', items: { type: 'string' } } } },
      location: { type: 'object', properties: { includeEnabled: { type: 'boolean' }, includeCountries: { type: 'array', items: { type: 'string' }, description: 'ISO-2' }, excludeEnabled: { type: 'boolean' }, excludeCountries: { type: 'array', items: { type: 'string' } } } },
      page: { type: 'object', properties: { enabled: { type: 'boolean' }, templates: { type: 'array', items: { type: 'string', enum: PAGE_TEMPLATES.map((p) => p.key) } }, productHandles: { type: 'array', items: { type: 'string' } }, productTypes: { type: 'array', items: { type: 'string' } }, productVendors: { type: 'array', items: { type: 'string' } }, productTags: { type: 'array', items: { type: 'string' } }, collectionHandles: { type: 'array', items: { type: 'string' } } } },
      traffic: { type: 'object', properties: { enabled: { type: 'boolean' }, types: { type: 'array', items: { type: 'string', enum: TRAFFIC_TYPES.map((t) => t.key) } } } },
      cart: { type: 'object', properties: { enabled: { type: 'boolean' }, minTotal: { type: 'number' }, maxTotal: { type: 'number' }, minItems: { type: 'number' }, contains: { type: 'object', properties: { enabled: { type: 'boolean' }, match: { type: 'string', enum: ['any', 'none'] }, handles: { type: 'array', items: { type: 'string' } }, types: { type: 'array', items: { type: 'string' } }, vendors: { type: 'array', items: { type: 'string' } } } } } },
      audienceTargeting: { type: 'object', properties: { mode: { type: 'string', enum: ['off', 'include', 'exclude'] }, segmentIds: { type: 'array', items: { type: 'string' } }, listIds: { type: 'array', items: { type: 'string' } } } },
      smartTrigger: { type: 'object', properties: { enabled: { type: 'boolean' }, threshold: { type: 'number' }, minDelaySec: { type: 'number' } } },
      experiment: { type: 'object', properties: { holdoutPercent: { type: 'number' } } },
      summary: { type: 'array', items: { type: 'string' }, description: 'Uma frase curta por regra aplicada, em português.' },
      unsupported: { type: 'array', items: { type: 'string' }, description: 'Pedidos que o produto não consegue atender.' },
    },
    required: ['summary'],
  },
}

function systemPrompt(ctx: TargetingContext): string {
  const segs = ctx.segments.length ? ctx.segments.map((s) => `- ${s.id} · ${s.name}`).join('\n') : '- (nenhum)'
  const lists = ctx.lists.length ? ctx.lists.map((s) => `- ${s.id} · ${s.name}`).join('\n') : '- (nenhuma)'
  return [
    'Você configura regras de exibição de popups de captura numa loja Shopify. Converta o pedido do lojista em regras usando SOMENTE a ferramenta set_popup_rules.',
    'Regras:',
    '- Só preencha o que o pedido menciona. Não invente restrições.',
    '- "anúncio", "tráfego pago", "Meta Ads", "Google Ads" → traffic.types ["paid"]. "orgânico" → ["organic"]. "redes sociais" → ["social"]. "e-mail" → ["email"]. "WhatsApp"/"SMS" → ["messaging"]. "direto" → ["direct"].',
    '- "celular"/"mobile" → visibility.devices "mobile"; "computador"/"desktop" → "desktop".',
    '- "novos visitantes" → visitorType "new"; "quem já visitou"/"retornante" → "returning".',
    '- "não mostrar para inscritos/clientes" → visibility.hideFromSubscribers true.',
    '- "página de produto" → page.enabled true + templates ["product"]; "coleção X" → collectionHandles; "produtos da marca Y" → productVendors; "categoria Z" → productTypes.',
    '- "depois de N segundos" → display.timeEnabled true + delay N. "ao sair"/"exit intent" → exitEnabled true. "depois de rolar N%" → scrollEnabled + scrollPercent. "na N-ésima página" → pageViewEnabled + pageViewCount.',
    '- "carrinho acima de R$ N" → cart.enabled true + minTotal N; "carrinho vazio" → cart.enabled true + maxTotal 0.01? NÃO: use minItems 0 e explique em summary que carrinho vazio não é filtrável. "com o produto X no carrinho" → cart.contains.',
    '- "segmento X"/"lista Y" → audienceTargeting.mode "include" e os ids abaixo. "exceto quem está em" → mode "exclude". Nunca invente ids.',
    '- "Brasil"/"fora do Brasil" → location com ISO-2 (BR).',
    '- "mostrar de novo quando demonstrar interesse" → smartTrigger.enabled true.',
    '- "grupo de controle de N%" → experiment.holdoutPercent N (máximo 50).',
    '- "só uma vez por dia/semana" → frequency.showAfterDays.',
    '- Se algo não couber nas regras, liste em unsupported, sem tentar aproximar.',
    '',
    'Segmentos da conta (id · nome):',
    segs,
    'Listas da conta (id · nome):',
    lists,
  ].join('\n')
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const strList = (v: unknown, cap = 30, max = 80) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').map((x) => x.trim().slice(0, max)).filter(Boolean).slice(0, cap) : undefined)
const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : undefined)
const bool = (v: unknown) => (typeof v === 'boolean' ? v : undefined)
const oneOf = <T extends string>(v: unknown, opts: readonly T[]): T | undefined => (typeof v === 'string' && (opts as readonly string[]).includes(v) ? (v as T) : undefined)
const strip = <T extends Record<string, any>>(o: T): T | undefined => {
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v
  return Object.keys(out).length ? (out as T) : undefined
}

/** Só chaves e valores válidos; ids de segmento/lista só os da org. */
export function normalizePatch(raw: any, ctx: TargetingContext): TargetingPatch {
  const segIds = new Set(ctx.segments.map((s) => s.id))
  const listIds = new Set(ctx.lists.map((s) => s.id))
  const r = raw || {}
  const patch: TargetingPatch = {}
  const d = r.display || {}
  patch.display = strip({ exitEnabled: bool(d.exitEnabled), timeEnabled: bool(d.timeEnabled), delay: num(d.delay, 0, 300), scrollEnabled: bool(d.scrollEnabled), scrollPercent: num(d.scrollPercent, 0, 100), pageViewEnabled: bool(d.pageViewEnabled), pageViewCount: num(d.pageViewCount, 1, 50), matchAll: bool(d.matchAll) })
  const v = r.visibility || {}
  patch.visibility = strip({ devices: oneOf(v.devices, ['all', 'desktop', 'mobile'] as const), visitorType: oneOf(v.visitorType, ['all', 'new', 'returning'] as const), hideFromSubscribers: bool(v.hideFromSubscribers) })
  const f = r.frequency || {}
  patch.frequency = strip({ showAfterDays: num(f.showAfterDays, 0, 365), stopAfterSubmission: bool(f.stopAfterSubmission) })
  const u = r.urls || {}
  patch.urls = strip({ includeEnabled: bool(u.includeEnabled), includeUrls: strList(u.includeUrls, 30, 200), excludeEnabled: bool(u.excludeEnabled), excludeUrls: strList(u.excludeUrls, 30, 200) })
  const l = r.location || {}
  // ISO-2 de verdade: 'usa' é recusado, não cortado para 'US'.
  const iso = (x: unknown) => strList(x, 30, 8)?.map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c))
  patch.location = strip({ includeEnabled: bool(l.includeEnabled), includeCountries: iso(l.includeCountries), excludeEnabled: bool(l.excludeEnabled), excludeCountries: iso(l.excludeCountries) })
  const p = r.page || {}
  const pageKeys = new Set(PAGE_TEMPLATES.map((t) => t.key as string))
  patch.page = strip({ enabled: bool(p.enabled), templates: strList(p.templates)?.filter((t) => pageKeys.has(t)), productHandles: strList(p.productHandles), productTypes: strList(p.productTypes), productVendors: strList(p.productVendors), productTags: strList(p.productTags), collectionHandles: strList(p.collectionHandles) })
  const t = r.traffic || {}
  const trafficKeys = new Set(TRAFFIC_TYPES.map((x) => x.key as string))
  patch.traffic = strip({ enabled: bool(t.enabled), types: strList(t.types)?.filter((x) => trafficKeys.has(x)) })
  const c = r.cart || {}
  const cc = c.contains || {}
  patch.cart = strip({ enabled: bool(c.enabled), minTotal: num(c.minTotal, 0, 1000000), maxTotal: num(c.maxTotal, 0, 1000000), minItems: num(c.minItems, 0, 100), contains: strip({ enabled: bool(cc.enabled), match: oneOf(cc.match, ['any', 'none'] as const), handles: strList(cc.handles), types: strList(cc.types), vendors: strList(cc.vendors) }) })
  const a = r.audienceTargeting || {}
  patch.audienceTargeting = strip({ mode: oneOf(a.mode, ['off', 'include', 'exclude'] as const), segmentIds: strList(a.segmentIds, 50)?.filter((id) => UUID_RE.test(id) && segIds.has(id)), listIds: strList(a.listIds, 50)?.filter((id) => UUID_RE.test(id) && listIds.has(id)) })
  const s = r.smartTrigger || {}
  patch.smartTrigger = strip({ enabled: bool(s.enabled), threshold: num(s.threshold, 20, 95), minDelaySec: num(s.minDelaySec, 5, 300) })
  const e = r.experiment || {}
  patch.experiment = strip({ holdoutPercent: num(e.holdoutPercent, 0, 50) })
  // Coerências que o modelo costuma esquecer.
  if (patch.page && !('enabled' in patch.page) && Object.keys(patch.page).length) patch.page.enabled = true
  if (patch.traffic?.types?.length && patch.traffic.enabled === undefined) patch.traffic.enabled = true
  if (patch.urls?.includeUrls?.length && patch.urls.includeEnabled === undefined) patch.urls.includeEnabled = true
  if (patch.urls?.excludeUrls?.length && patch.urls.excludeEnabled === undefined) patch.urls.excludeEnabled = true
  if (patch.location?.includeCountries?.length && patch.location.includeEnabled === undefined) patch.location.includeEnabled = true
  if (patch.location?.excludeCountries?.length && patch.location.excludeEnabled === undefined) patch.location.excludeEnabled = true
  if (patch.cart && (patch.cart.minTotal || patch.cart.maxTotal || patch.cart.minItems) && patch.cart.enabled === undefined) patch.cart.enabled = true
  if (patch.cart?.contains && (patch.cart.contains.handles?.length || patch.cart.contains.types?.length || patch.cart.contains.vendors?.length) && patch.cart.contains.enabled === undefined) patch.cart.contains.enabled = true
  if (patch.audienceTargeting && (patch.audienceTargeting.segmentIds?.length || patch.audienceTargeting.listIds?.length) && !patch.audienceTargeting.mode) patch.audienceTargeting.mode = 'include'
  if (patch.audienceTargeting?.mode && patch.audienceTargeting.mode !== 'off' && !patch.audienceTargeting.segmentIds?.length && !patch.audienceTargeting.listIds?.length) delete patch.audienceTargeting
  if (patch.display?.delay !== undefined && patch.display.timeEnabled === undefined) patch.display.timeEnabled = true
  if (patch.display?.scrollPercent !== undefined && patch.display.scrollEnabled === undefined) patch.display.scrollEnabled = true
  if (patch.display?.pageViewCount !== undefined && patch.display.pageViewEnabled === undefined) patch.display.pageViewEnabled = true
  for (const k of Object.keys(patch) as Array<keyof TargetingPatch>) if (!patch[k]) delete patch[k]
  return patch
}

export interface GenerateOptions {
  fetchImpl?: typeof fetch
  apiKey?: string
}

export async function generateTargeting(prompt: string, ctx: TargetingContext, opts: GenerateOptions = {}): Promise<{ ok: true; suggestion: TargetingSuggestion } | { ok: false; error: string }> {
  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { ok: false, error: 'A IA não está configurada neste ambiente (ANTHROPIC_API_KEY ausente).' }
  const f = opts.fetchImpl || fetch
  const text = prompt.trim().slice(0, 1500)
  if (!text) return { ok: false, error: 'Descreva quem deve ver o popup.' }
  try {
    const res = await f(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: [{ type: 'text', text: systemPrompt(ctx), cache_control: { type: 'ephemeral' } }],
        tools: [TOOL_DEF],
        tool_choice: { type: 'tool', name: 'set_popup_rules' },
        messages: [{ role: 'user', content: text }],
      }),
    })
    if (!res.ok) return { ok: false, error: `A IA não respondeu (${res.status}). Tente de novo.` }
    const data: any = await res.json()
    const toolUse = (data.content || []).find((b: any) => b.type === 'tool_use')
    if (!toolUse?.input) return { ok: false, error: 'A IA não devolveu regras. Tente reformular.' }
    const patch = normalizePatch(toolUse.input, ctx)
    const summary = (strList(toolUse.input.summary, 20, 160) || []).filter(Boolean)
    const unsupported = strList(toolUse.input.unsupported, 10, 160) || []
    if (!Object.keys(patch).length && !unsupported.length) return { ok: false, error: 'Não entendi nenhuma regra nesse pedido. Tente algo como "só no celular, depois de 8 segundos, para quem veio de anúncio".' }
    return { ok: true, suggestion: { patch, summary, unsupported } }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Falha ao consultar a IA.' }
  }
}
