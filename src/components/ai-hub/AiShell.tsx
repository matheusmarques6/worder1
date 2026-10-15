'use client'

// A casca da aba IA dentro do app (protótipo: "IA Telas P1" no iframe do
// app completo). Trilha "IA › Agentes › …" com o usuário à direita e as três
// abas do protótipo: Agentes, Conhecimento e Atividade. Construtor e
// Conhecimento abrem em tela cheia (src/app/(ia-full)); clicar num agente
// abre o Construtor dele, então não existe tela de agente aqui.

import React, { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores'
import { AiOrgContext } from './ai-context'
import { Loader2 } from 'lucide-react'
import { IaProto, Icon } from './proto/ui'

export { useAiOrganizationId } from './ai-context'

export const AI_TABS = [
  { key: 'agentes', href: '/ai/agentes', label: 'Agentes' },
  { key: 'conhecimento', href: '/ai/conhecimento', label: 'Conhecimento' },
  { key: 'atividade', href: '/ai/atividade', label: 'Atividade' },
] as const

/** Links antigos (/ai?tab=…) continuam aterrissando no lugar certo. */
export function resolveLegacyAiTab(tab: string | null | undefined): string {
  switch (tab) {
    case 'knowledge':
      return '/ai/conhecimento'
    case 'activity':
    case 'reports':
    case 'eval':
      return '/ai/atividade'
    default:
      return '/ai/agentes'
  }
}

/** Itens da trilha para a rota: [rótulo, link]. O último não tem link. */
export function crumbFor(pathname: string): Array<[string, string | null]> {
  if (pathname.startsWith('/ai/agentes/novo')) return [['IA', '/ai/agentes'], ['Agentes', '/ai/agentes'], ['Novo agente', null]]
  if (pathname.startsWith('/ai/atividade')) return [['IA', '/ai/agentes'], ['Atividade', null]]
  return [['IA', '/ai/agentes'], ['Agentes', null]]
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

export default function AiShell({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname() || '/ai'
  const { user, isLoading } = useAuthStore()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  if (!mounted || isLoading) {
    return <IaProto className="flex items-center justify-center h-[60vh]"><Loader2 size={22} className="animate-spin" /></IaProto>
  }
  if (!user || !user.organization_id) {
    router.push('/login')
    return null
  }

  const name = (user.name as string) || 'Usuário'
  const tab = pathname.startsWith('/ai/atividade') ? 'atividade' : 'agentes'
  const items = crumbFor(pathname)

  return (
    <AiOrgContext.Provider value={user.organization_id as string}>
      <IaProto
        className="flex flex-col -m-4 lg:-m-6 h-[calc(100dvh-72px)] lg:h-[calc(100dvh-61px)]"
      >
        <div className="crumb">
          {items.map(([label, href], i) => (
            <React.Fragment key={label + i}>
              {i > 0 && <Icon n="chevR" s={14} className="sep" />}
              {href && i < items.length - 1
                ? <Link href={href} style={{ color: 'var(--tx2)', fontWeight: 500 }}>{label}</Link>
                : <b>{label}</b>}
            </React.Fragment>
          ))}
          <span className="sp"></span>
          <span className="who"><i>{initials(name)}</i>{name.split(/\s+/)[0]}</span>
        </div>
        <div className="htabs">
          {AI_TABS.map((t) => (
            <Link key={t.key} href={t.href} className={'htab' + (tab === t.key ? ' on' : '')}>{t.label}</Link>
          ))}
        </div>
        <div className="page">{children}</div>
      </IaProto>
    </AiOrgContext.Provider>
  )
}
