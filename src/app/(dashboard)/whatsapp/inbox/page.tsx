'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import InboxContent from '@/components/whatsapp/inbox/InboxContent'

/**
 * Pagina dedicada da Inbox - renderiza apenas o InboxContent.
 * Sem tabs adicionais; campanhas/agentes/templates vivem em suas proprias paginas.
 */
export default function InboxPage() {
  return <Suspense fallback={null}><InboxRoute /></Suspense>
}

function InboxRoute() {
  const contact = useSearchParams()?.get('contact')
  return <InboxContent height="calc(100vh - 4rem)" requestedContact={contact} />
}
