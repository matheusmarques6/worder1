import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - Listar agentes
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organizationId')

    if (!organizationId) {
      return NextResponse.json({ error: 'organizationId required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('ai_agents')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('name', { ascending: true })

    if (error) throw error

    return NextResponse.json({ agents: data || [] })
  } catch (error: any) {
    console.error('Error fetching agents:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Criar agente
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { organizationId, name, description, systemPrompt, model, temperature, maxTokens } = body

    if (!organizationId || !name || !systemPrompt) {
      return NextResponse.json({ error: 'organizationId, name, systemPrompt required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('ai_agents')
      .insert({
        organization_id: organizationId,
        name,
        description,
        system_prompt: systemPrompt,
        model: model || 'gpt-4o-mini',
        temperature: temperature || 0.7,
        max_tokens: maxTokens || 500,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ agent: data })
  } catch (error: any) {
    console.error('Error creating agent:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
