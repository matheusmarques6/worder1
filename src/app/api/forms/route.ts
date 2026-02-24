// =============================================
// CRM FORMS API - CRUD
// =============================================
import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

// GET - Listar formulários
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()

    const { supabase, user } = auth
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    let query = supabase
      .from('crm_forms')
      .select(`
        id, name, slug, description, status,
        submissions_count, views_count,
        pipeline_id, stage_id,
        facebook_pixel_id, google_ads_id,
        theme, logo_url,
        created_at, updated_at,
        pipeline:pipelines(id, name, color),
        fields:crm_form_fields(count),
        events:crm_form_events(count)
      `)
      .eq('organization_id', user.organization_id)
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    const { data: forms, error } = await query

    if (error) {
      console.error('[Forms] Error fetching:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ forms: forms || [] })
  } catch (error: any) {
    console.error('[Forms] GET error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Criar formulário
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()

    const { supabase, user } = auth
    const body = await request.json()
    const { name, description, pipeline_id, stage_id, theme } = body

    if (!name) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
    }

    // Gerar slug único
    const baseSlug = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')

    const slug = `${baseSlug}-${Date.now().toString(36)}`

    // Criar formulário
    const { data: form, error } = await supabase
      .from('crm_forms')
      .insert({
        organization_id: user.organization_id,
        name,
        slug,
        description: description || null,
        pipeline_id: pipeline_id || null,
        stage_id: stage_id || null,
        theme: theme || undefined,
        status: 'draft',
      })
      .select()
      .single()

    if (error) {
      console.error('[Forms] Error creating:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Criar campos padrão
    const defaultFields = [
      { field_type: 'text', label: 'Nome completo', placeholder: 'Seu nome', required: true, position: 0, map_to_contact_field: 'name' },
      { field_type: 'email', label: 'E-mail', placeholder: 'seu@email.com', required: true, position: 1, map_to_contact_field: 'email' },
      { field_type: 'phone', label: 'Telefone', placeholder: '(11) 99999-9999', required: true, position: 2, map_to_contact_field: 'phone' },
    ]

    await supabase
      .from('crm_form_fields')
      .insert(defaultFields.map(f => ({ ...f, form_id: form.id })))

    // Criar evento padrão de Lead
    await supabase
      .from('crm_form_events')
      .insert({
        form_id: form.id,
        name: 'Lead',
        event_name: 'Lead',
        trigger_type: 'on_submit',
        send_to_facebook: true,
        send_to_google: true,
        is_active: true,
        position: 0,
      })

    return NextResponse.json({ form }, { status: 201 })
  } catch (error: any) {
    console.error('[Forms] POST error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
