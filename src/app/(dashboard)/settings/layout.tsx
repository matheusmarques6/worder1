'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { User, Users, CreditCard, Activity, Link2, Code, Shield, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const settingsNav = [
  { title: 'Geral', href: '/settings', icon: Settings },
  { title: 'Conta', href: '/settings/account', icon: User },
  { title: 'Equipe', href: '/settings/users', icon: Users },
  { title: 'Faturamento', href: '/settings/billing', icon: CreditCard },
  { title: 'Rastreamento', href: '/settings/tracking', icon: Activity },
  { title: 'Atribuição', href: '/settings/attribution', icon: Link2 },
  { title: 'UTM', href: '/settings/utm', icon: Link2 },
  { title: 'API', href: '/settings/api', icon: Code },
  { title: 'Segurança', href: '/settings/security', icon: Shield },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      <nav className="w-56 bg-white border-r border-gray-200 p-4 space-y-1 flex-shrink-0">
        {settingsNav.map(item => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== '/settings' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                isActive
                  ? 'text-orange-600 bg-orange-50 font-medium border-l-2 border-orange-500'
                  : 'text-gray-600 hover:bg-gray-50'
              )}
            >
              <Icon className="w-4 h-4" />
              {item.title}
            </Link>
          );
        })}
      </nav>
      <div className="flex-1 bg-gray-50">{children}</div>
    </div>
  );
}
