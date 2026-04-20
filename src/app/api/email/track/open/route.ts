import { NextRequest } from 'next/server'

export const runtime = 'edge'

// Return a 1x1 transparent GIF
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const campaignId = searchParams.get('c')
  const contactId = searchParams.get('r')
  const orgId = searchParams.get('o')

  // Record open event (fire and forget)
  if (campaignId && contactId && orgId) {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://worder1.vercel.app'
      fetch(`${baseUrl}/api/email/track/record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal': 'true' },
        body: JSON.stringify({ type: 'open', campaignId, contactId, orgId }),
      }).catch(() => {})
    } catch {}
  }

  return new Response(PIXEL, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  })
}
