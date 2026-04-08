import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      event_type,
      organization_id,
      visitor_id,
      session_id,
      url,
      referrer,
      user_agent,
      properties,
    } = body

    if (!organization_id || !event_type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    await supabase.from('tracking_events').insert({
      organization_id,
      event_type,
      visitor_id: visitor_id || null,
      session_id: session_id || null,
      url: url || null,
      referrer: referrer || null,
      user_agent: user_agent || null,
      properties: properties || {},
      created_at: new Date().toISOString(),
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
