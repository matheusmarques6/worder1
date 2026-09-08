// =============================================
// WORDER: Saved block versions
// /src/app/api/email/saved-blocks/[id]/versions/route.ts
//
// GET: lista versões anteriores
// POST { version }: restaura uma versão específica (cria nova versão snapshot antes)
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { propagateToTemplates, snapshotVersion } from '@/lib/email/universal-blocks'

export const dynamic = 'force-dynamic'
// Restaurar uma versão também leva o conteúdo para todos os e-mails.
export const maxDuration = 60

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthClient()
  if (!auth) return authError()

  const { data, error } = await supabaseAdmin
    .from('saved_block_versions')
    .select('id, version, block_json, comment, created_at, created_by')
    .eq('block_id', params.id)
    .eq('organization_id', auth.user.organization_id)
    .order('version', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ versions: data || [] })
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthClient()
  if (!auth) return authError()

  const orgId = auth.user.organization_id
  const { version } = await req.json()
  if (!version) {
    return NextResponse.json({ error: 'version is required' }, { status: 400 })
  }

  const { data: ver } = await supabaseAdmin
    .from('saved_block_versions')
    .select('block_json')
    .eq('block_id', params.id)
    .eq('organization_id', orgId)
    .eq('version', Number(version))
    .maybeSingle()

  if (!ver) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 })
  }

  // Voltar atrás também é uma alteração: o conteúdo que está no ar vira
  // versão antes de ser trocado, senão a restauração é que fica sem
  // desfazer.
  const { data: before } = await supabaseAdmin
    .from('saved_blocks')
    .select('block_json')
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (before?.block_json) await snapshotVersion(orgId, params.id, before.block_json, auth.user.id)

  const { data: updated, error } = await supabaseAdmin
    .from('saved_blocks')
    .update({
      block_json: ver.block_json,
    })
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // E restaurar sem levar para os e-mails não restaura nada: eles
  // continuariam com a versão que se quis desfazer.
  let propagated = 0
  try {
    propagated = await propagateToTemplates(orgId, params.id, updated as any)
  } catch (err) {
    console.error('[universal] falha ao propagar a versão restaurada', err)
  }

  return NextResponse.json({ block: updated, restored: version, propagated })
}
