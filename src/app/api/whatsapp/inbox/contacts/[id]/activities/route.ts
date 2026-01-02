import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

// GET /api/whatsapp/inbox/contacts/[id]/activities
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '20')
    const type = searchParams.get('type')

    let query = supabase
      .from('whatsapp_contact_activities')
      .select('*')
      .eq('contact_id', id)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (type) {
      query = query.eq('activity_type', type)
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({ activities: data || [] })

  } catch (error) {
    console.error('Error fetching activities:', error)
    return NextResponse.json({ error: 'Failed to fetch activities' }, { status: 500 })
  }
}
