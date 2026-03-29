'use client';

import { Mail, FileText, BarChart3, Users, ChevronRight, Send, Zap, TrendingUp } from 'lucide-react';
import Link from 'next/link';

const modules = [
  {
    href: '/analytics/email',
    icon: BarChart3,
    iconBg: 'bg-orange-50',
    iconColor: 'text-orange-500',
    title: 'Analytics',
    description: 'Acompanhe taxas de abertura, cliques, bounces e conversões das suas campanhas.',
    badge: null,
  },
  {
    href: '/content/templates',
    icon: FileText,
    iconBg: 'bg-purple-50',
    iconColor: 'text-purple-500',
    title: 'Templates',
    description: 'Crie e gerencie templates de email reutilizáveis para suas campanhas.',
    badge: null,
  },
  {
    href: '/crm/contacts',
    icon: Users,
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-500',
    title: 'Listas de Contatos',
    description: 'Gerencie suas listas de contatos, segmentos e preferências de email.',
    badge: null,
  },
  {
    href: '/automations',
    icon: Zap,
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-500',
    title: 'Automações',
    description: 'Configure fluxos automáticos de email para nutrição de leads e reengajamento.',
    badge: 'Em breve',
  },
];

const stats = [
  { label: 'Emails Enviados', value: '—', icon: Send, trend: null },
  { label: 'Taxa de Abertura', value: '—', icon: Mail, trend: null },
  { label: 'Taxa de Cliques', value: '—', icon: TrendingUp, trend: null },
  { label: 'Contatos Ativos', value: '—', icon: Users, trend: null },
];

export default function EmailMarketingPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Email Marketing</h1>
        <p className="text-sm text-gray-500 mt-1">
          Crie campanhas, gerencie contatos e acompanhe o desempenho dos seus emails
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-gray-500">{label}</p>
              <Icon className="w-4 h-4 text-gray-400" />
            </div>
            <p className="text-2xl font-semibold text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
          Módulos
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          {modules.map(({ href, icon: Icon, iconBg, iconColor, title, description, badge }) => (
            <Link
              key={href}
              href={href}
              className="group bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md hover:border-orange-200 transition-all flex items-start gap-4"
            >
              <div className={`w-10 h-10 ${iconBg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                <Icon className={`w-5 h-5 ${iconColor}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-semibold text-gray-900 group-hover:text-orange-600 transition-colors">
                    {title}
                  </h3>
                  {badge && (
                    <span className="px-2 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-500 rounded-full">
                      {badge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-orange-400 transition-colors flex-shrink-0 mt-0.5" />
            </Link>
          ))}
        </div>
      </div>

      {/* CTA - Create Campaign */}
      <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-100 rounded-xl p-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
            <Send className="w-6 h-6 text-orange-500" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Pronto para enviar?</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Crie sua primeira campanha de email e alcance sua audiência.
            </p>
          </div>
        </div>
        <Link
          href="/analytics/email"
          className="flex-shrink-0 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Ver Analytics
        </Link>
      </div>
    </div>
  );
}
