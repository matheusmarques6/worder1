// =============================================
// PUT /api/forms/[id]/fields
//
// Os campos do formulário, salvos de uma vez: o que sumiu da lista é
// apagado, o que é novo entra e o resto é atualizado.
//
// Duas coisas aqui merecem atenção. A primeira: os ids vêm do cliente e
// iam direto para dentro de um filtro `not.in.(…)`. Um id com parênteses
// ou vírgula não é um id — é uma alteração da consulta. Agora só passa
// UUID de verdade.
//
// A segunda: a rota apagava, atualizava e respondia "pronto" sem olhar
// se alguma dessas escritas falhou. Como ela relê os campos no fim, o
// lojista via a lista antiga voltar sem nenhuma explicação, e concluía
// que o salvamento "não pegou". Agora cada escrita é conferida e o erro
// aparece.
// =============================================
import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()

    const { supabase, user } = auth
    const formId = params.id
    const { fields } = await request.json()

    if (!Array.isArray(fields)) {
      return NextResponse.json({ error: 'fields deve ser um array' }, { status: 400 })
    }

    // O formulário é desta organização?
    const { data: form } = await supabase
      .from('crm_forms')
      .select('id')
      .eq('id', formId)
      .eq('organization_id', user.organization_id)
      .single()

    if (!form) {
      return NextResponse.json({ error: 'Formulário não encontrado' }, { status: 404 })
    }

    // Campo com id já existe; o resto é novo. Um id que não é UUID não é
    // "novo com nome esquisito" — é entrada inválida, e a rota diz isso.
    const comId = fields.filter((f: any) => f?.id && !String(f.id).startsWith('new-'))
    const idsInvalidos = comId.filter((f: any) => !UUID_RE.test(String(f.id)))
    if (idsInvalidos.length > 0) {
      return NextResponse.json({ error: 'Campo com identificador inválido' }, { status: 400 })
    }
    const existingIds: string[] = comId.map((f: any) => String(f.id))

    // Some o que saiu da lista. Sempre dentro deste formulário.
    let del = supabase.from('crm_form_fields').delete().eq('form_id', formId)
    if (existingIds.length > 0) del = del.not('id', 'in', `(${existingIds.join(',')})`)
    const { error: deleteError } = await del
    if (deleteError) {
      console.error('[Form Fields] delete error:', deleteError)
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    const normalized = fields.map((f: any, index: number) => {
      const field: any = {
        form_id: formId,
        field_type: f.field_type,
        label: f.label,
        placeholder: f.placeholder || null,
        description: f.description || null,
        required: f.required || false,
        position: index,
        options: f.options || [],
        validation: f.validation || {},
        map_to_contact_field: f.map_to_contact_field || null,
        conditional: f.conditional || null,
      }
      if (f?.id && !String(f.id).startsWith('new-')) field.id = String(f.id)
      return field
    })

    const novos = normalized.filter((f: any) => !f.id)
    const existentes = normalized.filter((f: any) => f.id)

    if (novos.length > 0) {
      const { error: insertError } = await supabase.from('crm_form_fields').insert(novos)
      if (insertError) {
        console.error('[Form Fields] insert error:', insertError)
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }
    }

    for (const field of existentes) {
      const { id, ...updates } = field
      // O `form_id` no filtro é de propósito: mesmo com o RLS de pé, um id
      // de outro formulário nunca deve chegar a uma atualização por id só.
      const { error: updateError } = await supabase
        .from('crm_form_fields')
        .update(updates)
        .eq('id', id)
        .eq('form_id', formId)
      if (updateError) {
        console.error('[Form Fields] update error:', updateError)
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }
    }

    const { data: updatedFields, error: readError } = await supabase
      .from('crm_form_fields')
      .select('*')
      .eq('form_id', formId)
      .order('position')

    if (readError) {
      console.error('[Form Fields] read-back error:', readError)
      return NextResponse.json({ error: readError.message }, { status: 500 })
    }

    return NextResponse.json({ fields: updatedFields || [] })
  } catch (error: any) {
    console.error('[Form Fields] PUT error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
