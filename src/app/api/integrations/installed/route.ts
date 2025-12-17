import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/api-utils'

// GET - List installed integrations for an organization
export async function GET(request: NextRequest) {
  const supabase = getSupabaseClient()

  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  const searchParams = request.nextUrl.searchParams
  const organizationId = searchParams.get('organizationId')

  if (!organizationId) {
    return NextResponse.json({ error: 'organizationId required' }, { status: 400 })
  }

  try {
    const { data: installed, error } = await supabase
      .from('installed_integrations')
      .select(`
        *,
        integration:integrations(*)
      `)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ installed: installed || [] })
  } catch (error: any) {
    console.error('Error fetching installed integrations:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Install a new integration
export async function POST(request: NextRequest) {
  const supabase = getSupabaseClient()

  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  try {
    const body = await request.json()
    const {
      organizationId,
      integrationId,
      defaultPipelineId,
      defaultStageId,
      autoTags,
      configuration,
    } = body

    if (!organizationId || !integrationId) {
      return NextResponse.json(
        { error: 'organizationId and integrationId required' },
        { status: 400 }
      )
    }

    // Check if already installed
    const { data: existing } = await supabase
      .from('installed_integrations')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('integration_id', integrationId)
      .single()

    if (existing) {
      return NextResponse.json(
        { error: 'Integration already installed' },
        { status: 400 }
      )
    }

    // Install
    const { data: installed, error } = await supabase
      .from('installed_integrations')
      .insert({
        organization_id: organizationId,
        integration_id: integrationId,
        default_pipeline_id: defaultPipelineId || null,
        default_stage_id: defaultStageId || null,
        auto_tags: autoTags || [],
        configuration: configuration || {},
        status: 'configuring',
      })
      .select(`
        *,
        integration:integrations(*)
      `)
      .single()

    if (error) throw error

    return NextResponse.json({ installed }, { status: 201 })
  } catch (error: any) {
    console.error('Error installing integration:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
