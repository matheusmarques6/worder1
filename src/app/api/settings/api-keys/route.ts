// Configurações → Chaves de API.
// GET    → chaves (mascaradas, permissões, criador, último uso)
// POST   → { name, permissions[] } cria → devolve a chave UMA vez
//          { id, regenerate: true } gera uma chave nova para o mesmo registro
// PATCH  → { id, name?, permissions? }
// DELETE → { id } revoga

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase-admin'
import { canRoleAccess } from '@/lib/auth/permissions'
import { API_KEY_PERMISSIONS, generateApiKey, maskApiKey, RATE_LIMIT_PER_MINUTE, BULK_IMPORT_LIMIT } from '@/lib/auth/api-key'
export const dynamic = 'force-dynamic'

const VALID = API_KEY_PERMISSIONS.map((p) => p.key) as string[]

function cleanPerms(v: any): string[] | null {
  if (!Array.isArray(v)) return null
  const out = Array.from(new Set(v.map(String).filter((p) => VALID.includes(p))))
  return out.length ? out : null
}

export async function GET(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return authError()
  if (!isSupabaseConfigured()) return NextResponse.json({ keys: [] })
  const orgId = auth.user.organization_id
  try {
    const { data } = await supabaseAdmin.from('api_keys')
      .select('id, name, key_prefix, key_hash, key, permissions, created_at, last_used_at, expires_at, is_active, created_by, user_id, creator:user_id(full_name, first_name, email)')
      .eq('organization_id', orgId).neq('is_active', false).order('created_at', { ascending: false })
    const base = (process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/$/, '')
    return NextResponse.json({
      keys: (data || []).map((k: any) => {
        const c = Array.isArray(k.creator) ? k.creator[0] : k.creator
        return {
          id: k.id, name: k.name, masked: maskApiKey(k.key_prefix, k.key_hash, k.key), permissions: k.permissions || [],
          created_at: k.created_at, last_used_at: k.last_used_at, expires_at: k.expires_at,
          created_by: c?.full_name || c?.first_name || c?.email || null, legacy: !k.key_hash,
        }
      }),
      permissions: API_KEY_PERMISSIONS,
      limits: { per_minute: RATE_LIMIT_PER_MINUTE, bulk_import: BULK_IMPORT_LIMIT },
      base_url: `${base}/api/v1`,
      can_manage: canRoleAccess(auth.user.role, 'org:api_keys:manage'),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return authError()
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'DB not configured' }, { status: 503 })
  if (!canRoleAccess(auth.user.role, 'org:api_keys:manage')) return NextResponse.json({ error: 'Só administradores gerenciam chaves de API.' }, { status: 403 })
  const orgId = auth.user.organization_id
  const body = await request.json().catch(() => ({}))
  try {
    if (body.id && body.regenerate) {
      const { data: cur } = await supabaseAdmin.from('api_keys').select('id').eq('id', body.id).eq('organization_id', orgId).maybeSingle()
      if (!cur) return NextResponse.json({ error: 'Chave não encontrada' }, { status: 404 })
      const k = generateApiKey()
      const { error } = await supabaseAdmin.from('api_keys').update({ key_hash: k.hash, key_prefix: k.prefix, key: null, is_active: true }).eq('id', body.id)
      if (error) throw error
      await audit(orgId, auth.user.id, auth.user.email, 'api_key.regenerated', { id: body.id })
      return NextResponse.json({ id: body.id, api_key: k.raw })
    }
    const name = String(body.name || '').trim().slice(0, 80)
    if (name.length < 2) return NextResponse.json({ error: 'Dê um nome para a chave (ex.: Integração ERP).' }, { status: 400 })
    const permissions = cleanPerms(body.permissions)
    if (!permissions) return NextResponse.json({ error: 'Escolha pelo menos uma permissão.' }, { status: 400 })
    const k = generateApiKey()
    const { data, error } = await supabaseAdmin.from('api_keys').insert({ organization_id: orgId, name, key_hash: k.hash, key_prefix: k.prefix, permissions, user_id: auth.user.id, created_by: auth.user.id, is_active: true }).select('id, name, created_at').single()
    if (error) throw error
    await audit(orgId, auth.user.id, auth.user.email, 'api_key.created', { id: data.id, name, permissions })
    return NextResponse.json({ ...data, api_key: k.raw })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return authError()
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'DB not configured' }, { status: 503 })
  if (!canRoleAccess(auth.user.role, 'org:api_keys:manage')) return NextResponse.json({ error: 'Só administradores gerenciam chaves de API.' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  const upd: any = {}
  if (body.name !== undefined) { const n = String(body.name).trim().slice(0, 80); if (n.length < 2) return NextResponse.json({ error: 'Nome inválido' }, { status: 400 }); upd.name = n }
  if (body.permissions !== undefined) { const p = cleanPerms(body.permissions); if (!p) return NextResponse.json({ error: 'Escolha pelo menos uma permissão.' }, { status: 400 }); upd.permissions = p }
  if (!body.id || !Object.keys(upd).length) return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 })
  const { error } = await supabaseAdmin.from('api_keys').update(upd).eq('id', body.id).eq('organization_id', auth.user.organization_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return authError()
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'DB not configured' }, { status: 503 })
  if (!canRoleAccess(auth.user.role, 'org:api_keys:manage')) return NextResponse.json({ error: 'Só administradores gerenciam chaves de API.' }, { status: 403 })
  const orgId = auth.user.organization_id
  const body = await request.json().catch(() => ({}))
  const id = body.id || request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 })
  try {
    const { error } = await supabaseAdmin.from('api_keys').delete().eq('id', id).eq('organization_id', orgId)
    if (error) throw error
    await audit(orgId, auth.user.id, auth.user.email, 'api_key.revoked', { id })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

async function audit(orgId: string, userId: string, email: string, action: string, details: any) {
  try { await supabaseAdmin.from('audit_logs').insert({ organization_id: orgId, user_id: userId, user_email: email, action, details }) } catch { /* ignore */ }
}
