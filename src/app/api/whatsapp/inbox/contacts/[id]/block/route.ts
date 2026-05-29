// src/app/api/whatsapp/inbox/contacts/[id]/block/route.ts
// CORRIGIDO: Usa tabela CONTACTS unificada
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { requireOrgFromAuth } from '@/lib/auth/require-org'
export const dynamic = 'force-dynamic';

// POST - Bloquear ou desbloquear contato
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const { orgId } = auth

    const contactId = params.id
    const body = await request.json()
    const { block, reason } = body

    // Verificar qual tabela tem o contato (escopado por org)
    let tableName = 'contacts'

    const { data: contact } = await supabase
      .from('contacts')
      .select('id')
      .eq('id', contactId)
      .eq('organization_id', orgId)
      .single()

    if (!contact) {
      const { data: waContact } = await supabase
        .from('whatsapp_contacts')
        .select('id')
        .eq('id', contactId)
        .eq('organization_id', orgId)
        .single()

      if (!waContact) {
        return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404 })
      }
      tableName = 'whatsapp_contacts'
    }

    // Atualizar status de bloqueio
    const updateData: any = {
      is_blocked: block,
      updated_at: new Date().toISOString(),
    }

    if (block) {
      updateData.blocked_at = new Date().toISOString()
      updateData.blocked_reason = reason || null
    } else {
      updateData.blocked_at = null
      updateData.blocked_reason = null
    }

    const { data: updatedContact, error } = await supabase
      .from(tableName)
      .update(updateData)
      .eq('id', contactId)
      .eq('organization_id', orgId)
      .select('id, is_blocked, blocked_reason, blocked_at')
      .single()

    if (error) {
      throw error
    }

    // Se for contato unificado, também atualizar whatsapp_contacts se existir link
    if (tableName === 'contacts') {
      await supabase
        .from('whatsapp_contacts')
        .update({ 
          is_blocked: block,
          blocked_reason: block ? reason : null,
          blocked_at: block ? new Date().toISOString() : null,
        })
        .eq('crm_contact_id', contactId)
    }

    return NextResponse.json({ 
      success: true,
      contact: updatedContact 
    })
  } catch (error: any) {
    console.error('Error blocking contact:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
