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

  // Redireciona — só para http(s).
  //
  // Antes o destino ia direto do parâmetro para o cabeçalho Location, sem
  // olhar o esquema: `javascript:`, `data:` e afins saíam num redirect
  // partindo do NOSSO domínio. Os navegadores modernos barram a maioria,
  // mas emprestar o domínio de rastreamento para isso é o que transforma
  // um host de marca em ferramenta de phishing — e o host de rastreamento
  // é justamente o que estamos passando a usar em todo e-mail.
  //
  // Esta rota é da primeira geração: nada mais gera link para ela, mas
  // e-mails antigos na caixa de entrada de alguém ainda podem ter. Por
  // isso ela continua respondendo, só que sem seguir esquema estranho.
  const destino = url && /^https?:\/\//i.test(url) ? url : null
  if (!destino) {
    if (url) console.warn('[track/click] destino recusado (esquema não http):', url.slice(0, 80))
    return NextResponse.redirect(new URL('/', req.nextUrl.origin), { status: 302 })
  }
  return NextResponse.redirect(destino, { status: 302 })
}
