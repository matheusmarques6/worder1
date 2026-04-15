'use client'

import Link from 'next/link'
import { DeviceMobileSpeaker, Plus, WhatsappLogo, EnvelopeSimple } from '@phosphor-icons/react'

export default function SMSPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
            <DeviceMobileSpeaker size={20} className="text-purple-500" weight="duotone" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display text-gray-900">SMS</h1>
            <p className="text-sm text-gray-500 mt-1">Campanhas por SMS (em breve)</p>
          </div>
        </div>
      </div>

      {/* Honest empty state — no fake data */}
      <div className="bg-white/50 border border-gray-200 rounded-xl p-10 text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-purple-500/10 flex items-center justify-center mb-4">
          <DeviceMobileSpeaker size={28} className="text-purple-500" weight="duotone" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900">SMS estará disponível em breve</h2>
        <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
          Estamos finalizando a integração com nosso provedor de SMS. Enquanto isso,
          você pode usar WhatsApp e E-mail para falar com seus contatos.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href="/whatsapp"
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-600 rounded-lg hover:bg-emerald-500/20 transition-colors text-sm font-medium"
          >
            <WhatsappLogo size={16} />
            Usar WhatsApp
          </Link>
          <Link
            href="/campaigns"
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500/10 text-brand-600 rounded-lg hover:bg-brand-500/20 transition-colors text-sm font-medium"
          >
            <EnvelopeSimple size={16} />
            Ver Campanhas
          </Link>
        </div>
      </div>

      {/* Roadmap */}
      <div className="bg-white/50 border border-gray-200 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Roadmap do SMS</h3>
        <ul className="space-y-2 text-sm text-gray-600">
          <li className="flex items-start gap-2"><span className="text-gray-400">•</span> Envio transacional e de marketing via Twilio/Zenvia</li>
          <li className="flex items-start gap-2"><span className="text-gray-400">•</span> Templates com merge tags ({'{{nome}}'}, {'{{cupom}}'}, {'{{link}}'})</li>
          <li className="flex items-start gap-2"><span className="text-gray-400">•</span> Agendamento e segmentação igual ao e-mail</li>
          <li className="flex items-start gap-2"><span className="text-gray-400">•</span> Tracking de cliques e conversão atribuída</li>
        </ul>
      </div>
    </div>
  )
}
