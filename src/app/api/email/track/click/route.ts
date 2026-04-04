import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const url = searchParams.get('url')
  const campaignId = searchParams.get('c')
  const contactId = searchParams.get('r')
  const orgId = searchParams.get('o')

  // Record click event (fire and forget)
  if (campaignId && contactId && orgId && url) {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://worder1.vercel.app'
      fetch(`${baseUrl}/api/email/track/record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal': 'true' },
        body: JSON.stringify({ type: 'click', campaignId, contactId, orgId, url }),
      }).catch(() => {})
    } catch {}
  }

  // Redirect to actual URL
  const redirectUrl = url || '/'
  return NextResponse.redirect(redirectUrl, { status: 302 })
}
