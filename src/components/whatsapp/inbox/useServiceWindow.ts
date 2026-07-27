'use client'

import { useEffect, useState } from 'react'
import {
  getServiceWindowStatus,
  isServiceWindowOpen,
  type ServiceWindowStatus,
} from '@/lib/whatsapp/service-window'

export interface ServiceWindowState {
  status: ServiceWindowStatus
  isOpen: boolean
}

/**
 * Estado reativo da janela de 24h: re-deriva a cada 30s (mesmo padrao de tick
 * do ServiceWindowBar), entao o composer bloqueia sozinho quando a janela
 * expira com a tela aberta — sem reload.
 */
export function useServiceWindow(
  expiresAt: string | null | undefined,
  canSendTemplateOnly?: boolean,
): ServiceWindowState {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(interval)
  }, [])

  // Troca de conversa (ou janela reaberta pelo webhook) re-sincroniza na hora.
  useEffect(() => {
    setNow(Date.now())
  }, [expiresAt])

  const status = getServiceWindowStatus(expiresAt, now)
  const isOpen = canSendTemplateOnly !== true && isServiceWindowOpen(expiresAt, now)

  return { status, isOpen }
}
