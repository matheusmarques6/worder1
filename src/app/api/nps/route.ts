import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { getAuthClient, authError } from '@/lib/api-utils'

// Lazy service-role client — created only when the handler runs so a
// missing env var at build/import time doesn't throw.
let _supabase: SupabaseClient | null = null
function getSupabase(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabase
}

// =============================================
// GET - List NPS Surveys
// =============================================
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()
    const supabase = getSupabase()
    const organizationId = auth.user.organization_id

    const { searchParams } = new URL(request.url)
    const surveyId = searchParams.get('survey_id')
    const includeResponses = searchParams.get('include_responses') === 'true'

    // If survey_id provided, get single survey with responses.
    // CRITICAL: scope by organization_id — without this filter any
    // authenticated user can fetch any org's NPS survey just by
    // guessing the UUID.
    if (surveyId) {
      const { data: survey, error: surveyError } = await supabase
        .from('nps_surveys')
        .select(`
          *,
          profiles:created_by (id, email, full_name)
        `)
        .eq('id', surveyId)
        .eq('organization_id', organizationId)
        .maybeSingle()

      if (surveyError) {
        return NextResponse.json({ error: surveyError.message }, { status: 500 })
      }
      if (!survey) {
        return NextResponse.json({ error: 'Survey not found' }, { status: 404 })
      }

      let responses = []
      if (includeResponses) {
        // Responses are filtered by survey_id (already verified to
        // belong to this org above), so they're implicitly scoped.
        const { data: responseData } = await supabase
          .from('nps_responses')
          .select(`
            *,
            contacts (id, first_name, last_name, email, phone)
          `)
          .eq('survey_id', surveyId)
          .order('responded_at', { ascending: false })
          .limit(100)

        responses = responseData || []
      }

      return NextResponse.json({ survey, responses })
    }

    // List all surveys
    const { data: surveys, error } = await supabase
      .from('nps_surveys')
      .select(`
        *,
        profiles:created_by (id, email, full_name)
      `)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Calculate NPS scores for each survey
    const surveysWithNPS = (surveys || []).map(survey => {
      const total = survey.promoters_count + survey.passives_count + survey.detractors_count
      const nps = total > 0
        ? ((survey.promoters_count / total) * 100) - ((survey.detractors_count / total) * 100)
        : 0

      return {
        ...survey,
        nps_score: nps.toFixed(1),
        response_rate: survey.total_sent > 0
          ? ((survey.total_responses / survey.total_sent) * 100).toFixed(1)
          : 0,
      }
    })

    return NextResponse.json({ surveys: surveysWithNPS })
  } catch (error: any) {
    console.error('NPS GET Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// =============================================
// POST - Create NPS Survey or Response
// =============================================
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()
    const supabase = getSupabase()
    const organization_id = auth.user.organization_id

    const body = await request.json()
    const { action = 'create_survey', ...data } = body

    if (action === 'create_survey') {
      const {
        store_id,
        created_by,
        name,
        question,
        follow_up_question,
        trigger_type = 'manual',
        trigger_delay_hours = 24,
        channel = 'whatsapp',
      } = data

      if (!name) {
        return NextResponse.json(
          { error: 'name is required' },
          { status: 400 }
        )
      }

      const { data: survey, error } = await supabase
        .from('nps_surveys')
        .insert({
          organization_id,
          store_id,
          created_by,
          name,
          question: question || 'Em uma escala de 0 a 10, o quanto você recomendaria nossa empresa?',
          follow_up_question: follow_up_question || 'O que motivou sua nota?',
          trigger_type,
          trigger_delay_hours,
          channel,
        })
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ survey })
    }

    if (action === 'submit_response') {
      const {
        survey_id,
        contact_id,
        deal_id,
        score,
        feedback,
        channel,
        conversation_id,
      } = data

      if (!survey_id || score === undefined) {
        return NextResponse.json(
          { error: 'survey_id and score are required' },
          { status: 400 }
        )
      }

      if (score < 0 || score > 10) {
        return NextResponse.json(
          { error: 'Score must be between 0 and 10' },
          { status: 400 }
        )
      }

      const { data: response, error } = await supabase
        .from('nps_responses')
        .insert({
          organization_id,
          survey_id,
          contact_id,
          deal_id,
          score,
          feedback,
          channel,
          conversation_id,
        })
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ response })
    }

    if (action === 'send_survey') {
      const { survey_id, contact_ids } = data

      if (!survey_id || !contact_ids?.length) {
        return NextResponse.json(
          { error: 'survey_id and contact_ids are required' },
          { status: 400 }
        )
      }

      // Update total_sent count
      const { error: updateError } = await supabase
        .from('nps_surveys')
        .update({
          total_sent: supabase.rpc('increment', { x: contact_ids.length }),
        })
        .eq('id', survey_id)

      if (updateError) {
        console.error('Error updating survey sent count:', updateError)
      }

      // TODO: Integrate with messaging system to actually send surveys
      // For now, just return success
      return NextResponse.json({
        success: true,
        sent_to: contact_ids.length,
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error: any) {
    console.error('NPS POST Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// =============================================
// PUT - Update NPS Survey
// =============================================
export async function PUT(request: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()
    const supabase = getSupabase()
    const organizationId = auth.user.organization_id

    // Multi-org PUT: user can edit surveys from any org they belong
    // to. Without this scope, any leaked survey id could be used to
    // modify a foreign org's survey just by passing the UUID.
    const { data: memberships } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', auth.user.id)
    const orgIds = [...new Set([
      organizationId,
      ...((memberships || []).map((m: any) => m.organization_id)),
    ])]

    const body = await request.json()
    const { id, organization_id: _ignored, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const { data: survey, error } = await supabase
      .from('nps_surveys')
      .update(updates)
      .eq('id', id)
      .in('organization_id', orgIds)
      .select()
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!survey) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 })
    }

    return NextResponse.json({ survey })
  } catch (error: any) {
    console.error('NPS PUT Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// =============================================
// DELETE - Delete NPS Survey
// =============================================
export async function DELETE(request: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()
    const supabase = getSupabase()
    const organizationId = auth.user.organization_id

    const { data: memberships } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', auth.user.id)
    const orgIds = [...new Set([
      organizationId,
      ...((memberships || []).map((m: any) => m.organization_id)),
    ])]

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    // Confirm ownership BEFORE deleting child rows so a leaked id
    // can't cascade-delete responses from a foreign org.
    const { data: existing } = await supabase
      .from('nps_surveys')
      .select('id')
      .eq('id', id)
      .in('organization_id', orgIds)
      .maybeSingle()
    if (!existing) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 })
    }

    // Delete responses first (now safe — parent ownership confirmed)
    await supabase
      .from('nps_responses')
      .delete()
      .eq('survey_id', id)

    // Delete survey
    const { error } = await supabase
      .from('nps_surveys')
      .delete()
      .eq('id', id)
      .in('organization_id', orgIds)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('NPS DELETE Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
