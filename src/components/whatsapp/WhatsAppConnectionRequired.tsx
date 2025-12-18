'use client'

import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import {
  MessageSquare,
  AlertCircle,
  Settings,
  ArrowRight,
  ExternalLink,
  Loader2,
  WifiOff,
  Plug
} from 'lucide-react'

interface WhatsAppConnectionRequiredProps {
  type?: 'banner' | 'card' | 'fullpage'
  title?: string
  description?: string
  showIcon?: boolean
}

// Banner compacto para colocar no topo de páginas
export function WhatsAppConnectionBanner({
  title = 'WhatsApp não conectado',
  description = 'Conecte sua conta do WhatsApp Business para usar esta funcionalidade.'
}: WhatsAppConnectionRequiredProps) {
  const router = useRouter()

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/20 rounded-lg">
            <WifiOff className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <p className="font-medium text-amber-300">{title}</p>
            <p className="text-sm text-amber-300/70">{description}</p>
          </div>
        </div>
        <button
          onClick={() => router.push('/settings?tab=integrations')}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium text-sm transition-colors whitespace-nowrap"
        >
          <Plug className="w-4 h-4" />
          Conectar
        </button>
      </div>
    </motion.div>
  )
}

// Card para mostrar em grids ou listas
export function WhatsAppConnectionCard({
  title = 'Conecte o WhatsApp Business',
  description = 'Para enviar campanhas e gerenciar conversas, você precisa conectar sua conta do Meta Business Suite.'
}: WhatsAppConnectionRequiredProps) {
  const router = useRouter()

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="p-6 bg-dark-800/50 border border-dark-700 rounded-2xl"
    >
      <div className="flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center mb-4">
          <MessageSquare className="w-8 h-8 text-green-400" />
        </div>
        
        <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
        <p className="text-sm text-dark-400 mb-6 max-w-sm">{description}</p>
        
        <button
          onClick={() => router.push('/settings?tab=integrations')}
          className="flex items-center gap-2 px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-medium transition-colors"
        >
          <Settings className="w-4 h-4" />
          Ir para Integrações
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  )
}

// Página inteira de bloqueio
export function WhatsAppConnectionRequired({
  title = 'Conecte o WhatsApp Business',
  description = 'Para acessar esta funcionalidade, você precisa conectar sua conta do WhatsApp Business API.'
}: WhatsAppConnectionRequiredProps) {
  const router = useRouter()

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full text-center"
      >
        {/* Icon */}
        <div className="relative mx-auto mb-8">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center mx-auto">
            <MessageSquare className="w-12 h-12 text-green-400" />
          </div>
          <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center border-4 border-dark-900">
            <AlertCircle className="w-5 h-5 text-amber-400" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-white mb-3">{title}</h1>
        <p className="text-dark-400 mb-8">{description}</p>

        {/* Steps */}
        <div className="bg-dark-800/50 rounded-xl p-6 mb-8 text-left">
          <p className="text-sm font-medium text-dark-300 mb-4">Para conectar você vai precisar de:</p>
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-bold text-green-400">1</span>
              </div>
              <div>
                <p className="text-sm text-white">Conta no Meta Business Suite</p>
                <p className="text-xs text-dark-500">Com verificação do negócio</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-bold text-green-400">2</span>
              </div>
              <div>
                <p className="text-sm text-white">Número de WhatsApp Business</p>
                <p className="text-xs text-dark-500">Registrado na API</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-bold text-green-400">3</span>
              </div>
              <div>
                <p className="text-sm text-white">Access Token permanente</p>
                <p className="text-xs text-dark-500">System User Token da Meta</p>
              </div>
            </li>
          </ul>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <button
            onClick={() => router.push('/settings?tab=integrations')}
            className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-medium transition-colors"
          >
            <Settings className="w-5 h-5" />
            Configurar Integração
          </button>
          
          <a
            href="https://business.facebook.com/settings/whatsapp-business-accounts"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-dark-800 hover:bg-dark-700 text-dark-300 hover:text-white rounded-xl font-medium transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Abrir Meta Business Suite
          </a>
        </div>
      </motion.div>
    </div>
  )
}

// Loading state
export function WhatsAppConnectionLoading() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="flex items-center gap-3 text-dark-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Verificando conexão...</span>
      </div>
    </div>
  )
}

export default WhatsAppConnectionRequired
