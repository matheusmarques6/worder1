'use client'

// /ai virou casca com sub-rotas (plano IA, M2 passo 16). Links antigos
// (?tab=…) continuam aterrissando no lugar certo (resolveLegacyAiTab).

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { resolveLegacyAiTab } from '@/components/ai-hub/AiShell'

function RedirectInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  useEffect(() => {
    router.replace(resolveLegacyAiTab(searchParams?.get('tab')))
  }, [router, searchParams])
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-3)' }} />
    </div>
  )
}

export default function AiIndexPage() {
  return (
    <Suspense fallback={null}>
      <RedirectInner />
    </Suspense>
  )
}
