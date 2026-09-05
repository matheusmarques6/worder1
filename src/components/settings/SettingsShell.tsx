'use client'

// Casca das Configurações — cabeçalho com busca, pílulas no celular,
// navegação em grupos à esquerda (fixa) e a tela ativa à direita.
// Fiel ao desenho: .st-wrap / .st-head / .mobnav / .st-body / .st-nav.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useStoreStore } from '@/stores'
import { I } from './icons'
import { SETTINGS_NAV, activeSettingsItem } from './nav'
import { useSettingsTheme } from './theme'

export default function SettingsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || ''
  const { currentStore } = useStoreStore()
  const { theme } = useSettingsTheme()
  const [q, setQ] = useState('')
  const mob = useRef<HTMLDivElement | null>(null)
  const active = activeSettingsItem(pathname)

  // Centraliza a pílula ativa no celular.
  useEffect(() => {
    const mn = mob.current
    if (!mn) return
    const el = mn.querySelector<HTMLElement>('.on')
    if (el) mn.scrollLeft = Math.max(0, el.offsetLeft - 16)
  }, [pathname])

  const ql = q.trim().toLowerCase()
  const groups = useMemo(
    () => SETTINGS_NAV
      .map((g) => ({
        ...g,
        items: g.items.filter((it) => !ql || it.label.toLowerCase().includes(ql) || (it.kw || []).some((k) => k.includes(ql)) || g.group.toLowerCase().includes(ql)),
      }))
      .filter((g) => g.items.length),
    [ql]
  )

  const storeName = (currentStore as any)?.name || (currentStore as any)?.shop_name || ''

  return (
    <div className={'wset' + (theme === 'system' ? ' system' : '')}>
      <div className="st-wrap">
        <div className="st-head">
          <div>
            <h1>Configurações</h1>
            <p>Conta, envio, dados e integrações{storeName ? ` da ${storeName}` : ''}.</p>
          </div>
          <label className="st-search">
            <I n="search" s={16} />
            <input placeholder="Buscar configuração…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar configuração" />
          </label>
        </div>

        <div className="mobnav" ref={mob}>
          {SETTINGS_NAV.flatMap((g) => g.items).map((it) => (
            <Link key={it.href} href={it.href} className={active?.href === it.href ? 'on' : ''}>{it.label}</Link>
          ))}
        </div>

        <div className="st-body">
          <nav className="st-nav" aria-label="Seções das configurações">
            {groups.map((g) => (
              <div key={g.group} className="st-grp">
                <div className="gl">{g.group}</div>
                {g.items.map((it) => (
                  <Link key={it.href} href={it.href} className={active?.href === it.href ? 'on' : ''} aria-current={active?.href === it.href ? 'page' : undefined}>
                    <I n={it.icon} s={16} />{it.label}
                  </Link>
                ))}
              </div>
            ))}
            {ql && groups.length === 0 && <div className="muted" style={{ padding: '0 12px', fontSize: 13 }}>Nada encontrado para “{q}”.</div>}
          </nav>
          <div className="st-main" key={active?.href || pathname}>{children}</div>
        </div>
      </div>
    </div>
  )
}
