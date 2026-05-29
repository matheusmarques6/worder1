'use client'

// =============================================
// WhatsApp Health Dashboard — STUB (Onda 4)
// TODO Onda 4.5:
//   - Listar todas WABA (whatsapp_business_accounts) da org com:
//     * subscribed_apps (verificar live via Graph API)
//     * registered (status do phone number)
//     * last_webhook_at (max(received_at) em whatsapp_webhook_events)
//     * messaging_limit_tier / quality_rating
//   - Refresh ao vivo (revalidate a cada 30s)
//   - Botão "re-subscribe" se subscribed_apps vazio
// =============================================

export default function WhatsAppHealthPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-2">WhatsApp Health (em construção)</h1>
      <p className="text-gray-600">
        TODO: lista de WABA com subscribed_apps + registered + last_webhook_at ao vivo. Onda 4.5.
      </p>
    </div>
  )
}
