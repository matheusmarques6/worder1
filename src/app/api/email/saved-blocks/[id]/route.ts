import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { inlineIntoTemplates, loadUsage, savedKind, stripLinks } from '@/lib/email/universal-blocks'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()

    const { data, error } = await supabaseAdmin
      .from('saved_blocks')
      .select('*')
      .eq('id', params.id)
      .eq('organization_id', auth.user.organization_id)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 404 })

    // ?withUsage=1 — o cabeçalho do editor mostra "usado em N e-mails"
    // antes de a pessoa começar a mexer.
    if (request.nextUrl.searchParams.get('withUsage') === '1') {
      const usage = await loadUsage(auth.user.organization_id, params.id)
      return NextResponse.json({ block: data, kind: savedKind(data), usage })
    }
    return NextResponse.json({ block: data, kind: savedKind(data) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()
    const body = await request.json()

    const updateData: Record<string, any> = {}
    if (body.name !== undefined) {
      const name = String(body.name).trim()
      if (!name) return NextResponse.json({ error: 'O nome não pode ficar vazio' }, { status: 400 })
      updateData.name = name
    }
    if (body.category !== undefined) updateData.category = body.category
    // O vínculo nunca volta para dentro do corpo guardado.
    if (body.block_json !== undefined) updateData.block_json = stripLinks(body.block_json)

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('saved_blocks')
      .update(updateData)
      .eq('id', params.id)
      .eq('organization_id', auth.user.organization_id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Quem salvou quer saber onde a alteração chegou.
    const usage = body.block_json !== undefined
      ? await loadUsage(auth.user.organization_id, params.id)
      : null
    return NextResponse.json({ block: data, ...(usage ? { usage } : {}) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()
    const orgId = auth.user.organization_id

    const { data: row } = await supabaseAdmin
      .from('saved_blocks')
      .select('*')
      .eq('id', params.id)
      .eq('organization_id', orgId)
      .maybeSingle()
    if (!row) return NextResponse.json({ error: 'Conteúdo universal não encontrado' }, { status: 404 })

    // Antes de sumir da biblioteca, o conteúdo é escrito por extenso em
    // cada e-mail que o usava. Eles continuam exatamente como estão; só
    // param de receber as próximas alterações. Sem isso, apagar um
    // rodapé deixaria vinte e-mails com um buraco.
    const inlined = await inlineIntoTemplates(orgId, params.id, row as any)

    const { error } = await supabaseAdmin
      .from('saved_blocks')
      .delete()
      .eq('id', params.id)
      .eq('organization_id', orgId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, inlined })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
