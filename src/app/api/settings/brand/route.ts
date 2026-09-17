// Configurações → Marca (logo, cores, fontes, botões, rodapé).
// Guardado em brand_kits (1 por organização) e usado como padrão dos
// templates de e-mail, formulários e páginas.
//
// GET  → { brand }
// PUT  → { brand } salva
// POST → { action: 'import', url } lê logo/cores/fontes do site
//        { action: 'upload', slot: 'logo'|'logo_light'|'icon' } (multipart `file`)
//        { action: 'remove', slot }

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase-admin'
import { buildMediaUrl } from '@/lib/media/public-url'
export const dynamic = 'force-dynamic'

export interface Brand {
  name: string
  site: string
  logo_url: string | null
  logo_light_url: string | null
  icon_url: string | null
  colors: { primary: string; secondary: string; text: string; bg: string }
  fonts: { heading: string; body: string }
  radius: number
  footer: { address: string; instagram: string; tiktok: string; facebook: string; youtube: string }
  updated_at: string | null
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
const FONTS = ['Geist', 'Inter', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Verdana', 'Trebuchet MS', 'Roboto', 'Open Sans', 'Montserrat', 'Poppins', 'DM Sans', 'Lato']
const RADII = [0, 6, 12, 999]

function fromRow(row: any, orgName: string, site: string): Brand {
  const c = row?.colors || {}
  const f = row?.fonts || {}
  const ts = row?.text_styles || {}
  const ft = row?.footer || {}
  return {
    name: ts.name || orgName || '',
    site: ts.site || site || '',
    logo_url: row?.logo_url || null,
    logo_light_url: ts.logo_light_url || null,
    icon_url: ts.icon_url || null,
    colors: {
      primary: HEX.test(c.primary) ? c.primary : '#FE5A1D',
      secondary: HEX.test(c.secondary) ? c.secondary : '#FFB547',
      text: HEX.test(c.text) ? c.text : '#1A1A1A',
      bg: HEX.test(c.bg || c.background) ? (c.bg || c.background) : '#FFFFFF',
    },
    fonts: { heading: f.heading || 'Geist', body: f.body || f.heading || 'Geist' },
    radius: typeof row?.buttons?.radius === 'number' ? row.buttons.radius : 8,
    footer: { address: ft.address || '', instagram: ft.instagram || '', tiktok: ft.tiktok || '', facebook: ft.facebook || '', youtube: ft.youtube || '' },
    updated_at: row?.updated_at || null,
  }
}

async function load(orgId: string) {
  const [{ data: row }, { data: org }] = await Promise.all([
    supabaseAdmin.from('brand_kits').select('*').eq('organization_id', orgId).maybeSingle(),
    supabaseAdmin.from('organizations').select('name, company_name, address, city, state, settings').eq('id', orgId).single(),
  ])
  const s = (org?.settings || {}) as any
  const b = fromRow(row, org?.company_name || org?.name || '', s.website || '')
  if (!b.footer.address && org?.address) b.footer.address = [org.address, [org.city, org.state].filter(Boolean).join(', ')].filter(Boolean).join(' — ')
  return b
}

export async function GET() {
  const auth = await getAuthClient()
  if (!auth) return authError()
  if (!isSupabaseConfigured()) return NextResponse.json({ brand: fromRow(null, '', '') })
  try {
    return NextResponse.json({ brand: await load(auth.user.organization_id) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return authError()
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'DB not configured' }, { status: 503 })
  const orgId = auth.user.organization_id
  const body = await request.json().catch(() => ({}))
  const b = body?.brand || body || {}
  try {
    const colors: any = {}
    for (const k of ['primary', 'secondary', 'text', 'bg'] as const) {
      const v = String(b.colors?.[k] || '').trim()
      if (!HEX.test(v)) return NextResponse.json({ error: `Cor ${k} inválida. Use o formato #RRGGBB.` }, { status: 400 })
      colors[k] = v.toUpperCase()
    }
    const heading = String(b.fonts?.heading || 'Geist')
    const bodyFont = String(b.fonts?.body || heading)
    if (!FONTS.includes(heading) || !FONTS.includes(bodyFont)) return NextResponse.json({ error: 'Fonte não suportada.' }, { status: 400 })
    const radius = Number(b.radius)
    if (!RADII.includes(radius)) return NextResponse.json({ error: 'Canto de botão inválido.' }, { status: 400 })
    const name = String(b.name || '').trim().slice(0, 80)
    if (name.length < 1) return NextResponse.json({ error: 'Informe o nome da marca.' }, { status: 400 })
    const footer = {
      address: String(b.footer?.address || '').trim().slice(0, 200),
      instagram: cleanHandle(b.footer?.instagram),
      tiktok: cleanHandle(b.footer?.tiktok),
      facebook: cleanHandle(b.footer?.facebook),
      youtube: cleanHandle(b.footer?.youtube),
    }
    const { data: cur } = await supabaseAdmin.from('brand_kits').select('text_styles, logo_url').eq('organization_id', orgId).maybeSingle()
    const text_styles = { ...(cur?.text_styles || {}), name, site: String(b.site || '').trim().slice(0, 200) }
    const { error } = await supabaseAdmin.from('brand_kits').upsert({
      organization_id: orgId,
      logo_url: b.logo_url === undefined ? cur?.logo_url || null : b.logo_url || null,
      colors, fonts: { heading, body: bodyFont }, buttons: { radius }, footer, text_styles,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id' })
    if (error) throw error
    return NextResponse.json({ brand: await load(orgId) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return authError()
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'DB not configured' }, { status: 503 })
  const orgId = auth.user.organization_id
  const ct = request.headers.get('content-type') || ''
  try {
    if (ct.includes('multipart/form-data')) {
      const fd = await request.formData()
      const file = fd.get('file') as File | null
      const slot = String(fd.get('slot') || 'logo')
      if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })
      if (!['image/png', 'image/svg+xml', 'image/jpeg', 'image/webp'].includes(file.type)) return NextResponse.json({ error: 'Use PNG, SVG, JPG ou WebP.' }, { status: 400 })
      if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'Arquivo muito grande. Máximo 5MB.' }, { status: 400 })
      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const path = `${orgId}/brand/${slot}-${Date.now()}.${ext}`
      const { error } = await supabaseAdmin.storage.from('email-images').upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false, cacheControl: '31536000, immutable' })
      if (error) throw error
      const { data: pub } = supabaseAdmin.storage.from('email-images').getPublicUrl(path)
      const url = (file.type === 'image/svg+xml' ? null : buildMediaUrl(path)) || pub.publicUrl
      await setSlot(orgId, slot, url)
      return NextResponse.json({ url, brand: await load(orgId) })
    }

    const body = await request.json().catch(() => ({}))
    if (body.action === 'remove') {
      await setSlot(orgId, String(body.slot || 'logo'), null)
      return NextResponse.json({ brand: await load(orgId) })
    }
    if (body.action === 'import') {
      let url = String(body.url || '').trim()
      if (!url) {
        const { data: org } = await supabaseAdmin.from('organizations').select('settings').eq('id', orgId).single()
        url = (org?.settings as any)?.website || ''
      }
      if (!url) return NextResponse.json({ error: 'Informe o site da marca (ou cadastre em Organização → Site).' }, { status: 400 })
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`
      const found = await importFromSite(url)
      return NextResponse.json({ suggestion: found })
    }
    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

async function setSlot(orgId: string, slot: string, url: string | null) {
  const { data: cur } = await supabaseAdmin.from('brand_kits').select('text_styles').eq('organization_id', orgId).maybeSingle()
  const ts = { ...(cur?.text_styles || {}) }
  const patch: any = { organization_id: orgId, updated_at: new Date().toISOString() }
  if (slot === 'logo') patch.logo_url = url
  else if (slot === 'logo_light') { ts.logo_light_url = url; patch.text_styles = ts }
  else if (slot === 'icon') { ts.icon_url = url; patch.text_styles = ts }
  else throw new Error('slot inválido')
  const { error } = await supabaseAdmin.from('brand_kits').upsert(patch, { onConflict: 'organization_id' })
  if (error) throw error
}

function cleanHandle(v: any): string {
  return String(v || '').trim().replace(/^https?:\/\/(www\.)?/i, '').slice(0, 120)
}

/** Lê o HTML do site e sugere logo, ícone, cores e fontes. */
async function importFromSite(url: string) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 8000)
  let html = ''
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WorderBrandBot/1.0)' }, redirect: 'follow' })
    if (!res.ok) throw new Error(`O site respondeu ${res.status}.`)
    html = (await res.text()).slice(0, 600_000)
  } catch (e: any) {
    throw new Error(e.name === 'AbortError' ? 'O site demorou a responder.' : `Não foi possível ler o site: ${e.message}`)
  } finally { clearTimeout(t) }
  const abs = (u: string) => { try { return new URL(u, url).toString() } catch { return null } }
  const attr = (tag: string, name: string) => { const m = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i')); return m ? m[1] : null }
  const tags = (re: RegExp) => Array.from(html.matchAll(re)).map((m) => m[0])

  const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || '').trim()
  const siteName = html.match(/property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i)?.[1] || html.match(/content=["']([^"']+)["'][^>]*property=["']og:site_name["']/i)?.[1] || ''
  const name = (siteName || title.split(/[|–—-]/)[0]).trim().slice(0, 80)

  let logo: string | null = null
  for (const tg of tags(/<img[^>]+>/gi)) {
    const src = attr(tg, 'src') || attr(tg, 'data-src')
    const hint = `${attr(tg, 'class') || ''} ${attr(tg, 'alt') || ''} ${attr(tg, 'id') || ''} ${src || ''}`.toLowerCase()
    if (src && /logo/.test(hint)) { logo = abs(src); break }
  }
  if (!logo) {
    const og = html.match(/property=["']og:logo["'][^>]*content=["']([^"']+)["']/i)?.[1]
    if (og) logo = abs(og)
  }
  let icon: string | null = null
  for (const tg of tags(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*>/gi)) {
    const href = attr(tg, 'href')
    if (href) { icon = abs(href); if (/apple-touch|192|512/.test(tg)) break }
  }
  if (!icon) icon = abs('/favicon.ico')

  const themeColor = html.match(/name=["']theme-color["'][^>]*content=["'](#[0-9a-f]{3,8})["']/i)?.[1] || null
  const counts = new Map<string, number>()
  for (const m of html.matchAll(/#([0-9a-f]{6})\b/gi)) {
    const h = `#${m[1].toUpperCase()}`
    if (/^#(FFFFFF|000000|F{6}|0{6})$/i.test(h)) continue
    const [r, g, b] = [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)]
    const sat = Math.max(r, g, b) - Math.min(r, g, b)
    if (sat < 40) continue // cinzas não são cor de marca
    counts.set(h, (counts.get(h) || 0) + 1)
  }
  const ranked = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([h]) => h)
  const primary = (themeColor && themeColor.length === 7 ? themeColor.toUpperCase() : null) || ranked[0] || null
  const secondary = ranked.find((h) => h !== primary) || null

  const fonts: string[] = []
  for (const m of html.matchAll(/fonts\.googleapis\.com\/css2?\?[^"']*family=([^"'&:]+)/gi)) {
    const f = decodeURIComponent(m[1]).replace(/\+/g, ' ').split('|')[0].trim()
    if (f && !fonts.includes(f)) fonts.push(f)
  }
  const heading = fonts.find((f) => FONTS.includes(f)) || null

  return { name: name || null, logo_url: logo, icon_url: icon, primary, secondary, fonts, heading, palette: ranked.slice(0, 6) }
}
