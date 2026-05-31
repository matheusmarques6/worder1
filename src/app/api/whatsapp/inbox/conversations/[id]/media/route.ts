import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { requireOrgFromAuth } from '@/lib/auth/require-org'
import { createWhatsAppCloudClient } from '@/lib/whatsapp/cloud-api'
import { getAccessToken } from '@/lib/whatsapp/account-loader'

// ✅ FASE 3: Force dynamic para evitar cache
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Headers padrão sem cache
const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
}

// ✅ FASE 2: SEM FALLBACK HARDCODED
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY

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

function getEvolutionConfig(instance?: any) {
  const apiUrl = instance?.api_url || instance?.server_url || EVOLUTION_API_URL
  const apiKey = instance?.api_key || EVOLUTION_API_KEY
  if (!apiUrl || !apiKey) return null
  return { apiUrl, apiKey }
}

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
      const client = createWhatsAppCloudClient({
        phoneNumberId: cloudConv.account.phone_number_id,
        accessToken: getAccessToken(cloudConv.account),
      })

      const phoneNumber = cloudConv.contact_phone || cloudConv.wa_id

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

    // ✅ FASE 3: Buscar conversa COM instance_id e store_id
    const { data: conversation, error: convError } = await supabase
      .from('whatsapp_conversations')
      .select('*, instance_id, store_id, contact_phone, phone_number, organization_id')
      .eq('id', conversationId)
      .eq('organization_id', orgId)
      .single()

    if (convError || !conversation) {
      console.error('[Media POST] Conversation not found:', conversationId)
      return NextResponse.json(
        { error: 'Conversation not found', success: false },
        { status: 404, headers: NO_CACHE_HEADERS }
      )
    }

    // ✅ FASE 3: Verificar se conversa tem instance_id
    if (!conversation.instance_id) {
      console.error('[Media POST] Conversa sem instance_id:', {
        conversation_id: conversationId,
        store_id: conversation.store_id
      })
      return NextResponse.json(
        { error: 'Conversa não tem instância associada. Reabra a conversa.', success: false },
        { status: 400, headers: NO_CACHE_HEADERS }
      )
    }

    // ✅ FASE 3: Buscar instância ESPECÍFICA da conversa
    const { data: instance, error: instError } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('id', conversation.instance_id)
      .single()

    if (instError || !instance) {
      console.error('[Media POST] Instância não encontrada:', {
        instance_id: conversation.instance_id,
        conversation_id: conversationId
      })
      return NextResponse.json(
        { error: 'Instância WhatsApp não encontrada', success: false },
        { status: 404, headers: NO_CACHE_HEADERS }
      )
    }

    // ✅ FASE 3: Validar que store_id bate
    if (conversation.store_id && instance.store_id && conversation.store_id !== instance.store_id) {
      console.error('[Media POST] Store mismatch:', {
        conversation_store: conversation.store_id,
        instance_store: instance.store_id
      })
      return NextResponse.json(
        { error: 'Instância não pertence à mesma loja da conversa', success: false },
        { status: 403, headers: NO_CACHE_HEADERS }
      )
    }

    // ✅ FASE 3: Validar que instância está conectada
    const connectedStatuses = ['connected', 'ACTIVE', 'open']
    if (!connectedStatuses.includes(instance.status?.toLowerCase())) {
      console.error('[Media POST] Instância desconectada:', {
        instance_id: instance.id,
        status: instance.status
      })
      return NextResponse.json(
        { error: `Instância WhatsApp não está conectada (status: ${instance.status})`, success: false },
        { status: 400, headers: NO_CACHE_HEADERS }
      )
    }

    // ✅ FASE 3: Verificar config sem fallback
    const config = getEvolutionConfig(instance)
    if (!config) {
      return NextResponse.json({ 
        error: 'Evolution API not configured. Set EVOLUTION_API_URL and EVOLUTION_API_KEY.',
        success: false 
      }, { status: 503, headers: NO_CACHE_HEADERS })
    }

    const instanceName = instance.unique_id || instance.instance_name || instance.instance_id
    const phoneNumber = conversation.contact_phone || conversation.phone_number

    // ✅ FASE 3: Log detalhado
    console.log('[Media POST] Enviando mídia:', {
      conversation_id: conversationId,
      store_id: conversation.store_id,
      instance_id: instance.id,
      instance_name: instanceName,
      instance_status: instance.status,
      to: phoneNumber,
      media_type: mediaType,
      file_name: file.name,
      file_size: file.size
    })

    // Converter arquivo
    const buffer = Buffer.from(await file.arrayBuffer())
    const base64 = buffer.toString('base64')

    // Upload para Storage
    let mediaUrl = null
    let storagePath = null

    try {
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
      const ext = sanitizedName.split('.').pop() || file.type.split('/')[1] || 'bin'
      const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
      
      storagePath = `${conversation.organization_id}/${conversationId}/${uniqueId}.${ext}`
      
      const { error: uploadError } = await supabase.storage
        .from('whatsapp-media')
        .upload(storagePath, buffer, {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
          cacheControl: '3600',
        })

      if (!uploadError) {
        // ✅ Usar Signed URL (mais seguro)
        const { data: signedData, error: signedError } = await supabase.storage
          .from('whatsapp-media')
          .createSignedUrl(storagePath, SIGNED_URL_EXPIRY)

        if (!signedError && signedData?.signedUrl) {
          mediaUrl = signedData.signedUrl
        } else {
          // Fallback para URL pública
          const { data: publicData } = supabase.storage
            .from('whatsapp-media')
            .getPublicUrl(storagePath)
          mediaUrl = publicData?.publicUrl
        }
        
        console.log('[Media POST] ✅ Uploaded to storage:', storagePath)
      }
    } catch (storageError) {
      console.error('[Media POST] Storage error:', storageError)
    }

    // Enviar via Evolution API
    let endpoint = ''
    let payload: any = { number: phoneNumber }

    if (mediaType === 'image' || mediaType === 'video') {
      endpoint = `/message/sendMedia/${instanceName}`
      payload.mediatype = mediaType
      payload.media = `data:${file.type};base64,${base64}`
      payload.fileName = file.name
      if (caption) payload.caption = caption
    } else if (mediaType === 'audio') {
      endpoint = `/message/sendWhatsAppAudio/${instanceName}`
      // Usar o tipo real do arquivo (pode ser webm, ogg, mp3, etc)
      payload.audio = `data:${file.type || 'audio/ogg'};base64,${base64}`
    } else {
      endpoint = `/message/sendMedia/${instanceName}`
      payload.mediatype = 'document'
      payload.media = `data:${file.type};base64,${base64}`
      payload.fileName = file.name
      if (caption) payload.caption = caption
    }

    console.log('[Media POST] Sending to Evolution:', endpoint)

    const sendResponse = await fetch(`${config.apiUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': config.apiKey },
      body: JSON.stringify(payload),
    })

    const sendData = await sendResponse.json()
    
    // ✅ FASE 3: Log detalhado da resposta
    if (!sendResponse.ok) {
      console.error('[Media POST] Evolution API error:', {
        status: sendResponse.status,
        response: sendData,
        instance: instanceName,
        endpoint
      })
    } else {
      console.log('[Media POST] ✅ Enviado com sucesso:', sendData?.key?.id)
    }

    // Salvar no banco
    const { data: saved, error: saveError } = await supabase
      .from('whatsapp_messages')
      .insert({
        organization_id: conversation.organization_id,
        store_id: conversation.store_id,
        instance_id: instance.id,
        conversation_id: conversationId,
        message_id: sendData?.key?.id || `media-${Date.now()}`,
        direction: 'outbound',
        message_type: mediaType,
        content: caption || '',
        text_body: '',
        to_number: phoneNumber,
        status: sendResponse.ok ? 'sent' : 'failed',
        media_url: mediaUrl,
        media_filename: file.name,
        media_mime_type: file.type,
        media_storage_path: storagePath,
        timestamp: new Date().toISOString(),
      })
      .select()
      .single()

    if (saveError) {
      console.error('[Media POST] Save error:', saveError)
    }

    // Atualizar conversa
    const preview = caption?.substring(0, 50) || 
      (mediaType === 'image' ? '📷 Imagem' : 
       mediaType === 'video' ? '🎬 Vídeo' : 
       mediaType === 'audio' ? '🎵 Áudio' : `📎 ${file.name}`)

    await supabase.from('whatsapp_conversations').update({
      last_message_at: new Date().toISOString(),
      last_message_preview: preview,
      last_message_direction: 'outbound',
      updated_at: new Date().toISOString(),
    }).eq('id', conversationId)

    // Resposta
    const responseMessage = saved ? {
      id: saved.id,
      conversation_id: saved.conversation_id,
      direction: saved.direction,
      message_type: saved.message_type,
      content: saved.content || caption,
      media_url: saved.media_url,
      media_filename: saved.media_filename,
      media_mime_type: saved.media_mime_type,
      status: saved.status,
      sent_by_bot: false,
      created_at: saved.created_at,
    } : null

    return NextResponse.json({ 
      message: responseMessage,
      success: sendResponse.ok,
      ...(sendResponse.ok ? {} : { error: 'Failed to send via Evolution API', evolution_error: sendData })
    }, { headers: NO_CACHE_HEADERS })

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
      .from('whatsapp_messages')
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
