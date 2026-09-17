// =============================================
// GET /api/t/ping — "este host é o Worder?"
//
// Existe por causa de uma falha que matou TODOS os links de TODOS os
// e-mails sem nenhum aviso: o domínio de rastreamento estava apontado
// para o Resend (o subdomínio de click tracking dele), não para o app.
// O Resend respondia 400 para /api/t/c/… e cada clique do cliente
// terminava numa página de erro.
//
// O domínio dos links é a única peça do envio que mora FORA do nosso
// controle (é um CNAME que alguém configura), e por isso precisa de um
// jeito de perguntar "quem está atendendo aqui?". Esta rota é a
// resposta: 200 com uma marca nossa. Qualquer outra coisa — 400 do
// Resend, página de parking, 404 — significa que os links do e-mail
// estão mortos.
//
// Sem banco, sem sessão, sem custo: é sondada de fora.
// =============================================
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json(
    { worder: true, service: 'tracking' },
    { headers: { 'Cache-Control': 'no-store', 'X-Worder-Tracking': '1' } },
  )
}
