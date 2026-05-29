// =============================================
// API: Buscar e atualizar foto de perfil do WhatsApp
// GET /api/whatsapp/inbox/contacts/[id]/profile-picture
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { requireOrgFromAuth } from '@/lib/auth/require-org'
export const dynamic = 'force-dynamic';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'https://n8n-evolution-api.1fpac5.easypanel.host'
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '429683C4C977415CAAFCCE10F7D57E11'

// Normalizar número de telefone
function normalizePhone(phone: string): string {
  const clean = phone.replace(/\D/g, '')
  // Adicionar código do país se necessário
  if (clean.length === 11 && clean.startsWith('9')) {
    return `55${clean}`
  }
  if (clean.length === 11) {
    return `55${clean}`
  }
  if (!clean.startsWith('55') && clean.length < 13) {
    return `55${clean}`
  }
  return clean
}

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

    // Buscar instância WhatsApp ativa da organização
    const { data: instance } = await supabase
      .from('whatsapp_instances')
      .select('unique_id, api_url, api_key')
      .eq('organization_id', orgId)
      .eq('status', 'connected')
      .limit(1)
      .single()

    if (!instance) {
      return NextResponse.json({ 
        profile_picture_url: contact.profile_picture_url,
        message: 'Nenhuma instância WhatsApp conectada'
      })
    }

    const apiUrl = instance.api_url || EVOLUTION_API_URL
    const apiKey = instance.api_key || EVOLUTION_API_KEY
    const phoneNumber = normalizePhone(contact.phone_number)

    // Buscar foto de perfil da Evolution API
    try {
      const response = await fetch(
        `${apiUrl}/chat/fetchProfilePictureUrl/${instance.unique_id}?number=${phoneNumber}`,
        {
          method: 'GET',
          headers: { 'apikey': apiKey },
        }
      )

      if (response.ok) {
        const data = await response.json()
        const profilePictureUrl = data.profilePictureUrl || data.picture || null

        if (profilePictureUrl && profilePictureUrl !== contact.profile_picture_url) {
          // Atualizar foto no banco
          await supabase
            .from('whatsapp_contacts')
            .update({
              profile_picture_url: profilePictureUrl,
              updated_at: new Date().toISOString()
            })
            .eq('id', contactId)
            .eq('organization_id', orgId)

          return NextResponse.json({ 
            profile_picture_url: profilePictureUrl,
            updated: true
          })
        }

        return NextResponse.json({ 
          profile_picture_url: profilePictureUrl || contact.profile_picture_url,
          updated: false
        })
      }
    } catch (apiError) {
      console.error('Error fetching profile picture from Evolution API:', apiError)
    }

    // Retornar foto existente se não conseguiu buscar nova
    return NextResponse.json({ 
      profile_picture_url: contact.profile_picture_url,
      updated: false
    })

  } catch (error: any) {
    console.error('Error in profile picture API:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
