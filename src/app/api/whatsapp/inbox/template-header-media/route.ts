// =============================================
// API: POST /api/whatsapp/inbox/template-header-media
//
// Sobe um arquivo para o Supabase Storage (bucket whatsapp-media) e
// devolve uma signed URL de 24h para uso como header de midia em
// envio de template (Meta baixa a midia no momento do envio, entao
// a URL so precisa estar viva no send).
//
// FormData: { file: File, mediaType: 'image'|'video'|'document' }
// 200: { url, path } | 400: { error }
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { requireOrgFromAuth } from '@/lib/auth/require-org'
import { validateWhatsAppMediaFile } from '@/lib/whatsapp/media-validation'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const NO_CACHE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' }
const SIGNED_URL_EXPIRY = 24 * 3600 // 24h — envio acontece logo apos o upload
const HEADER_MEDIA_TYPES = ['image', 'video', 'document']

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const { orgId } = auth

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const mediaType = (formData.get('mediaType') as string) || 'image'

    if (!file) {
      return NextResponse.json({ error: 'Arquivo obrigatorio (file)' }, { status: 400, headers: NO_CACHE_HEADERS })
    }
    if (!HEADER_MEDIA_TYPES.includes(mediaType)) {
      return NextResponse.json(
        { error: `mediaType invalido. Use: ${HEADER_MEDIA_TYPES.join(', ')}` },
        { status: 400, headers: NO_CACHE_HEADERS },
      )
    }

    const validation = validateWhatsAppMediaFile(file, mediaType)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400, headers: NO_CACHE_HEADERS })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const ext = sanitizedName.split('.').pop() || file.type.split('/')[1] || 'bin'
    const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    const storagePath = `${orgId}/template-headers/${uniqueId}.${ext}`

    const { error: upErr } = await supabase.storage
      .from('whatsapp-media')
      .upload(storagePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
        cacheControl: '3600',
      })
    if (upErr) {
      console.error('[template-header-media] storage error:', upErr)
      return NextResponse.json(
        { error: 'Falha ao subir arquivo para o storage' },
        { status: 500, headers: NO_CACHE_HEADERS },
      )
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from('whatsapp-media')
      .createSignedUrl(storagePath, SIGNED_URL_EXPIRY)
    if (signErr || !signed?.signedUrl) {
      console.error('[template-header-media] sign error:', signErr)
      return NextResponse.json(
        { error: 'Falha ao gerar URL assinada' },
        { status: 500, headers: NO_CACHE_HEADERS },
      )
    }

    return NextResponse.json(
      { url: signed.signedUrl, path: storagePath },
      { headers: NO_CACHE_HEADERS },
    )
  } catch (e: any) {
    console.error('[template-header-media] unhandled:', e)
    return NextResponse.json(
      { error: 'Internal server error', details: e?.message ?? String(e) },
      { status: 500, headers: NO_CACHE_HEADERS },
    )
  }
}
