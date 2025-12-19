import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - Buscar usuários disponíveis para atribuição
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const conversationId = params.id

    // Buscar conversa para pegar org_id
    const { data: conversation } = await supabase
      .from('whatsapp_conversations')
      .select('organization_id, assigned_to')
      .eq('id', conversationId)
      .single()

    if (!conversation) {
      return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
    }

    // Buscar membros da organização
    const { data: members, error } = await supabase
      .from('organization_members')
      .select('user_id, role, users(id, email, full_name)')
      .eq('organization_id', conversation.organization_id)

    if (error) {
      console.log('Members error:', error.message)
      return NextResponse.json({ users: [], assigned_to: conversation.assigned_to })
    }

    const users = members?.map((m: any) => ({
      id: m.user_id,
      email: m.users?.email,
      name: m.users?.full_name || m.users?.email,
      role: m.role
    })) || []

    return NextResponse.json({ 
      users, 
      assigned_to: conversation.assigned_to 
    })
  } catch (error: any) {
    console.error('Error fetching users:', error)
    return NextResponse.json({ users: [], assigned_to: null })
  }
}

// POST - Atribuir conversa a um usuário
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const conversationId = params.id
    const body = await request.json()
    const { user_id } = body

    const { data: conversation, error } = await supabase
      .from('whatsapp_conversations')
      .update({ 
        assigned_to: user_id || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', conversationId)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ conversation })
  } catch (error: any) {
    console.error('Error assigning conversation:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
