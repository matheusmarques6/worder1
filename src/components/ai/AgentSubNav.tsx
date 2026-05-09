'use client'

// =============================================
// Sub-navegação compartilhada entre as páginas internas do agente
// (/ai/agents/[id]/*). Estilo Worder: tabs com underline charcoal no
// ativo (não orange — orange fica reservado pra CTAs primárias).
// =============================================

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Sliders,
  BookOpen,
  Wrench,
  Layers,
  Beaker,
  GitBranch,
  AlertTriangle,
  Sparkles,
} from 'lucide-react'

interface Tab {
  href: string
  label: string
  Icon: typeof Sliders
}

interface AgentSubNavProps {
  agentId: string
}

export function AgentSubNav({ agentId }: AgentSubNavProps) {
  const pathname = usePathname()
  const base = `/ai/agents/${agentId}`

  const tabs: Tab[] = [
    { href: base, label: 'Geral', Icon: Sliders },
    { href: `${base}/skills`, label: 'Skills', Icon: Sparkles },
    { href: `${base}/sources`, label: 'Conhecimento', Icon: BookOpen },
    { href: `${base}/tools`, label: 'Ferramentas', Icon: Wrench },
    { href: `${base}/versions`, label: 'Versões', Icon: GitBranch },
    { href: `${base}/simulations`, label: 'Simulações', Icon: Beaker },
    { href: `${base}/experiments`, label: 'Experimentos', Icon: Layers },
    { href: `${base}/gaps`, label: 'Gaps', Icon: AlertTriangle },
  ]

  return (
    <nav className="border-b border-[#E4E4E7] mb-8">
      <div className="flex gap-0.5 overflow-x-auto -mb-px">
        {tabs.map((t) => {
          const active = pathname === t.href
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`inline-flex items-center gap-2 px-3 py-3 text-[13px] font-semibold
                          border-b-2 whitespace-nowrap transition-colors
                          ${
                            active
                              ? 'text-[#18181B] border-[#18181B]'
                              : 'text-[#71717A] border-transparent hover:text-[#18181B]'
                          }`}
            >
              <t.Icon className="w-4 h-4" strokeWidth={1.75} />
              {t.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
