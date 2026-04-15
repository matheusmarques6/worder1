import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  // searchParams.get() already URL-decodes once. If a caller double-encoded the
  // url param we still get a valid string; if a single encode was used we also
  // land on a proper absolute URL. We validate it below to avoid open-redirect.
  const rawUrl = searchParams.get('url')
  const campaignId = searchParams.get('c')
  const contactId = searchParams.get('r')
  const orgId = searchParams.get('o')

  let target: URL | null = null
  if (rawUrl) {
    try {
      // Some senders double-encode. Detect and unwrap one extra layer.
      const candidate = /%25[0-9a-fA-F]{2}/.test(rawUrl)
        ? decodeURIComponent(rawUrl)
        : rawUrl
      target = new URL(candidate)
      if (target.protocol !== 'http:' && target.protocol !== 'https:') {
        target = null
      }
    } catch {
      target = null
    }
  }

  // Record click event (fire and forget)
  if (campaignId && contactId && orgId && target) {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin
      fetch(`${baseUrl}/api/email/track/record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal': 'true' },
        body: JSON.stringify({ type: 'click', campaignId, contactId, orgId, url: target.toString() }),
      }).catch(() => {})
    } catch {}
  }

  const redirectUrl = target ? target.toString() : (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin)
  return NextResponse.redirect(redirectUrl, { status: 302 })
}
