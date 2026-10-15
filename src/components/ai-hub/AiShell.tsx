'use client'

// A casca da aba IA (plano IA, M2 passo 16): as quatro rotas do protótipo
// — Agentes, Construtor (M6), Conhecimento, Atividade — sobre a mesma
// AgentsTheme. Cada rota rola por dentro; a altura é presa ao viewport
// (72px = top bar mobile; 61px = header sticky do desktop). O layout de
// /ai só renderiza isto; o contexto com o organization_id vive aqui.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores'
import { AgentsTheme } from '@/components/agents/ui/AgentsTheme'
import { Bot, BookOpen, BarChart3, Hammer, Loader2 } from 'lucide-react'

const AiOrgContext = createContext<string | null>(null)

/** O organization_id do usuário logado, garantido pela casca /ai. */
export function useAiOrganizationId(): string {
  const id = useContext(AiOrgContext)
  if (!id) throw new Error('useAiOrganizationId fora da casca /ai')
  return id
}

export const AI_ROUTES = [
  { href: '/ai/agentes', label: 'Agentes', icon: Bot },
  { href: '/ai/construtor', label: 'Construtor', icon: Hammer },
  { href: '/ai/conhecimento', label: 'Conhecimento', icon: BookOpen },
  { href: '/ai/atividade', label: 'Atividade', icon: BarChart3 },
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

export default function AiShell({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname() || '/ai'
  const { user, isLoading } = useAuthStore()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  if (!mounted || isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
      </div>
    )
  }
  if (!user || !user.organization_id) {
    router.push('/login')
    return null
  }

  return (
    <AiOrgContext.Provider value={user.organization_id as string}>
      <AgentsTheme
        className="flex flex-col -m-4 lg:-m-6 h-[calc(100dvh-72px)] lg:h-[calc(100dvh-61px)]"
        style={{ background: 'var(--bg)' }}
      >
        <div className="tabs-row">
          {AI_ROUTES.map((route) => {
            const Icon = route.icon
            const on = pathname === route.href || pathname.startsWith(route.href + '/')
            return (
              <Link key={route.href} href={route.href} className={`tab${on ? ' on' : ''}`}>
                <Icon />{route.label}
              </Link>
            )
          })}
        </div>
        <div className="flex-1 overflow-y-auto" style={{ display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>
      </AgentsTheme>
    </AiOrgContext.Provider>
  )
}
