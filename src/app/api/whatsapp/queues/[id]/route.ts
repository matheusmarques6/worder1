// =============================================
// API: WhatsApp Queue CRUD
// GET/PUT/DELETE /api/whatsapp/queues/[id]
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
      .eq('id', params.id)
      .eq('organization_id', organizationId)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }

    return NextResponse.json({ data })
  } catch (error: unknown) {
    const err = error as Error
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organizationId')

    if (!organizationId) {
      return NextResponse.json({ error: 'organizationId required' }, { status: 400 })
    }

    const body = await request.json()
    const { name, color, greeting_message, out_of_hours_message, is_active, agent_ids } = body

    const updates: Record<string, unknown> = {}
    if (name !== undefined) updates.name = name
    if (color !== undefined) updates.color = color
    if (greeting_message !== undefined) updates.greeting_message = greeting_message
    if (out_of_hours_message !== undefined) updates.out_of_hours_message = out_of_hours_message
    if (is_active !== undefined) updates.is_active = is_active

    const { data, error } = await supabaseAdmin
      .from('whatsapp_queues')
      .update(updates)
      .eq('id', params.id)
      .eq('organization_id', organizationId)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Update agents if provided
    if (agent_ids !== undefined) {
      // Remove existing
      await supabaseAdmin
        .from('whatsapp_queue_agents')
        .delete()
        .eq('queue_id', params.id)

      // Add new
      if (agent_ids.length > 0) {
        const agentRecords = agent_ids.map((agentId: string) => ({
          queue_id: params.id,
          agent_id: agentId,
          organization_id: organizationId,
        }))
        await supabaseAdmin
          .from('whatsapp_queue_agents')
          .insert(agentRecords)
      }
    }

    return NextResponse.json({ data })
  } catch (error: unknown) {
    const err = error as Error
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organizationId')

    if (!organizationId) {
      return NextResponse.json({ error: 'organizationId required' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('whatsapp_queues')
      .delete()
      .eq('id', params.id)
      .eq('organization_id', organizationId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const err = error as Error
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
