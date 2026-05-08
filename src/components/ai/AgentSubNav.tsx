'use client'

// =============================================
// Sub-navegação compartilhada entre as páginas internas do agente
// (/ai/agents/[id]/*). Mantém a aparência consistente, com tabs simples
// estilo Worder: subline orange para a aba ativa, zinc 500 para as
// inativas. Lucide stroke 1.75.
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
    <nav className="border-b border-zinc-200 -mx-6 px-6 mb-6">
      <div className="flex gap-1 overflow-x-auto -mb-px">
        {tabs.map((t) => {
          const active = pathname === t.href
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`inline-flex items-center gap-2 px-3 py-2.5 text-sm font-medium
                          border-b-2 whitespace-nowrap transition-colors ${
                            active
                              ? 'text-orange-600 border-orange-500'
                              : 'text-zinc-600 border-transparent hover:text-zinc-900 hover:border-zinc-300'
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
