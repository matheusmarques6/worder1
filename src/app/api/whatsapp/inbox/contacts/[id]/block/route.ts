// src/app/api/whatsapp/inbox/contacts/[id]/block/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// POST - Bloquear ou desbloquear contato
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const contactId = params.id
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { block, reason } = body

    // Preparar dados de atualização
    const updateData: Record<string, any> = {
      is_blocked: block,
      updated_at: new Date().toISOString()
    }

    if (block) {
      updateData.blocked_reason = reason || null
      updateData.blocked_at = new Date().toISOString()
      updateData.blocked_by = user.id
    } else {
      updateData.blocked_reason = null
      updateData.blocked_at = null
      updateData.blocked_by = null
    }

    // Atualizar contato
    const { data: updatedContact, error: updateError } = await supabase
      .from('contacts')
      .update(updateData)
      .eq('id', contactId)
      .select('id, is_blocked, blocked_reason, blocked_at')
      .single()

    if (updateError) {
      throw updateError
    }

    // Buscar organization_id para a atividade
    const { data: contact } = await supabase
      .from('contacts')
      .select('organization_id')
      .eq('id', contactId)
      .single()

    // Registrar atividade
    await supabase.from('contact_activities').insert({
      contact_id: contactId,
      organization_id: contact?.organization_id || user.user_metadata?.organization_id,
      activity_type: block ? 'blocked' : 'unblocked',
      title: block ? 'Contato bloqueado' : 'Contato desbloqueado',
      description: reason || null,
      created_by: user.id,
    }).single()

    return NextResponse.json({ 
      success: true,
      contact: updatedContact 
    })
  } catch (error) {
    console.error('Error blocking/unblocking contact:', error)
    return NextResponse.json(
      { error: 'Failed to update contact' },
      { status: 500 }
    )
  }
}
