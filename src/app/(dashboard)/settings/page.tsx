'use client'

// =============================================
// WORDER: /settings → redirect pra /settings/email
// Unifica a experiência — settings de email vivem em /settings/email.
// =============================================

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function SettingsRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/settings/email')
  }, [router])

  return (
    <div className="flex items-center justify-center py-32">
      <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
    </div>
  )
}
