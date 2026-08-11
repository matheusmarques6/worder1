'use client'

// A casa dos agentes mudou: /whatsapp/ai-agents → /ai (IA Hub, doc §4.1).
// A rota antiga vive como redirect para não quebrar favoritos e deep links
// (?tab= é preservado; os ids de aba antigos continuam válidos no hub).

import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'

const TAB_ALIASES: Record<string, string> = {
  agents: 'agents',
  reports: 'reports',
  eval: 'eval',
  knowledge: 'knowledge',
  'api-keys': 'api-keys',
}

function LegacyRedirectInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const tab = searchParams?.get('tab')
    const mapped = tab ? TAB_ALIASES[tab] : undefined
    router.replace(mapped ? `/ai?tab=${mapped}` : '/ai')
  }, [router, searchParams])

  return (
    <div className="h-screen flex items-center justify-center bg-white">
      <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
    </div>
  )
}

export default function LegacyAiAgentsRedirect() {
  return (
    <Suspense fallback={null}>
      <LegacyRedirectInner />
    </Suspense>
  )
}
