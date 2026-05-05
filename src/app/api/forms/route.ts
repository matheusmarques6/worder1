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
    const storeId = searchParams.get('storeId') || searchParams.get('store_id')

    let query = supabase
      .from('crm_forms')
      .select(`
        id, name, slug, description, status,
        submissions_count, views_count,
        pipeline_id, stage_id, store_id,
        facebook_pixel_id, google_ads_id,
        theme, logo_url,
        created_at, updated_at,
        pipeline:pipelines(id, name, color),
        fields:crm_form_fields(count),
        events:crm_form_events(count)
      `)
      .eq('organization_id', user.organization_id)
      .order('created_at', { ascending: false })

    // Filter by store. Also include orphan forms (store_id IS NULL) so a
    // popup created before currentStore was hydrated (race during page load)
    // doesn't disappear from the dashboard. The popup-editor's save will
    // auto-attach it to the current store on the next save.
    if (storeId) {
      query = query.or(`store_id.eq.${storeId},store_id.is.null`)
    }

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
    const { name, description, pipeline_id, stage_id, theme, store_id, form_type, design_json, behavior, audience, tags, list_id } = body

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

    // Default theme completo
    const defaultTheme = {
      primaryColor: '#6366f1',
      backgroundColor: '#ffffff',
      textColor: '#1f2937',
      borderRadius: 12,
      fontFamily: 'Inter',
      fontSize: 14,
      hideLabels: false,
      hideTitle: false,
      inputBackgroundColor: '#ffffff',
      inputBorderColor: '#e5e7eb',
      inputHeight: 44,
      headline: '',
      subheadline: '',
      buttonText: 'Enviar',
    }

    // Criar formulário
    const { data: form, error } = await supabase
      .from('crm_forms')
      .insert({
        organization_id: user.organization_id,
        store_id: store_id || null,
        name,
        slug,
        description: description || null,
        pipeline_id: pipeline_id || null,
        stage_id: stage_id || null,
        theme: theme ? { ...defaultTheme, ...theme } : defaultTheme,
        form_type: form_type || 'embed',
        design_json: design_json || {},
        behavior: behavior || {},
        audience: audience || {},
        tags: tags || [],
        list_id: list_id || null,
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
