// =============================================
// CRM FORMS API - CRUD
// =============================================
import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

// GET - Listar formulários
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()

    const { user } = auth
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const storeId = searchParams.get('storeId') || searchParams.get('store_id')

    const admin = getSupabaseAdmin()
    const baseSelect = `
      id, name, slug, description, status,
      submissions_count, views_count,
      pipeline_id, stage_id, store_id,
      facebook_pixel_id, google_ads_id,
      theme, logo_url,
      created_at, updated_at,
      pipeline:pipelines(id, name, color),
      fields:crm_form_fields(count),
      events:crm_form_events(count)
    `

    let forms: any[] = []
    let error: any = null

    if (storeId) {
      // Two explicit queries (store_id = X) UNION (store_id IS NULL).
      // .or() chained after .eq() with foreign-key joins was silently
      // returning empty results in production for some rows even when the
      // data was clearly there. Splitting avoids relying on the OR-with-
      // joins quirk and the result is identical, just deduped + sorted in
      // memory below.
      let q1 = admin.from('crm_forms').select(baseSelect).eq('organization_id', user.organization_id).eq('store_id', storeId)
      let q2 = admin.from('crm_forms').select(baseSelect).eq('organization_id', user.organization_id).is('store_id', null)
      if (status) { q1 = q1.eq('status', status); q2 = q2.eq('status', status) }
      const [r1, r2] = await Promise.all([q1, q2])
      error = r1.error || r2.error
      const merged = [...(r1.data || []), ...(r2.data || [])]
      const seen = new Set<string>()
      forms = merged.filter(f => seen.has(f.id) ? false : (seen.add(f.id), true))
      forms.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    } else {
      let query = admin
        .from('crm_forms')
        .select(baseSelect)
        .eq('organization_id', user.organization_id)
        .order('created_at', { ascending: false })
      if (status) query = query.eq('status', status)
      const r = await query
      error = r.error
      forms = r.data || []
    }

    if (error) {
      console.error('[Forms] Error fetching:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ forms })
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
