'use client'

import InboxContent from '@/components/whatsapp/inbox/InboxContent'

/**
 * Pagina dedicada da Inbox - renderiza apenas o InboxContent.
 * Sem tabs adicionais; campanhas/agentes/templates vivem em suas proprias paginas.
 */
export default function InboxPage() {
  return <InboxContent height="calc(100vh - 4rem)" />
}
