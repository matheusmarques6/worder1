import { redirect } from 'next/navigation'

/**
 * /whatsapp -> /whatsapp/inbox
 *
 * O hub do WhatsApp agora eh organizado em paginas dedicadas no sidebar:
 *  - /whatsapp/inbox       (caixa de entrada)
 *  - /whatsapp/campaigns   (campanhas)
 *  - /whatsapp/templates   (templates Cloud API)
 *  - /whatsapp/ai-agents   (agentes IA + API keys)
 *  - /whatsapp/flows       (fluxos)
 *  - /whatsapp/phonebooks  (listas)
 *  - /whatsapp/settings    (configuracoes)
 */
export default function WhatsAppRootPage() {
  redirect('/whatsapp/inbox')
}
