// =============================================
// API: WhatsApp Queues (Departments)
// GET/POST /api/whatsapp/queues
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organizationId')

    if (!organizationId) {
      return NextResponse.json({ error: 'organizationId required' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('whatsapp_queues')
      .select(`
        *,
        whatsapp_queue_agents (
          agent_id,
          is_active
        )
      `)
      .eq('organization_id', organizationId)
      .order('sort_order', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error: unknown) {
    const err = error as Error
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organizationId')

    if (!organizationId) {
      return NextResponse.json({ error: 'organizationId required' }, { status: 400 })
    }

    const body = await request.json()
    const { name, color, greeting_message, out_of_hours_message, agent_ids } = body

    if (!name) {
      return NextResponse.json({ error: 'Queue name required' }, { status: 400 })
    }

    // Create queue
    const { data: queue, error } = await supabaseAdmin
      .from('whatsapp_queues')
      .insert({
        organization_id: organizationId,
        name,
        color: color || '#6366f1',
        greeting_message,
        out_of_hours_message,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Add agents to queue
    if (agent_ids && agent_ids.length > 0) {
      const agentRecords = agent_ids.map((agentId: string) => ({
        queue_id: queue.id,
        agent_id: agentId,
        organization_id: organizationId,
      }))

      await supabaseAdmin
        .from('whatsapp_queue_agents')
        .insert(agentRecords)
    }

    return NextResponse.json({ data: queue }, { status: 201 })
  } catch (error: unknown) {
    const err = error as Error
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
