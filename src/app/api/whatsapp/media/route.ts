import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

// ✅ FASE 4: Usar variáveis de ambiente (nunca hardcode!)
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY

// ✅ FASE 4: Headers seguros - sem cache público
const SECURE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
}

export const dynamic = 'force-dynamic'

// GET - Baixar mídia do WhatsApp via Evolution API
export async function GET(request: NextRequest) {
  try {
    // ✅ Verificar se variáveis de ambiente estão configuradas
    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      console.error('[Media Proxy] Missing EVOLUTION_API_URL or EVOLUTION_API_KEY')
      return NextResponse.json(
        { error: 'Evolution API not configured' }, 
        { status: 500, headers: SECURE_HEADERS }
      )
    }

    const { searchParams } = new URL(request.url)
    const messageId = searchParams.get('messageId')
    const instanceId = searchParams.get('instanceId')
    const mediaKey = searchParams.get('mediaKey')
    
    if (!messageId && !mediaKey) {
      return NextResponse.json(
        { error: 'messageId or mediaKey required' }, 
        { status: 400, headers: SECURE_HEADERS }
      )
    }

    // Se tem mediaKey direto, buscar da Evolution
    if (mediaKey) {
      const response = await fetch(`${EVOLUTION_API_URL}/chat/getBase64FromMediaMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': EVOLUTION_API_KEY,
        },
        body: JSON.stringify({
          key: {
            id: mediaKey
          }
        }),
      })

      if (!response.ok) {
        console.error('[Media Proxy] Evolution API error:', response.status)
        return NextResponse.json(
          { error: 'Failed to fetch media' }, 
          { status: 502, headers: SECURE_HEADERS }
        )
      }

      const data = await response.json()
      
      if (data.base64) {
        // Detectar tipo de mídia
        const mimeType = data.mimetype || 'application/octet-stream'
        const buffer = Buffer.from(data.base64, 'base64')
        
        return new NextResponse(buffer, {
          headers: {
            'Content-Type': mimeType,
            // ✅ FASE 4: Cache privado, não público
            'Cache-Control': 'private, max-age=3600',
            'X-Content-Type-Options': 'nosniff',
          },
        })
      }
    }

    // Se tem messageId, buscar do banco e depois da Evolution
    if (messageId) {
      const { data: message } = await supabase
        .from('whatsapp_messages')
        .select('*, instance:whatsapp_instances(*)')
        .eq('id', messageId)
        .single()

      if (!message) {
        return NextResponse.json(
          { error: 'Message not found' }, 
          { status: 404, headers: SECURE_HEADERS }
        )
      }

      // Tentar extrair message_id original do metadata
      const originalMsgId = message.message_id || message.metadata?.key?.id

      if (!originalMsgId) {
        return NextResponse.json(
          { error: 'No media key found' }, 
          { status: 400, headers: SECURE_HEADERS }
        )
      }

      const instanceName = message.instance?.unique_id || message.instance?.instance_name

      // Buscar mídia da Evolution API
      const response = await fetch(`${EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${instanceName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': EVOLUTION_API_KEY,
        },
        body: JSON.stringify({
          message: {
            key: {
              id: originalMsgId,
              remoteJid: message.metadata?.remoteJid
            }
          }
        }),
      })

      if (!response.ok) {
        console.error('[Media Proxy] Evolution API error:', response.status, await response.text())
        return NextResponse.json(
          { error: 'Failed to fetch media from Evolution' }, 
          { status: 502, headers: SECURE_HEADERS }
        )
      }

      const data = await response.json()
      
      if (data.base64) {
        const mimeType = data.mimetype || message.media_mime_type || 'application/octet-stream'
        const buffer = Buffer.from(data.base64, 'base64')
        
        return new NextResponse(buffer, {
          headers: {
            'Content-Type': mimeType,
            // ✅ FASE 4: Cache privado, não público
            'Cache-Control': 'private, max-age=3600',
            'X-Content-Type-Options': 'nosniff',
          },
        })
      }

      // Se não conseguiu, retornar a URL original (fallback)
      if (message.media_url) {
        return NextResponse.redirect(message.media_url)
      }
    }

    return NextResponse.json(
      { error: 'Media not found' }, 
      { status: 404, headers: SECURE_HEADERS }
    )
  } catch (error: any) {
    console.error('[Media Proxy] Error:', error)
    return NextResponse.json(
      { error: error.message }, 
      { status: 500, headers: SECURE_HEADERS }
    )
  }
}
