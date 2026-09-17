'use client'

// Configurações — layout. Aplica o design system das configurações
// (settings.css), o tema claro/escuro e a casca com navegação em grupos.
// O -m-4/-m-6 cancela o padding do dashboard para a área ocupar a página.

import './settings.css'
import { useEffect, useState } from 'react'
import SettingsShell from '@/components/settings/SettingsShell'
import { SettingsThemeProvider, type Theme } from '@/components/settings/theme'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const [profileTheme, setProfileTheme] = useState<Theme | null>(null)

  // Preferência de tema salva no perfil (para seguir o usuário entre aparelhos).
  useEffect(() => {
    let cancelled = false
    fetch('/api/settings/account', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return
        const t = d?.profile?.preferences?.theme
        if (t === 'light' || t === 'dark' || t === 'system') setProfileTheme(t)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  return (
    <div className="-m-4 lg:-m-6">
      <SettingsThemeProvider initial={profileTheme}>
        <SettingsShell>{children}</SettingsShell>
      </SettingsThemeProvider>
    </div>
  )
}
