import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import { previewRestore, rollbackToVersion } from '@/lib/ai/versions'

export const dynamic = 'force-dynamic'

// Plano IA M4 passo 25 — restaurar cria uma versão NOVA com o conteúdo da
// antiga (a história não se reescreve). GET mostra "o que muda em relação a
// hoje" sem gravar; POST restaura.

export async function GET(_request: NextRequest, { params }: { params: { id: string; vid: string } }) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const preview = await previewRestore(getSupabaseAdmin(), params.id, auth.user.organization_id, params.vid)
  if (!preview) return NextResponse.json({ error: 'Versão não encontrada' }, { status: 404 })
  return NextResponse.json(preview)
}

export async function POST(_request: NextRequest, { params }: { params: { id: string; vid: string } }) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  try {
    const created = await rollbackToVersion(
      getSupabaseAdmin(), params.id, auth.user.organization_id, params.vid, auth.user.id,
    )
    return NextResponse.json({ version: created }, { status: 201 })
  } catch (e: any) {
    const status = e.message === 'Versão não encontrada' ? 404 : 500
    return NextResponse.json({ error: e.message }, { status })
  }
}
