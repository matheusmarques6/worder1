'use client'

// Tema das Configurações: claro / escuro / sistema.
// Guardado no navegador (efeito imediato, sem piscar) e no perfil
// (profiles.preferences.theme) para acompanhar o usuário entre aparelhos.
// A convenção é a mesma dos artifacts: `data-theme` no <html>; no modo
// "sistema" o atributo sai e vale o prefers-color-scheme.

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark' | 'system'
const KEY = 'worder-theme'

function readStored(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch { /* sem storage */ }
  return 'light'
}

export function applyTheme(t: Theme) {
  const root = document.documentElement
  if (t === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', t)
}

interface Ctx { theme: Theme; setTheme: (t: Theme, persist?: boolean) => void; resolved: 'light' | 'dark' }
const ThemeCtx = createContext<Ctx | null>(null)

export function SettingsThemeProvider({ children, initial }: { children: ReactNode; initial?: Theme | null }) {
  const [theme, setThemeState] = useState<Theme>('light')
  const [systemDark, setSystemDark] = useState(false)

  // Antes de pintar: aplica o que está no navegador (sem piscar).
  useLayoutEffect(() => {
    const t = readStored()
    setThemeState(t)
    applyTheme(t)
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    setSystemDark(!!mq?.matches)
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq?.addEventListener?.('change', onChange)
    return () => mq?.removeEventListener?.('change', onChange)
  }, [])

  // Preferência vinda do perfil (outro aparelho) vence a do navegador
  // quando o navegador ainda não tem nada gravado.
  useEffect(() => {
    if (!initial) return
    let stored: string | null = null
    try { stored = localStorage.getItem(KEY) } catch { /* ignore */ }
    if (!stored && (initial === 'light' || initial === 'dark' || initial === 'system')) {
      setThemeState(initial)
      applyTheme(initial)
      try { localStorage.setItem(KEY, initial) } catch { /* ignore */ }
    }
  }, [initial])

  const setTheme = useCallback((t: Theme, persist = true) => {
    setThemeState(t)
    applyTheme(t)
    try { localStorage.setItem(KEY, t) } catch { /* ignore */ }
    if (persist) {
      fetch('/api/settings/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'preferences', preferences: { theme: t } }),
      }).catch(() => {})
    }
  }, [])

  const value = useMemo<Ctx>(() => ({
    theme,
    setTheme,
    resolved: theme === 'system' ? (systemDark ? 'dark' : 'light') : theme,
  }), [theme, setTheme, systemDark])

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>
}

export function useSettingsTheme(): Ctx {
  const ctx = useContext(ThemeCtx)
  if (!ctx) return { theme: 'light', setTheme: () => {}, resolved: 'light' }
  return ctx
}
