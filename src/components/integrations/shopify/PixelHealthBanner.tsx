'use client'

// =============================================
// PixelHealthBanner
//
// Persistent dashboard banner that nags the merchant to install the
// Custom Pixel when their active store is a manual Shopify integration
// without pixel events arriving. Hidden once pixel_installed flips true
// on the server (auto-detected when first event lands).
//
// Polls /api/integrations/shopify/status every 60s for the active store
// and only renders when:
//   - the store is connected (any type)
//   - connection_type === 'manual'
//   - pixelInstalled === false
//   - the user is not already on the install-pixel wizard page
//
// Lightweight by design: a single banner row with a primary CTA.
// =============================================

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useStoreStore } from '@/stores'
import { AlertTriangle, ArrowRight, X } from 'lucide-react'

const DISMISS_KEY = '_worder_pixel_banner_dismissed'
const DISMISS_TTL_MS = 60 * 60 * 1000 // 1h — banner reappears after merchant ignores it

export function PixelHealthBanner() {
  const router = useRouter()
  const pathname = usePathname()
  const { currentStore } = useStoreStore()
  const [needsPixel, setNeedsPixel] = useState(false)
  const [dismissed, setDismissed] = useState(true) // start dismissed to avoid flash

  useEffect(() => {
    // Respect 1h dismiss
    try {
      const v = localStorage.getItem(DISMISS_KEY)
      if (v && Date.now() - parseInt(v, 10) < DISMISS_TTL_MS) {
        setDismissed(true)
        return
      }
      setDismissed(false)
    } catch { setDismissed(false) }
  }, [])

  // Don't show on the wizard itself or auth/onboarding pages
  const onWizard = pathname?.includes('/integrations/shopify/install-pixel')
  const onAuth = pathname?.startsWith('/login') || pathname?.startsWith('/signup') || pathname?.startsWith('/onboarding')

  useEffect(() => {
    if (!currentStore?.id) { setNeedsPixel(false); return }
    let cancelled = false

    async function check() {
      try {
        const res = await fetch(`/api/integrations/shopify/status?store_id=${currentStore!.id}`, { cache: 'no-store' })
        if (!res.ok) return
        const j = await res.json()
        if (cancelled) return
        const isManual = j?.store?.connectionType === 'manual'
        const pixelOk = !!j?.store?.pixelInstalled
        setNeedsPixel(isManual && !pixelOk)
      } catch {
        if (!cancelled) setNeedsPixel(false)
      }
    }
    check()
    const id = setInterval(check, 60_000) // 1 min
    return () => { cancelled = true; clearInterval(id) }
  }, [currentStore?.id])

  if (!needsPixel || dismissed || onWizard || onAuth) return null

  function dismiss() {
    setDismissed(true)
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch {}
  }

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 lg:px-6 py-2.5 flex items-center gap-3">
      <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[12.5px] text-amber-900">
          <strong>Tracking incompleto.</strong>{' '}
          <span className="text-amber-800">
            O Custom Pixel da loja {currentStore?.name ? <strong>{currentStore.name}</strong> : 'ativa'} não está instalado — só pedidos e checkouts são rastreados.
            Browse abandonment, viewed_product e identidade cross-device dependem dele.
          </span>
        </p>
      </div>
      <button
        onClick={() => router.push(`/integrations/shopify/install-pixel?storeId=${currentStore?.id}`)}
        className="px-3 py-1.5 text-[12px] font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-md transition-colors flex items-center gap-1 flex-shrink-0"
      >
        Instalar agora <ArrowRight className="w-3 h-3" />
      </button>
      <button
        onClick={dismiss}
        className="p-1 text-amber-700 hover:text-amber-900 hover:bg-amber-100 rounded transition-colors flex-shrink-0"
        title="Lembrar daqui 1h"
        aria-label="Dispensar"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
