// src/app/api/whatsapp/inbox/contacts/[id]/block/route.ts
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'

// POST - Bloquear ou desbloquear contato
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const contactId = params.id
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
    } else {
      updateData.blocked_reason = null
      updateData.blocked_at = null
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
