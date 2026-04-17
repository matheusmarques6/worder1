'use client'

import { useRouter } from 'next/navigation'
import { Mail, MessageSquare, Smartphone } from 'lucide-react'

const CHANNELS = [
  {
    id: 'email',
    name: 'Email',
    desc: 'Crie um email com editor visual, personalização dinâmica e A/B testing. Envie agora ou agende.',
    icon: Mail,
    href: '/email/campaigns/new',
    available: true,
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    desc: 'Envie mensagens com templates aprovados pela Meta, botões interativos e mídia.',
    icon: MessageSquare,
    href: '/whatsapp/campaigns/new',
    available: false,
  },
  {
    id: 'sms',
    name: 'SMS',
    desc: 'Mensagens curtas com links trackáveis e variáveis dinâmicas para sua base.',
    icon: Smartphone,
    href: '#',
    available: false,
  },
]

export default function CreateCampaignPage() {
  const router = useRouter()

  return (
    <div className="max-w-3xl mx-auto py-12 px-4">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Criar campanha</h1>
      <p className="text-sm text-gray-500 mb-8">Escolha o canal para sua campanha.</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {CHANNELS.map((ch) => {
          const Icon = ch.icon
          return (
            <button
              key={ch.id}
              onClick={() => ch.available && router.push(ch.href)}
              disabled={!ch.available}
              className={`relative text-left p-6 bg-white rounded-xl border-2 transition-all ${
                ch.available
                  ? 'border-gray-200 hover:border-brand-500 hover:shadow-md cursor-pointer'
                  : 'border-gray-100 opacity-60 cursor-not-allowed'
              }`}
            >
              {!ch.available && (
                <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-gray-100 text-gray-400 rounded-full">
                  Em breve
                </span>
              )}
              <div className="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center mb-4">
                <Icon className="w-6 h-6 text-brand-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">{ch.name}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{ch.desc}</p>
              {ch.available && (
                <p className="text-sm font-medium text-brand-600 mt-4">
                  Criar {ch.name.toLowerCase()} &rarr;
                </p>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
