// =============================================
// CRM FORM EVENTS API - Event Rules CRUD
// =============================================
import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

// GET - Listar eventos do formulário
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()

    const { supabase, user } = auth
    const formId = params.id

    // Verify form ownership
    const { data: form } = await supabase
      .from('crm_forms')
      .select('id')
      .eq('id', formId)
      .eq('organization_id', user.organization_id)
      .single()

    if (!form) {
      return NextResponse.json({ error: 'Formulário não encontrado' }, { status: 404 })
    }

    const { data: events, error } = await supabase
      .from('crm_form_events')
      .select('*')
      .eq('form_id', formId)
      .order('position')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ events: events || [] })
  } catch (error: any) {
    console.error('[Form Events] GET error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Criar evento
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()

    const { supabase, user } = auth
    const formId = params.id
    const body = await request.json()

    // Verify form ownership
    const { data: form } = await supabase
      .from('crm_forms')
      .select('id')
      .eq('id', formId)
      .eq('organization_id', user.organization_id)
      .single()

    if (!form) {
      return NextResponse.json({ error: 'Formulário não encontrado' }, { status: 404 })
    }

    const { data: event, error } = await supabase
      .from('crm_form_events')
      .insert({
        form_id: formId,
        name: body.name,
        event_name: body.event_name,
        trigger_type: body.trigger_type || 'on_submit',
        send_to_facebook: body.send_to_facebook ?? false,
        send_to_google: body.send_to_google ?? false,
        event_value: body.event_value || null,
        event_currency: body.event_currency || 'BRL',
        conditions: body.conditions || [],
        target_stage_id: body.target_stage_id || null,
        is_active: true,
        position: body.position || 0,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ event }, { status: 201 })
  } catch (error: any) {
    console.error('[Form Events] POST error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT - Atualizar evento
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()

    const { supabase, user } = auth
    const formId = params.id
    const body = await request.json()

    if (!body.event_id) {
      return NextResponse.json({ error: 'event_id é obrigatório' }, { status: 400 })
    }

    // Verify form ownership
    const { data: form } = await supabase
      .from('crm_forms')
      .select('id')
      .eq('id', formId)
      .eq('organization_id', user.organization_id)
      .single()

    if (!form) {
      return NextResponse.json({ error: 'Formulário não encontrado' }, { status: 404 })
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    if (body.name !== undefined) updates.name = body.name
    if (body.event_name !== undefined) updates.event_name = body.event_name
    if (body.trigger_type !== undefined) updates.trigger_type = body.trigger_type
    if (body.send_to_facebook !== undefined) updates.send_to_facebook = body.send_to_facebook
    if (body.send_to_google !== undefined) updates.send_to_google = body.send_to_google
    if (body.event_value !== undefined) updates.event_value = body.event_value
    if (body.event_currency !== undefined) updates.event_currency = body.event_currency
    if (body.conditions !== undefined) updates.conditions = body.conditions
    if (body.target_stage_id !== undefined) updates.target_stage_id = body.target_stage_id
    if (body.is_active !== undefined) updates.is_active = body.is_active
    if (body.position !== undefined) updates.position = body.position

    const { data: event, error } = await supabase
      .from('crm_form_events')
      .update(updates)
      .eq('id', body.event_id)
      .eq('form_id', formId)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ event })
  } catch (error: any) {
    console.error('[Form Events] PUT error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE - Deletar evento
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()

    const { supabase, user } = auth
    const formId = params.id
    const { searchParams } = new URL(request.url)
    const eventId = searchParams.get('eventId')

    if (!eventId) {
      return NextResponse.json({ error: 'eventId é obrigatório' }, { status: 400 })
    }

    // Verify form ownership
    const { data: form } = await supabase
      .from('crm_forms')
      .select('id')
      .eq('id', formId)
      .eq('organization_id', user.organization_id)
      .single()

    if (!form) {
      return NextResponse.json({ error: 'Formulário não encontrado' }, { status: 404 })
    }

    const { error } = await supabase
      .from('crm_form_events')
      .delete()
      .eq('id', eventId)
      .eq('form_id', formId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Form Events] DELETE error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
