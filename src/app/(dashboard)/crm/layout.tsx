'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { LayoutGrid, Users, Settings2, Puzzle } from 'lucide-react'

const tabs = [
  { name: 'Deals', href: '/crm', icon: LayoutGrid },
  { name: 'Contatos', href: '/crm/contacts', icon: Users },
  { name: 'Pipelines', href: '/crm/pipelines', icon: Settings2 },
  { name: 'Integrações', href: '/crm/integrations', icon: Puzzle },
]

export default function CRMLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === '/crm') {
      return pathname === '/crm'
    }
    return pathname.startsWith(href)
  }

  return (
    <div className="space-y-6">
      {/* Header with Tabs */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">CRM</h1>
          <p className="text-dark-400 mt-1">Gerencie seus deals, contatos e pipelines</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-dark-700/50">
        <nav className="flex gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const active = isActive(tab.href)
            
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`
                  flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors
                  ${active 
                    ? 'border-primary-500 text-primary-400' 
                    : 'border-transparent text-dark-400 hover:text-white hover:border-dark-600'
                  }
                `}
              >
                <Icon className="w-4 h-4" />
                {tab.name}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Content */}
      <div>
        {children}
      </div>
    </div>
  )
}
