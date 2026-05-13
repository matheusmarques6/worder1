import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'

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

    // Default response uses the transform/CDN endpoint so the URL
    // saved into email templates is the optimised one — auto-resized
    // to email width, served as WebP when supported, cached at the
    // edge. The raw /object/public URL is too slow for Gmail's image
    // proxy on mobile (broken-image icons). render-html rewriter
    // also catches legacy templates that still reference the raw URL.
    //
    // When CDN_IMAGES_DOMAIN is set, the returned URL swaps the
    // Supabase host for the Cloudflare-proxied CDN host. Same
    // /render/image path — Cloudflare CNAMEs straight at Supabase
    // and caches everything for a year, so subsequent fetches
    // from Gmail proxy hit the Cloudflare edge instead of the
    // Supabase origin.
    const { data: rawUrlData } = supabaseAdmin.storage.from('email-images').getPublicUrl(fileName)
    const { data: transformUrlData } = supabaseAdmin.storage.from('email-images').getPublicUrl(fileName, {
      transform: {
        width: 1200,
        quality: 85,
      },
    })

    const cdnDomain = (process.env.CDN_IMAGES_DOMAIN || '')
      .replace(/^https?:\/\//i, '')
      .replace(/\/+$/, '')
      .trim()
    const primaryUrl = cdnDomain
      ? (transformUrlData?.publicUrl || rawUrlData.publicUrl).replace(
          /https:\/\/[a-z0-9-]+\.supabase\.co/i,
          `https://${cdnDomain}`
        )
      : transformUrlData?.publicUrl || rawUrlData.publicUrl

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
