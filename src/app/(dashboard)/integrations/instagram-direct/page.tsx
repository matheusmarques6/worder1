'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Instagram,
  ArrowLeft,
  MessageSquare,
  Zap,
  Users,
  Shield,
  ExternalLink,
  HelpCircle,
} from 'lucide-react'
import { InstagramDirectConnect } from '@/components/integrations/instagram/InstagramDirectConnect'

export default function InstagramDirectPage() {
  const [isConnected, setIsConnected] = useState(false)

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white/50">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <Link
            href="/integrations"
            className="inline-flex items-center gap-2 text-gray-500 hover:text-white transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar para integracoes
          </Link>

          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center">
              <Instagram className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Instagram Direct</h1>
              <p className="text-gray-500">
                Receba e responda mensagens do Direct na plataforma
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl border border-gray-200 p-6"
            >
              <InstagramDirectConnect
                onConnect={() => setIsConnected(true)}
                onDisconnect={() => setIsConnected(false)}
              />
            </motion.div>

            {/* Automation Section */}
            {isConnected && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="mt-6 bg-white rounded-2xl border border-gray-200 p-6"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-primary-500/20 flex items-center justify-center">
                    <Zap className="w-5 h-5 text-primary-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Automacoes</h3>
                    <p className="text-sm text-gray-500">Configure gatilhos automaticos</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <Link
                    href="/automations?source=instagram"
                    className="flex items-center justify-between p-4 bg-white rounded-xl hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <MessageSquare className="w-5 h-5 text-pink-400" />
                      <div>
                        <p className="font-medium text-white">Mensagem Recebida</p>
                        <p className="text-xs text-gray-500">
                          Quando receber uma mensagem no Direct
                        </p>
                      </div>
                    </div>
                    <ArrowLeft className="w-5 h-5 text-gray-500 rotate-180" />
                  </Link>

                  <Link
                    href="/automations?source=instagram&event=story_mention"
                    className="flex items-center justify-between p-4 bg-white rounded-xl hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Instagram className="w-5 h-5 text-purple-400" />
                      <div>
                        <p className="font-medium text-white">Mencao no Story</p>
                        <p className="text-xs text-gray-500">
                          Quando alguem mencionar sua conta no story
                        </p>
                      </div>
                    </div>
                    <ArrowLeft className="w-5 h-5 text-gray-500 rotate-180" />
                  </Link>
                </div>
              </motion.div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Features */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white rounded-2xl border border-gray-200 p-6"
            >
              <h3 className="font-semibold text-white mb-4">Recursos</h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-pink-500/20 flex items-center justify-center flex-shrink-0">
                    <MessageSquare className="w-4 h-4 text-pink-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">Inbox Unificada</p>
                    <p className="text-xs text-gray-500">
                      Todas as conversas em um so lugar
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                    <Zap className="w-4 h-4 text-purple-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">Automacoes</p>
                    <p className="text-xs text-gray-500">
                      Gatilhos para mover leads no pipeline
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                    <Users className="w-4 h-4 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">CRM Integrado</p>
                    <p className="text-xs text-gray-500">
                      Contatos sincronizados automaticamente
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center flex-shrink-0">
                    <Shield className="w-4 h-4 text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">Seguro</p>
                    <p className="text-xs text-gray-500">
                      Conexao oficial via Meta API
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Requirements */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-white rounded-2xl border border-gray-200 p-6"
            >
              <h3 className="font-semibold text-white mb-4">Requisitos</h3>
              <ul className="space-y-2 text-sm text-gray-500">
                <li className="flex items-start gap-2">
                  <span className="text-gray-400">•</span>
                  Conta Instagram Business ou Creator
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gray-400">•</span>
                  Pagina do Facebook conectada ao Instagram
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gray-400">•</span>
                  Permissao de administrador na Pagina
                </li>
              </ul>

              <a
                href="https://www.facebook.com/business/help/898752960195806"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 mt-4 text-sm text-primary-400 hover:text-primary-300 transition-colors"
              >
                <HelpCircle className="w-4 h-4" />
                Como converter para Business
                <ExternalLink className="w-3 h-3" />
              </a>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  )
}
