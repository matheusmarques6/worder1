import { NextRequest } from 'next/server'

export const runtime = 'edge'

// Return a 1x1 transparent GIF
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const campaignId = searchParams.get('c')
  const contactId = searchParams.get('r')
  const orgId = searchParams.get('o')

  // Registra a abertura (dispara e esquece).
  //
  // O segredo interno vai no cabeçalho: /record grava estatística a partir
  // do que recebe, e o trio de uuids (campanha, contato, organização) viaja
  // em toda URL de rastreamento — ou seja, está nas mãos de qualquer
  // destinatário. Sem segredo, dava para inflar as aberturas da própria
  // loja com um curl.
  if (campaignId && contactId && orgId) {
    const secret = process.env.INTERNAL_API_SECRET || process.env.CRON_SECRET
    if (!secret) {
      // Sem segredo, /record recusa. Melhor dizer por que o rastreamento
      // parou do que deixar a requisição bater na porta e ser negada.
      console.error('[track/open] INTERNAL_API_SECRET/CRON_SECRET ausente: abertura não registrada.')
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
          body: JSON.stringify({ type: 'open', campaignId, contactId, orgId }),
        }).catch(() => {})
      } catch {}
    }
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
