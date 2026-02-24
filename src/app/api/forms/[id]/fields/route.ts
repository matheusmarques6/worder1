// =============================================
// CRM FORM FIELDS API
// =============================================
import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

// PUT - Atualizar campos (bulk upsert)
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

    // Verificar que o form pertence ao user
    const { data: form } = await supabase
      .from('crm_forms')
      .select('id')
      .eq('id', formId)
      .eq('organization_id', user.organization_id)
      .single()

    if (!form) {
      return NextResponse.json({ error: 'Formulário não encontrado' }, { status: 404 })
    }

    // Deletar campos existentes que não estão na lista
    const existingIds = fields.filter((f: any) => f.id && !f.id.startsWith('new-')).map((f: any) => f.id)

    if (existingIds.length > 0) {
      await supabase
        .from('crm_form_fields')
        .delete()
        .eq('form_id', formId)
        .not('id', 'in', `(${existingIds.join(',')})`)
    } else {
      await supabase
        .from('crm_form_fields')
        .delete()
        .eq('form_id', formId)
    }

    // Upsert campos
    const fieldsToUpsert = fields.map((f: any, index: number) => ({
      id: f.id && !f.id.startsWith('new-') ? f.id : undefined,
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
    }))

    // Insert new fields (without id)
    const newFields = fieldsToUpsert.filter((f: any) => !f.id)
    const existingFields = fieldsToUpsert.filter((f: any) => f.id)

    if (newFields.length > 0) {
      const { error: insertError } = await supabase
        .from('crm_form_fields')
        .insert(newFields)

      if (insertError) {
        console.error('[Form Fields] Insert error:', insertError)
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }
    }

    // Update existing fields
    for (const field of existingFields) {
      const { id, ...updates } = field
      await supabase
        .from('crm_form_fields')
        .update(updates)
        .eq('id', id)
    }

    // Fetch updated fields
    const { data: updatedFields } = await supabase
      .from('crm_form_fields')
      .select('*')
      .eq('form_id', formId)
      .order('position')

    return NextResponse.json({ fields: updatedFields || [] })
  } catch (error: any) {
    console.error('[Form Fields] PUT error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
