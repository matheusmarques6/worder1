'use client'

// =============================================
// WORDER: Chat → Inbox redirect
//
// A funcionalidade de chat foi unificada com o inbox.
// Este redirect garante que links/bookmarks antigos continuem funcionando.
// =============================================

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function ChatRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/inbox')
  }, [router])

  return (
    <div className="flex items-center justify-center py-32">
      <div className="text-center">
        <Loader2 className="w-6 h-6 animate-spin text-orange-500 mx-auto mb-3" />
        <p className="text-sm text-gray-500">Redirecionando para o Inbox...</p>
      </div>
    </div>
  )
}
