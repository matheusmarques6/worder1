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

export const dynamic = 'force-dynamic'

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

  const { version } = await req.json()
  if (!version) {
    return NextResponse.json({ error: 'version is required' }, { status: 400 })
  }

  const { data: ver } = await supabaseAdmin
    .from('saved_block_versions')
    .select('block_json')
    .eq('block_id', params.id)
    .eq('organization_id', auth.user.organization_id)
    .eq('version', Number(version))
    .maybeSingle()

  if (!ver) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 })
  }

  // Trigger bump_saved_block_version cuida de snapshot automaticamente no UPDATE
  const { data: updated, error } = await supabaseAdmin
    .from('saved_blocks')
    .update({
      block_json: ver.block_json,
    })
    .eq('id', params.id)
    .eq('organization_id', auth.user.organization_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ block: updated, restored: version })
}
