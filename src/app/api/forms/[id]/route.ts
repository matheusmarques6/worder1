// =============================================
// CRM FORMS API - Single Form CRUD
// =============================================
import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

// GET - Obter formulário com campos e eventos
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()

    const { user } = auth
    const formId = params.id

    // Use the admin client (the list endpoint also does this) so RLS on
    // crm_forms can't silently strip fields like design_json on read.
    // Isolation enforced by the explicit organization_id filter below.
    const admin = getSupabaseAdmin()
    const { data: form, error } = await admin
      .from('crm_forms')
      .select(`
        *,
        fields:crm_form_fields(
          id, field_type, label, placeholder, description,
          required, position, options, validation,
          map_to_contact_field, conditional, created_at
        ),
        events:crm_form_events(
          id, name, event_name, trigger_type,
          send_to_facebook, send_to_google,
          event_value, event_currency,
          conditions, target_stage_id,
          is_active, position, created_at
        )
      `)
      .eq('id', formId)
      .eq('organization_id', user.organization_id)
      .single()

    if (error) {
      console.error('[Forms] Error fetching form:', error)
      return NextResponse.json({ error: 'Formulário não encontrado' }, { status: 404 })
    }

    console.log('[Forms] GET', formId, {
      design_json_keys: form.design_json ? Object.keys(form.design_json) : null,
      design_json_steps: form.design_json?.steps?.length,
    })

    // Sort fields and events by position
    if (form.fields) {
      form.fields.sort((a: any, b: any) => a.position - b.position)
    }
    if (form.events) {
      form.events.sort((a: any, b: any) => a.position - b.position)
    }
    if (form.pipeline?.stages) {
      form.pipeline.stages.sort((a: any, b: any) => a.position - b.position)
    }

    return NextResponse.json({ form })
  } catch (error: any) {
    console.error('[Forms] GET error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT - Atualizar formulário
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()

    const { user } = auth
    const formId = params.id
    const body = await request.json()

    const {
      name, description, status, pipeline_id, stage_id,
      theme, logo_url, success_message, redirect_url,
      facebook_pixel_id, google_ads_id, google_analytics_id,
      design_json, form_type, behavior, audience, tags, list_id, store_id,
    } = body

    const updates: Record<string, any> = { updated_at: new Date().toISOString() }

    if (name !== undefined) updates.name = name
    if (description !== undefined) updates.description = description
    if (status !== undefined) updates.status = status
    if (pipeline_id !== undefined) updates.pipeline_id = pipeline_id
    if (stage_id !== undefined) updates.stage_id = stage_id
    if (theme !== undefined) updates.theme = theme
    if (logo_url !== undefined) updates.logo_url = logo_url
    if (success_message !== undefined) updates.success_message = success_message
    if (redirect_url !== undefined) updates.redirect_url = redirect_url
    if (facebook_pixel_id !== undefined) updates.facebook_pixel_id = facebook_pixel_id
    if (google_ads_id !== undefined) updates.google_ads_id = google_ads_id
    if (google_analytics_id !== undefined) updates.google_analytics_id = google_analytics_id
    if (design_json !== undefined) updates.design_json = design_json
    if (form_type !== undefined) updates.form_type = form_type
    if (behavior !== undefined) updates.behavior = behavior
    if (audience !== undefined) updates.audience = audience
    if (tags !== undefined) updates.tags = tags
    if (list_id !== undefined) updates.list_id = list_id
    if (store_id !== undefined) updates.store_id = store_id

    // Same admin-client switch as POST/GET. RLS on crm_forms was silently
    // stripping the design_json column on writes; admin bypasses it.
    const admin = getSupabaseAdmin()
    const { data: form, error } = await admin
      .from('crm_forms')
      .update(updates)
      .eq('id', formId)
      .eq('organization_id', user.organization_id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ form })
  } catch (error: any) {
    console.error('[Forms] PUT error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE - Deletar formulário
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()

    const { user } = auth
    const formId = params.id

    const admin = getSupabaseAdmin()
    const { error } = await admin
      .from('crm_forms')
      .delete()
      .eq('id', formId)
      .eq('organization_id', user.organization_id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Forms] DELETE error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
