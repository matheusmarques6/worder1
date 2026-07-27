import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { requireOrgFromAuth } from '@/lib/auth/require-org'
import {
  requireOptIn,
  readOverrideFromRequest,
  buildOptOutBlockedResponse,
} from '@/lib/whatsapp/opt-out-guard'
import { createWhatsAppCloudClient } from '@/lib/whatsapp/cloud-api'
import { getAccessToken } from '@/lib/whatsapp/account-loader'
import {
  checkBeforeSend,
  reportSendResult,
  buildRateLimitedResponseBody,
} from '@/lib/whatsapp/send-guard'

// ✅ FASE 3: Force dynamic para evitar cache
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Headers padrão sem cache
const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
}

const SIGNED_URL_EXPIRY = 3600 // 1 hora

// Meta Cloud API enforces different size limits per media category.
// Reject early instead of letting Meta refuse the upload.
const MAX_SIZE_BY_TYPE: Record<string, number> = {
  image: 5 * 1024 * 1024,      // 5 MB
  video: 16 * 1024 * 1024,     // 16 MB
  audio: 16 * 1024 * 1024,     // 16 MB
  document: 100 * 1024 * 1024, // 100 MB
}
const FALLBACK_MAX_SIZE = 16 * 1024 * 1024

// MIME types accepted by Meta's /media endpoint. Anything outside
// these lists is rejected by Meta with code 131053.
const ALLOWED_TYPES = {
  image: ['image/jpeg', 'image/png', 'image/webp'],
  video: ['video/mp4', 'video/3gpp'],
  audio: ['audio/aac', 'audio/mpeg', 'audio/mp4', 'audio/amr', 'audio/ogg'],
  document: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
  ],
}

const DANGEROUS_EXTENSIONS = ['.exe', '.bat', '.cmd', '.sh', '.ps1', '.vbs', '.js', '.jar', '.msi']

// Validação de arquivo
function validateFile(file: File, mediaType: string): { valid: boolean; error?: string } {
  const maxSize = MAX_SIZE_BY_TYPE[mediaType] ?? FALLBACK_MAX_SIZE
  if (file.size > maxSize) {
    const label = mediaType === 'image' ? 'Imagem'
      : mediaType === 'video' ? 'Video'
      : mediaType === 'audio' ? 'Audio'
      : 'Documento'
    return { valid: false, error: `${label} muito grande. Maximo: ${maxSize / (1024 * 1024)}MB` }
  }

  if (DANGEROUS_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext))) {
    return { valid: false, error: 'Tipo de arquivo não permitido por segurança' }
  }

  const allowedList = ALLOWED_TYPES[mediaType as keyof typeof ALLOWED_TYPES]
  if (allowedList && !allowedList.includes(file.type)) {
    return { valid: false, error: `Tipo de arquivo nao aceito pelo WhatsApp para ${mediaType}: ${file.type}` }
  }

  return { valid: true }
}

// POST - Enviar mídia
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const { orgId } = auth

    const conversationId = params.id
    const formData = await request.formData()
    const file = formData.get('file') as File
    const mediaType = formData.get('mediaType') as string || 'document'
    const caption = formData.get('caption') as string || ''

    console.log('[Media POST] Starting upload:', {
      mediaType,
      fileName: file?.name,
      fileSize: file?.size,
      conversation_id: conversationId
    })

    // Validações
    if (!file) {
      return NextResponse.json(
        { error: 'File required', success: false },
        { status: 400, headers: NO_CACHE_HEADERS }
      )
    }

    const validation = validateFile(file, mediaType)
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error, success: false },
        { status: 400, headers: NO_CACHE_HEADERS }
      )
    }

    // Cloud API first — conversas vindas do webhook Meta vivem em
    // whatsapp_cloud_conversations (sem instance_id). Se for Cloud,
    // upload pro Meta + sendImage/Video/Audio/Document e retorna.
    const { data: cloudConv } = await supabase
      .from('whatsapp_cloud_conversations')
      .select('*, account:whatsapp_business_accounts(*)')
      .eq('id', conversationId)
      .eq('organization_id', orgId)
      .maybeSingle()

    if (cloudConv && cloudConv.account) {
      const phoneNumber = cloudConv.contact_phone || cloudConv.wa_id

      // Onda 10 — guard opt-out (midia = service window, atendente pode override)
      const optCheck = await requireOptIn(orgId, phoneNumber, undefined, {
        ...(readOverrideFromRequest(request, auth.userId) || {}),
        sender: 'inbox.media',
      })
      if (!optCheck.allowed) {
        return NextResponse.json(
          buildOptOutBlockedResponse(optCheck, undefined),
          { status: 409, headers: NO_CACHE_HEADERS },
        )
      }

      // Send guard ANTES do upload — falha rápida sem desperdiçar
      // upload em Storage/Meta quando a conta está limitada.
      const guardCheck = await checkBeforeSend({
        accountId: cloudConv.account.id,
        recipientPhone: phoneNumber,
        messagingLimit: cloudConv.account.messaging_limit,
      })
      if (!guardCheck.allowed) {
        const body429 = buildRateLimitedResponseBody(guardCheck)
        return NextResponse.json(
          { ...body429, success: false },
          {
            status: 429,
            headers: { ...NO_CACHE_HEADERS, 'Retry-After': String(body429.retryAfter) },
          },
        )
      }

      const client = createWhatsAppCloudClient({
        phoneNumberId: cloudConv.account.phone_number_id,
        accessToken: getAccessToken(cloudConv.account),
      })

      // Upload to Supabase Storage in parallel — gives us a stable URL
      // for the chat bubble's player (Meta-hosted media id is opaque).
      const buffer = Buffer.from(await file.arrayBuffer())
      let cloudMediaUrl: string | null = null
      let cloudStoragePath: string | null = null
      try {
        const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
        const ext = sanitizedName.split('.').pop() || file.type.split('/')[1] || 'bin'
        const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
        cloudStoragePath = `${cloudConv.organization_id}/${conversationId}/${uniqueId}.${ext}`
        const { error: upErr } = await supabase.storage
          .from('whatsapp-media')
          .upload(cloudStoragePath, buffer, {
            contentType: file.type || 'application/octet-stream',
            upsert: false,
            cacheControl: '3600',
          })
        if (!upErr) {
          const { data: signed } = await supabase.storage
            .from('whatsapp-media')
            .createSignedUrl(cloudStoragePath, SIGNED_URL_EXPIRY)
          if (signed?.signedUrl) cloudMediaUrl = signed.signedUrl
          else {
            const { data: pub } = supabase.storage.from('whatsapp-media').getPublicUrl(cloudStoragePath)
            cloudMediaUrl = pub?.publicUrl ?? null
          }
        }
      } catch (storageErr) {
        console.error('[Media POST/Cloud] storage error:', storageErr)
      }

      // Upload to Meta and dispatch the message.
      let metaMediaId: string | undefined
      try {
        const uploaded = await client.uploadMedia(
          buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
          file.type || 'application/octet-stream',
          file.name,
        )
        metaMediaId = uploaded.id
      } catch (e: any) {
        console.error('[Media POST/Cloud] uploadMedia error:', e)
        const codeStr = e?.code ? ` (code ${e.code})` : ''
        return NextResponse.json(
          {
            error: `Meta: ${e?.message || 'Failed to upload media'}${codeStr}`,
            code: e?.code,
            details: e?.error_data?.details,
            success: false,
          },
          { status: 400, headers: NO_CACHE_HEADERS },
        )
      }

      let result
      try {
        if (mediaType === 'image') {
          result = await client.sendImage(phoneNumber, { id: metaMediaId }, caption || undefined)
        } else if (mediaType === 'video') {
          result = await client.sendVideo(phoneNumber, { id: metaMediaId }, caption || undefined)
        } else if (mediaType === 'audio') {
          result = await client.sendAudio(phoneNumber, { id: metaMediaId })
        } else {
          result = await client.sendDocument(
            phoneNumber,
            { id: metaMediaId, filename: file.name },
            caption || undefined,
          )
        }
      } catch (e: any) {
        console.error('[Media POST/Cloud] send error:', e)
        await reportSendResult({
          accountId: cloudConv.account.id,
          success: false,
          errorCode: e?.code,
          error: e,
          messagingLimit: cloudConv.account.messaging_limit,
        })
        const codeStr = e?.code ? ` (code ${e.code})` : ''
        return NextResponse.json(
          {
            error: `Meta: ${e?.message || 'Failed to send media'}${codeStr}`,
            code: e?.code,
            details: e?.error_data?.details,
            success: false,
          },
          { status: 400, headers: NO_CACHE_HEADERS },
        )
      }

      await reportSendResult({ accountId: cloudConv.account.id, success: true })

      const messageId = result.messages?.[0]?.id
      const { data: saved } = await supabase
        .from('whatsapp_cloud_messages')
        .upsert({
          organization_id: cloudConv.organization_id,
          store_id: cloudConv.store_id || cloudConv.account?.store_id || null,
          waba_id: cloudConv.account.id,
          conversation_id: conversationId,
          message_id: messageId,
          direction: 'outbound',
          from_number: cloudConv.account.phone_number,
          to_number: phoneNumber,
          message_type: mediaType,
          content: { [mediaType]: { id: metaMediaId, caption } },
          text_body: caption || '',
          status: 'sent',
          media_url: cloudMediaUrl,
          media_filename: file.name,
          media_mime_type: file.type,
          media_storage_path: cloudStoragePath,
          timestamp: new Date().toISOString(),
        }, { onConflict: 'message_id' })
        .select()
        .maybeSingle()

      const preview = caption?.substring(0, 50) ||
        (mediaType === 'image' ? '📷 Imagem' :
         mediaType === 'video' ? '🎬 Vídeo' :
         mediaType === 'audio' ? '🎵 Áudio' : `📎 ${file.name}`)

      await supabase.from('whatsapp_cloud_conversations').update({
        last_message_at: new Date().toISOString(),
        last_message_preview: preview,
        last_message_direction: 'outbound',
      }).eq('id', conversationId)

      return NextResponse.json({
        message: saved ? {
          id: saved.id,
          conversation_id: saved.conversation_id,
          direction: saved.direction,
          message_type: saved.message_type,
          content: saved.text_body || caption,
          media_url: saved.media_url,
          media_filename: saved.media_filename,
          media_mime_type: saved.media_mime_type,
          status: saved.status,
          sent_by_bot: false,
          created_at: saved.created_at,
        } : null,
        provider: 'cloud',
        success: true,
      }, { headers: NO_CACHE_HEADERS })
    }

    // Sem conversa Cloud correspondente: o único transporte de mídia é a
    // WhatsApp Cloud API (Meta). Conversas legadas (Evolution) não enviam mais.
    return NextResponse.json(
      { error: 'Conversa Cloud não encontrada para este id', success: false },
      { status: 404, headers: NO_CACHE_HEADERS }
    )

  } catch (error: any) {
    console.error('[Media POST] Error:', error)
    return NextResponse.json(
      { error: error.message, success: false },
      { status: 500, headers: NO_CACHE_HEADERS }
    )
  }
}

// GET - Refresh de Signed URL
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const { orgId } = auth

    const { searchParams } = new URL(request.url)
    const messageId = searchParams.get('messageId')

    if (!messageId) {
      return NextResponse.json(
        { error: 'messageId required' },
        { status: 400, headers: NO_CACHE_HEADERS }
      )
    }

    const { data: message, error } = await supabase
      .from('whatsapp_cloud_messages')
      .select('media_storage_path, media_url')
      .eq('id', messageId)
      .eq('conversation_id', params.id)
      .eq('organization_id', orgId)
      .single()

    if (error || !message) {
      return NextResponse.json(
        { error: 'Message not found' },
        { status: 404, headers: NO_CACHE_HEADERS }
      )
    }

    if (!message.media_storage_path) {
      return NextResponse.json(
        { url: message.media_url },
        { headers: NO_CACHE_HEADERS }
      )
    }

    const { data: signedData, error: signedError } = await supabase.storage
      .from('whatsapp-media')
      .createSignedUrl(message.media_storage_path, SIGNED_URL_EXPIRY)

    if (signedError) {
      console.error('[Media GET] Refresh URL error:', signedError)
      return NextResponse.json(
        { url: message.media_url },
        { headers: NO_CACHE_HEADERS }
      )
    }

    return NextResponse.json({ 
      url: signedData?.signedUrl,
      expiresIn: SIGNED_URL_EXPIRY,
    }, { headers: NO_CACHE_HEADERS })
  } catch (error: any) {
    console.error('[Media GET] Error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: NO_CACHE_HEADERS }
    )
  }
}
