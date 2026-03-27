import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const auth = await getAuthClient()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: campaigns } = await supabaseAdmin
      .from('email_campaigns')
      .select('*, email_sends(count)')
      .eq('organization_id', auth.user.organization_id)
      .order('created_at', { ascending: false })

    // Get aggregate stats
    const stats = {
      total: campaigns?.length || 0,
      sent: campaigns?.filter(c => c.status === 'sent').length || 0,
      draft: campaigns?.filter(c => c.status === 'draft').length || 0,
      scheduled: campaigns?.filter(c => c.status === 'scheduled').length || 0,
    }

    return NextResponse.json({ success: true, campaigns: campaigns || [], stats })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { name, subject, preview_text, template_id, segment_id, sender_name, sender_email, reply_to, scheduled_at } = body

    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('email_campaigns')
      .insert({
        organization_id: auth.user.organization_id,
        name,
        subject: subject || '',
        preview_text: preview_text || '',
        template_id: template_id || null,
        segment_id: segment_id || null,
        sender_name: sender_name || '',
        sender_email: sender_email || '',
        reply_to: reply_to || '',
        status: scheduled_at ? 'scheduled' : 'draft',
        scheduled_at: scheduled_at || null,
        created_by: auth.user.id,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, campaign: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
