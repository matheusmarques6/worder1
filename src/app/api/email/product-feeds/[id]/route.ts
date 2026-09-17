// =============================================================
// Um feed de produtos: ler, editar e apagar.
//
// Existe sobretudo para a lista de produtos excluídos poder mudar depois
// de o feed ser criado — sem isto, corrigir uma exclusão obrigaria a
// refazer o feed e a trocar o bloco em todos os e-mails que o usam.
// =============================================================

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { normalizeExcluded } from '@/lib/email/product-feed-config'
export const dynamic = 'force-dynamic'

async function loadFeed(orgId: string, id: string) {
  const { data } = await supabaseAdmin
    .from('product_feeds')
    .select('*')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle()
  return data
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthClient()
  if (!auth) return authError()
  const feed = await loadFeed(auth.user.organization_id, params.id)
  if (!feed) return NextResponse.json({ error: 'Feed não encontrado' }, { status: 404 })
  return NextResponse.json(feed)
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthClient()
  if (!auth) return authError()
  const orgId = auth.user.organization_id
  const body = await request.json().catch(() => ({}))

  const existing = await loadFeed(orgId, params.id)
  if (!existing) return NextResponse.json({ error: 'Feed não encontrado' }, { status: 404 })

  const updates: Record<string, any> = {}
  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
    updates.name = name
  }
  if (body.feed_type !== undefined) updates.feed_type = String(body.feed_type)
  if (body.fallback_type !== undefined) updates.fallback_type = String(body.fallback_type)
  if (body.time_period !== undefined) updates.time_period = String(body.time_period)
  if (Array.isArray(body.filters)) updates.filters = body.filters
  if (body.max_products !== undefined) updates.max_products = Number(body.max_products) || null
  if (body.columns !== undefined) updates.columns = Number(body.columns) || null
  // Lista completa, não incremento: a tela manda o estado final.
  if (body.excluded_product_ids !== undefined) updates.excluded_product_ids = normalizeExcluded(body.excluded_product_ids)

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 })
  }
  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from('product_feeds')
    .update(updates)
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .select()
    .single()

  if (error) {
    // Banco antigo sem a coluna de exclusões: salva o resto em vez de falhar tudo.
    if (error.code === '42703' || /column/i.test(error.message || '')) {
      delete updates.excluded_product_ids
      const { data: d2, error: e2 } = await supabaseAdmin
        .from('product_feeds').update(updates).eq('id', params.id).eq('organization_id', orgId).select().single()
      if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })
      return NextResponse.json({ ...d2, warning: 'Exclusões não foram salvas: rode a migração do banco.' })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthClient()
  if (!auth) return authError()
  const orgId = auth.user.organization_id
  const existing = await loadFeed(orgId, params.id)
  if (!existing) return NextResponse.json({ error: 'Feed não encontrado' }, { status: 404 })

  const { error } = await supabaseAdmin
    .from('product_feeds')
    .delete()
    .eq('id', params.id)
    .eq('organization_id', orgId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
