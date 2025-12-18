import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/whatsapp/templates
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organizationId') || 'org-placeholder'
    const category = searchParams.get('category')
    const status = searchParams.get('status') || 'approved'
    const search = searchParams.get('search')

    let query = supabase
      .from('whatsapp_templates')
      .select('*')
      .or(`organization_id.eq.${organizationId},organization_id.eq.00000000-0000-0000-0000-000000000000`)
      .order('use_count', { ascending: false })

    if (category) query = query.eq('category', category)
    if (status) query = query.eq('status', status)
    if (search) query = query.ilike('name', `%${search}%`)

    const { data, error } = await query
    if (error) throw error

    const grouped = {
      MARKETING: (data || []).filter(t => t.category === 'MARKETING'),
      UTILITY: (data || []).filter(t => t.category === 'UTILITY'),
      AUTHENTICATION: (data || []).filter(t => t.category === 'AUTHENTICATION'),
    }

    return NextResponse.json({ templates: data || [], grouped, total: data?.length || 0 })
  } catch (error) {
    console.error('Error fetching templates:', error)
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 })
  }
}

// POST /api/whatsapp/templates
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { organizationId = 'org-placeholder', name, category = 'MARKETING', language = 'pt_BR',
      header_type, header_text, header_media_url, body_text, footer_text, buttons = [] } = body

    if (!name || !body_text) {
      return NextResponse.json({ error: 'Name and body_text are required' }, { status: 400 })
    }

    const variableMatches = body_text.match(/\{\{\d+\}\}/g) || []
    const body_variables = variableMatches.length

    const { data: template, error } = await supabase
      .from('whatsapp_templates')
      .insert({
        organization_id: organizationId, name, category, language, status: 'pending',
        header_type, header_text, header_media_url, body_text, body_variables, footer_text, buttons
      })
      .select('*')
      .single()

    if (error) throw error
    return NextResponse.json({ template })
  } catch (error) {
    console.error('Error creating template:', error)
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 })
  }
}
