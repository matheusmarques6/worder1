// =============================================
// CRM FORM SUBMISSIONS API
// =============================================
import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

// GET - Listar submissions
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()

    const { supabase, user } = auth
    const formId = params.id
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const status = searchParams.get('status')
    const offset = (page - 1) * limit

    // Verify form ownership
    const { data: form } = await supabase
      .from('crm_forms')
      .select('id, organization_id')
      .eq('id', formId)
      .eq('organization_id', user.organization_id)
      .single()

    if (!form) {
      return NextResponse.json({ error: 'Formulário não encontrado' }, { status: 404 })
    }

    let query = supabase
      .from('crm_form_submissions')
      .select(`
        id, answers, status, ip_address, referrer,
        utm_source, utm_medium, utm_campaign,
        events_fired, created_at,
        contact:contacts(id, name, email, phone),
        deal:deals(id, title, stage_id, value)
      `, { count: 'exact' })
      .eq('form_id', formId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status) {
      query = query.eq('status', status)
    }

    const { data: submissions, count, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      submissions: submissions || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    })
  } catch (error: any) {
    console.error('[Form Submissions] GET error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
