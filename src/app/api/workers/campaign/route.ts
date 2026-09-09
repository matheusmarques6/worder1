// =============================================
// /api/workers/campaign — aposentado.
//
// Este era o disparador de campanhas de WhatsApp da primeira geração.
// Ele não é chamado por nada: não está nos crons do vercel.json, e o
// envio de verdade passa por WhatsAppCampaignProcessor (fila + lotes +
// limite por segundo + guarda de opt-out + qualidade do número).
//
// Ficar de pé, porém, era um risco de três frentes:
//
//  1. o segredo tinha reserva embutida no código
//     (`process.env.CRON_SECRET || 'worder-cron-secret'`): num ambiente
//     sem CRON_SECRET, quem conhecesse essa string disparava campanha;
//  2. ele falava o vocabulário antigo de status ('RUNNING', 'SCHEDULED')
//     e tratava whatsapp_campaign_logs como fila de envio — hoje essa
//     tabela é o histórico de eventos da campanha, e o estado por
//     destinatário vive em whatsapp_campaign_recipients;
//  3. se alguém o religasse seguindo a documentação antiga, as duas
//     máquinas mandariam a mesma campanha ao mesmo tempo.
//
// Responder 410 é mais honesto do que apagar: quem seguir o doc antigo
// recebe a explicação em vez de um 404 sem contexto.
// =============================================
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const AVISO = {
  error: 'Endpoint aposentado',
  detail:
    'O envio de campanhas de WhatsApp é feito por WhatsAppCampaignProcessor (fila e lotes). ' +
    'Este worker da primeira geração falava um vocabulário de status que não existe mais e ' +
    'religá-lo causaria envio duplicado.',
}

export async function POST() {
  return NextResponse.json(AVISO, { status: 410 })
}

export async function GET() {
  return NextResponse.json(AVISO, { status: 410 })
}
