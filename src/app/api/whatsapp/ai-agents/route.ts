// =============================================
// API: AI Agents CRUD
// GET/POST /api/whatsapp/ai-agents
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
      .from('whatsapp_ai_agents')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })

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
    const {
      name,
      agent_type,
      model,
      system_prompt,
      knowledge_base,
      temperature,
      max_tokens,
      handoff_keywords,
      mode,
      max_interactions,
      store_id,
    } = body

    if (!name || !system_prompt) {
      return NextResponse.json({ error: 'name and system_prompt required' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('whatsapp_ai_agents')
      .insert({
        organization_id: organizationId,
        store_id,
        name,
        agent_type: agent_type || 'support',
        model: model || 'gpt-4o-mini',
        system_prompt,
        knowledge_base: knowledge_base || '',
        temperature: temperature ?? 0.7,
        max_tokens: max_tokens ?? 500,
        handoff_keywords: handoff_keywords || [],
        mode: mode || 'auto',
        max_interactions,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (error: unknown) {
    const err = error as Error
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
