import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { buildMediaUrl } from '@/lib/media/public-url'

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()

    const formData = await req.formData()
    const file = formData.get('file') as File
    const storeId = formData.get('store_id') as string | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ error: 'Tipo não permitido. Use JPG, PNG, GIF, WebP ou SVG.' }, { status: 400 })
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Imagem muito grande. Máximo 10MB.' }, { status: 400 })
    }

    const ext = file.name.split('.').pop() || 'png'
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

    // Path: {org_id}/store_{store_id}/{file} or {org_id}/{file}
    const folder = storeId
      ? `${auth.user.organization_id}/store_${storeId}`
      : auth.user.organization_id
    const fileName = `${folder}/${uniqueName}`

    const buffer = Buffer.from(await file.arrayBuffer())

    // Cache for a year. Gmail's image proxy honours Cache-Control on
    // its very first fetch and serves every subsequent open from its
    // own CDN. Without this header Supabase Storage returns a default
    // of about 3600s, so a recipient who opens the email the next day
    // forces Gmail to round-trip Supabase again — and on mobile that
    // round-trip is what shows up as the "broken image" icon when the
    // proxy times out. The file name is unique per upload so we never
    // need to bust the cache.
    const { error: uploadError } = await supabaseAdmin.storage
      .from('email-images')
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: false,
        cacheControl: '31536000, immutable',
      })

    if (uploadError) {
      console.error('[ImageUpload] Storage error:', uploadError)
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    // A URL salva no template é a canônica da CDN (cdn.worder.email):
    // /render/image para raster — redimensionada para a largura do
    // e-mail, WebP quando o cliente aceita, cacheada na borda — e
    // /object para SVG/GIF, que o transformador não processa. A mesma
    // regra da biblioteca de mídia; ver src/lib/media/public-url.ts.
    const { data: rawUrlData } = supabaseAdmin.storage.from('email-images').getPublicUrl(fileName)
    const primaryUrl = buildMediaUrl(fileName) || rawUrlData.publicUrl

    return NextResponse.json({
      url: primaryUrl,
      url_original: rawUrlData.publicUrl,
      fileName: file.name,
      size: file.size,
      storage_path: fileName,
    })
  } catch (e: any) {
    console.error('[ImageUpload] Error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
