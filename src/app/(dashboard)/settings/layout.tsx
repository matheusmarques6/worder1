'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const tabs = [
  { title: 'Conta', href: '/settings/account' },
  { title: 'Faturamento', href: '/settings/billing' },
  { title: 'E-mail', href: '/settings' },
  { title: 'Domínios', href: '/settings/email' },
  { title: 'Rastreamento', href: '/settings/tracking' },
  { title: 'Atribuição', href: '/settings/attribution' },
  { title: 'Dados & LGPD', href: '/settings/lgpd' },
  { title: 'Uso de IA', href: '/settings/ai-usage' },
  { title: 'API', href: '/settings/api' },
  { title: 'Segurança', href: '/settings/security' },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <div className="-m-4 lg:-m-6">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white">
        <div className="px-6 pt-6 pb-0">
          <h1 className="text-xl font-semibold text-gray-900">Configurações</h1>
          <p className="text-sm text-gray-500 mt-0.5 mb-4">Gerencie as configurações da sua conta e organização</p>
        </div>
        {/* Horizontal tabs */}
        <div className="px-6">
          <nav className="flex gap-0 -mb-px overflow-x-auto">
            {tabs.map(tab => {
              const isActive = pathname === tab.href || (tab.href !== '/settings' && pathname.startsWith(tab.href))
              return (
                <Link key={tab.href} href={tab.href}
                  className={cn(
                    'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                    isActive
                      ? 'border-gray-900 text-gray-900'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  )}>
                  {tab.title}
                </Link>
              )
            })}
          </nav>
        </div>
      </div>
      {/* Content */}
      <div className="bg-gray-50 min-h-[calc(100vh-12rem)]">
        {children}
      </div>
    </div>
  )
}
