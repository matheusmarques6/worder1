import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const url = searchParams.get('url')
  const campaignId = searchParams.get('c')
  const contactId = searchParams.get('r')
  const orgId = searchParams.get('o')

  // Registra o clique (dispara e esquece). O segredo interno vai junto —
  // ver o comentário em track/open. Qualquer falha aqui não pode atrapalhar
  // o redirecionamento: quem clicou tem de chegar ao destino.
  if (campaignId && contactId && orgId && url) {
    const secret = process.env.INTERNAL_API_SECRET || process.env.CRON_SECRET
    if (!secret) {
      console.error('[track/click] INTERNAL_API_SECRET/CRON_SECRET ausente: clique não registrado.')
    } else {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://worder1.vercel.app'
        fetch(`${baseUrl}/api/email/track/record`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal': 'true',
            Authorization: `Bearer ${secret}`,
          },
          body: JSON.stringify({ type: 'click', campaignId, contactId, orgId, url }),
        }).catch(() => {})
      } catch {}
    }
  }

  // Redirect to actual URL
  const redirectUrl = url || '/'
  return NextResponse.redirect(redirectUrl, { status: 302 })
}
