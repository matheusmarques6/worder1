import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { usageCounts, savedKind, stripLinks } from '@/lib/email/universal-blocks'

export const dynamic = 'force-dynamic'
// Salvar um universal reescreve o design e o html de cada e-mail que o
// usa — vinte e três, no caso do rodapé maior desta base. É trabalho
// demais para o teto padrão de dez segundos.
export const maxDuration = 60

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()
    const orgId = auth.user.organization_id

    const { data, error } = await supabaseAdmin
      .from('saved_blocks')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // ?withUsage=1 — a biblioteca mostra "em N e-mails" em cada item.
    // Numa consulta só: uma por item seria uma requisição por linha.
    const blocks = data || []
    if (request.nextUrl.searchParams.get('withUsage') === '1') {
      const counts = await usageCounts(orgId)
      return NextResponse.json({
        blocks: blocks.map((b: any) => ({ ...b, usage_count: counts[b.id] || 0 })),
      })
    }
    return NextResponse.json({ blocks })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()
    const orgId = auth.user.organization_id

    const body = await request.json()
    if (!body.name || !body.block_json) {
      return NextResponse.json({ error: 'name and block_json are required' }, { status: 400 })
    }
    const name = String(body.name).trim()
    if (!name) return NextResponse.json({ error: 'Dê um nome ao conteúdo universal' }, { status: 400 })

    // O vínculo nunca entra no corpo guardado: um universal que aponta
    // para si mesmo re-hidrata em loop.
    const blockJson = stripLinks(body.block_json)
    const category = body.category || (blockJson?._kind === 'section' ? 'section' : 'custom')

    // Guarda contra duplicata. O botão de salvar já gerou cinco linhas
    // "Etapas de envio" em quinze segundos — e o pior não é a sujeira na
    // lista, é que cada e-mail fica preso a uma cópia diferente, então
    // editar uma delas atualiza só parte dos e-mails.
    const { data: twin } = await supabaseAdmin
      .from('saved_blocks')
      .select('id, name, category, block_json, created_at')
      .eq('organization_id', orgId)
      .eq('name', name)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (twin) {
      const sameBody = JSON.stringify(twin.block_json) === JSON.stringify(blockJson)
      const age = Date.now() - new Date(twin.created_at as string).getTime()
      // Mesmo nome e mesmo conteúdo: é o mesmo salvamento chegando duas
      // vezes (clique duplo, reenvio). Devolve o que já existe.
      if (sameBody) {
        return NextResponse.json({ block: twin, deduped: true }, { status: 200 })
      }
      // Mesmo nome, conteúdo diferente, salvo agora há pouco: também é
      // repetição — a segunda gravação é a boa.
      if (age < 15_000) {
        const { data: updated } = await supabaseAdmin
          .from('saved_blocks')
          .update({ block_json: blockJson, category })
          .eq('id', twin.id)
          .eq('organization_id', orgId)
          .select()
          .single()
        if (updated) return NextResponse.json({ block: updated, deduped: true }, { status: 200 })
      }
      // Mesmo nome, conteúdo diferente, de outro dia: são coisas
      // distintas com o mesmo nome. Deixa criar, mas avisa — é assim
      // que "Rodapé preto" e "rodape preto" viraram dois.
      const { data, error } = await supabaseAdmin
        .from('saved_blocks')
        .insert({ organization_id: orgId, name, category, block_json: blockJson })
        .select()
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(
        { block: data, warning: `Já existe outro universal chamado "${name}".` },
        { status: 201 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from('saved_blocks')
      .insert({ organization_id: orgId, name, category, block_json: blockJson })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ block: data, kind: savedKind(data) }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
