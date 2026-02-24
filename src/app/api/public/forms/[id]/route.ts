// =============================================
// PUBLIC FORM API - Get form for embedding (no auth required)
// =============================================
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

// GET - Obter formulário público para embed
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
    }

    const formId = params.id

    // Buscar por ID ou slug
    let query = supabase
      .from('crm_forms')
      .select(`
        id, name, slug, description, status,
        theme, logo_url, success_message, redirect_url,
        facebook_pixel_id, google_ads_id, google_analytics_id,
        fields:crm_form_fields(
          id, field_type, label, placeholder, description,
          required, position, options, validation, conditional
        )
      `)
      .eq('status', 'published')

    // Check if it's a UUID or slug
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(formId)
    if (isUUID) {
      query = query.eq('id', formId)
    } else {
      query = query.eq('slug', formId)
    }

    const { data: form, error } = await query.single()

    if (error || !form) {
      return NextResponse.json({ error: 'Formulário não encontrado' }, { status: 404 })
    }

    // Sort fields by position
    if (form.fields) {
      form.fields.sort((a: any, b: any) => a.position - b.position)
    }

    // Increment views
    await supabase.rpc('increment_form_views', { p_form_id: form.id })

    // CORS headers for embedding
    const response = NextResponse.json({ form })
    response.headers.set('Access-Control-Allow-Origin', '*')
    response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type')
    return response
  } catch (error: any) {
    console.error('[Public Form] GET error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// OPTIONS - CORS preflight
export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 })
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type')
  return response
}
