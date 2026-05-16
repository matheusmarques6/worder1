'use client'

// =============================================
// WORDER: useCapability — client-side RBAC gating
// /hooks/useCapability.ts
//
// Reads /api/me/capabilities once per session (sessionStorage-cached
// for the org) and exposes a hook so any component can do:
//
//   const { can } = useCapability()
//   if (!can('campaigns:send')) return null
//
// Or for a single check:
//   const canSend = useCan('campaigns:send')
//
// The gate is purely cosmetic — security is enforced server-side
// by requireCapability(). But hiding buttons agents can't click
// avoids the "I clicked and got 403" rage moment.
// =============================================

import { useEffect, useState, useCallback } from 'react'
import type { Capability } from '@/lib/auth/permissions'

interface MeResponse {
  role: string | null
  capabilities: string[]
  organizationId: string
}

let cached: MeResponse | null = null
let pending: Promise<MeResponse | null> | null = null

async function fetchMe(): Promise<MeResponse | null> {
  if (cached) return cached
  if (pending) return pending
  pending = (async () => {
    try {
      const res = await fetch('/api/me/capabilities', { cache: 'no-store' })
      if (!res.ok) return null
      const json = (await res.json()) as MeResponse
      cached = json
      try {
        sessionStorage.setItem('wd:me', JSON.stringify(json))
      } catch {}
      return json
    } catch {
      return null
    } finally {
      pending = null
    }
  })()
  return pending
}

export function useCapability() {
  const [me, setMe] = useState<MeResponse | null>(() => {
    if (cached) return cached
    // Cold-start optimistic load from sessionStorage so the first
    // render doesn't flicker buttons.
    try {
      const raw = sessionStorage.getItem('wd:me')
      if (raw) return JSON.parse(raw) as MeResponse
    } catch {}
    return null
  })

  useEffect(() => {
    if (me) return
    fetchMe().then((data) => {
      if (data) setMe(data)
    })
  }, [me])

  const can = useCallback(
    (capability: Capability): boolean => {
      if (!me) return true // optimistic until we know — server still enforces
      if (me.role === 'owner') return true
      return me.capabilities.includes(capability)
    },
    [me]
  )

  return {
    role: me?.role || null,
    capabilities: me?.capabilities || [],
    can,
    loaded: !!me,
  }
}

/** Shorthand for components that only check one capability. */
export function useCan(capability: Capability): boolean {
  const { can } = useCapability()
  return can(capability)
}
