// Notificações do usuário (Configurações → Notificações).
// Matriz evento × canal (e-mail, WhatsApp) guardada em
// profiles.preferences.notifications = { [evento]: { email: bool, whatsapp: bool } }.

export const NOTIFICATION_EVENTS = [
  { key: 'weekly_digest', title: 'Resumo semanal de desempenho', help: 'Toda segunda, 8h', email: true, whatsapp: true },
  { key: 'campaign_sent', title: 'Campanha enviada', help: 'Confirmação com primeiros resultados', email: true, whatsapp: false },
  { key: 'automation_error', title: 'Erro em automação', help: 'Fluxo pausado ou etapa com falha', email: true, whatsapp: true },
  { key: 'plan_limit', title: 'Limite do plano próximo', help: '80% de e-mails ou contatos', email: true, whatsapp: true },
  { key: 'inbox_new', title: 'Nova conversa no Inbox', help: 'Cliente aguardando resposta no WhatsApp', email: false, whatsapp: true },
  { key: 'invoice', title: 'Fatura disponível', help: 'Emissão e cobrança', email: true, whatsapp: false },
] as const

export type NotificationKey = (typeof NOTIFICATION_EVENTS)[number]['key']
export type NotificationChannel = 'email' | 'whatsapp'
export type NotificationMatrix = Record<NotificationKey, Record<NotificationChannel, boolean>>

export function defaultNotifications(): NotificationMatrix {
  const out: any = {}
  for (const e of NOTIFICATION_EVENTS) out[e.key] = { email: e.email, whatsapp: e.whatsapp }
  return out
}

/** Mescla o que está salvo com os padrões (eventos novos entram ligados como no padrão). */
export function normalizeNotifications(saved: any): NotificationMatrix {
  const base = defaultNotifications()
  if (!saved || typeof saved !== 'object') return base
  for (const e of NOTIFICATION_EVENTS) {
    const s = saved[e.key]
    if (s && typeof s === 'object') {
      if (typeof s.email === 'boolean') base[e.key].email = s.email
      if (typeof s.whatsapp === 'boolean') base[e.key].whatsapp = s.whatsapp
    }
  }
  return base
}
