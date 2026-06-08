// =============================================
// API: Buscar foto de perfil do WhatsApp
// GET /api/whatsapp/inbox/contacts/[id]/profile-picture
// =============================================
// A WhatsApp Cloud API (Meta) não expõe a foto de perfil de contatos,
// então este endpoint retorna apenas a URL já persistida em
// whatsapp_contacts.profile_picture_url (capturada em outros fluxos).
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { requireOrgFromAuth } from '@/lib/auth/require-org'
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const { orgId } = auth

    const contactId = params.id

    // Buscar contato
    const { data: contact, error: contactError } = await supabase
      .from('whatsapp_contacts')
      .select('id, phone_number, profile_picture_url, organization_id')
      .eq('id', contactId)
      .eq('organization_id', orgId)
      .single()

    if (contactError || !contact) {
      return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404 })
    }

    return NextResponse.json({
      profile_picture_url: contact.profile_picture_url,
      updated: false,
    })
  } catch (error: any) {
    console.error('Error in profile picture API:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
