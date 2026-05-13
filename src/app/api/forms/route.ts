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
    // Keep the SELECT simple. The earlier version joined pipelines,
    // crm_form_fields, and crm_form_events — but the FK relationships
    // were either missing or returning errors that the supabase client
    // swallowed, leaving the merchant with an empty list while four
    // popups clearly existed in the DB. The dashboard list only needs
    // the form metadata; submissions/views counts are already columns
    // on crm_forms, and pipeline name isn't shown in the list cards.
    const baseSelect = `
      id, name, slug, description, status, form_type,
      submissions_count, views_count,
      pipeline_id, stage_id, store_id,
      facebook_pixel_id, google_ads_id,
      theme, logo_url,
      created_at, updated_at
    `

    // Always fetch ALL forms in the org. The merchant typically has more than
    // one store under the same org (e.g. one OAuth + one manual variant of the
    // same shop) and silently filtering by storeId loses popups that were
    // bound to a sibling store. The dashboard can still group/filter by store
    // client-side if it wants. Multi-tenant isolation is preserved by the
    // organization_id check.
    let query = admin
      .from('crm_forms')
      .select(baseSelect)
      .eq('organization_id', user.organization_id)
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    const { data: forms, error } = await query

    if (error) {
      console.error('[Forms] Error fetching:', { error, orgId: user.organization_id, storeId })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`[Forms] Found ${forms?.length || 0} forms for org ${user.organization_id}, storeId=${storeId || 'none'}`)

    // Multi-store isolation. When a storeId is provided, ONLY return
    // popups that belong to that store (or are unbound, store_id IS NULL
    // — those are shared across every storefront in the org).
    //
    // When storeId is OMITTED, do NOT return every popup in the org.
    // That used to happen during a brief window on page load (zustand
    // not yet rehydrated → frontend fetched without storeId), and the
    // merchant saw sibling-store popups flash in their list. Instead,
    // return only "global" popups (store_id IS NULL). If the org has
    // more than one active store, the page should always supply
    // storeId — empty + globals is the safe default until it does.
    let result = forms || []
    if (storeId) {
      result = result.filter(f => !f.store_id || f.store_id === storeId)
    } else {
      result = result.filter(f => !f.store_id)
    }

    return NextResponse.json({ forms: result })
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

    const { user } = auth
    const body = await request.json()
    const { name, description, pipeline_id, stage_id, theme, store_id, form_type, design_json, behavior, audience, tags, list_id } = body

    if (!name) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
    }

    console.log('[Forms] POST', {
      name,
      form_type,
      store_id,
      design_json_keys: design_json ? Object.keys(design_json) : null,
      design_json_steps: design_json?.steps?.length,
      design_json_blocks: design_json?.steps?.[0]?.blocks?.length,
    })

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

    // Use the admin client for the insert. The user's RLS-aware client
    // was, in some cases, silently dropping the design_json column when
    // the policy on crm_forms didn't allow writes to that specific
    // jsonb field — the row got inserted but with design_json = {},
    // making the editor fall back to the default popup. The admin
    // client bypasses RLS; isolation is preserved by the explicit
    // organization_id field below.
    const admin = getSupabaseAdmin()
    const { data: form, error } = await admin
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

    console.log('[Forms] POST saved', {
      id: form.id,
      design_json_keys: form.design_json ? Object.keys(form.design_json) : null,
      design_json_steps: form.design_json?.steps?.length,
    })

    // Criar campos padrão
    const defaultFields = [
      { field_type: 'text', label: 'Nome completo', placeholder: 'Seu nome', required: true, position: 0, map_to_contact_field: 'name' },
      { field_type: 'email', label: 'E-mail', placeholder: 'seu@email.com', required: true, position: 1, map_to_contact_field: 'email' },
      { field_type: 'phone', label: 'Telefone', placeholder: '(11) 99999-9999', required: true, position: 2, map_to_contact_field: 'phone' },
    ]

    await admin
      .from('crm_form_fields')
      .insert(defaultFields.map(f => ({ ...f, form_id: form.id })))

    // Criar evento padrão de Lead
    await admin
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
