// Configurações → Variáveis → "Propriedades personalizadas".
// GET → definições de campos personalizados de contato + quantos contatos preenchem cada um.
// POST { label, type }  · PATCH { id, label } · DELETE { id }  (delega a /api/custom-fields)

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase-admin'
export const dynamic = 'force-dynamic'

const TYPE_LABEL: Record<string, string> = { text: 'Texto', number: 'Número', date: 'Data', boolean: 'Sim/Não', select: 'Lista', multiselect: 'Lista múltipla', url: 'URL', email: 'E-mail', phone: 'Telefone' }

export async function GET() {
  const auth = await getAuthClient()
  if (!auth) return authError()
  if (!isSupabaseConfigured()) return NextResponse.json({ properties: [] })
  const orgId = auth.user.organization_id
  try {
    const { data: defs } = await supabaseAdmin.from('custom_field_definitions').select('id, field_key, field_label, field_type, is_active, created_at').eq('organization_id', orgId).eq('entity_type', 'contact').order('position', { ascending: true })
    const props = await Promise.all((defs || []).map(async (d: any) => {
      const { count } = await supabaseAdmin.from('contacts').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).not(`custom_fields->>${d.field_key}`, 'is', null)
      return { id: d.id, key: d.field_key, label: d.field_label, type: d.field_type, type_label: TYPE_LABEL[d.field_type] || d.field_type, filled: count || 0, active: d.is_active !== false }
    }))
    // Chaves usadas em contatos mas sem definição (importadas) — aparecem como "detectadas".
    const { data: sample } = await supabaseAdmin.from('contacts').select('custom_fields').eq('organization_id', orgId).not('custom_fields', 'is', null).order('updated_at', { ascending: false }).limit(300)
    const known = new Set(props.map((p) => p.key))
    const detected = new Map<string, number>()
    for (const r of sample || []) for (const k of Object.keys(r.custom_fields || {})) if (!known.has(k)) detected.set(k, (detected.get(k) || 0) + 1)
    return NextResponse.json({ properties: props, detected: Array.from(detected.entries()).map(([key, n]) => ({ key, sample: n })).slice(0, 20) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return authError()
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'DB not configured' }, { status: 503 })
  const body = await request.json().catch(() => ({}))
  const label = String(body.label || '').trim()
  const type = String(body.type || 'text')
  if (label.length < 2) return NextResponse.json({ error: 'Dê um nome à propriedade.' }, { status: 400 })
  if (!TYPE_LABEL[type]) return NextResponse.json({ error: 'Tipo inválido.' }, { status: 400 })
  const key = (body.key ? String(body.key) : label).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  if (!key) return NextResponse.json({ error: 'Nome inválido.' }, { status: 400 })
  const orgId = auth.user.organization_id
  const { data: exists } = await supabaseAdmin.from('custom_field_definitions').select('id').eq('organization_id', orgId).eq('entity_type', 'contact').eq('field_key', key).maybeSingle()
  if (exists) return NextResponse.json({ error: `Já existe uma propriedade “${key}”.` }, { status: 409 })
  const { data: last } = await supabaseAdmin.from('custom_field_definitions').select('position').eq('organization_id', orgId).eq('entity_type', 'contact').order('position', { ascending: false }).limit(1).maybeSingle()
  const { data, error } = await supabaseAdmin.from('custom_field_definitions').insert({ organization_id: orgId, entity_type: 'contact', field_key: key, field_label: label, field_type: type, options: type.includes('select') && Array.isArray(body.options) ? body.options : null, is_required: false, position: ((last as any)?.position || 0) + 1, is_active: true }).select('id, field_key, field_label, field_type').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ property: { id: data.id, key: data.field_key, label: data.field_label, type: data.field_type, type_label: TYPE_LABEL[data.field_type], filled: 0, active: true } }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return authError()
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'DB not configured' }, { status: 503 })
  const body = await request.json().catch(() => ({}))
  if (!body.id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 })
  const upd: any = { updated_at: new Date().toISOString() }
  if (body.label !== undefined) { const l = String(body.label).trim(); if (l.length < 2) return NextResponse.json({ error: 'Nome inválido' }, { status: 400 }); upd.field_label = l }
  if (body.type !== undefined) { if (!TYPE_LABEL[String(body.type)]) return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 }); upd.field_type = body.type }
  const { error } = await supabaseAdmin.from('custom_field_definitions').update(upd).eq('id', body.id).eq('organization_id', auth.user.organization_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return authError()
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'DB not configured' }, { status: 503 })
  const body = await request.json().catch(() => ({}))
  const id = body.id || request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 })
  // Só a definição sai; os valores já gravados nos contatos ficam (auditoria).
  const { error } = await supabaseAdmin.from('custom_field_definitions').delete().eq('id', id).eq('organization_id', auth.user.organization_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
