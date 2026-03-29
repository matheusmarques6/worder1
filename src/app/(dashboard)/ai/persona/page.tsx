'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Robot,
  Brain,
  ChatCircleDots,
  Smiley,
  SmileyMeh,
  SmileyWink,
  Handshake,
  Lightning,
  Tag,
  Percent,
  Truck,
  Clock,
  FloppyDisk,
  ArrowLeft,
} from '@phosphor-icons/react'
import Link from 'next/link'

const toneOptions = [
  { id: 'friendly', label: 'Amigável', icon: Smiley, description: 'Tom casual e acolhedor, como um amigo ajudando' },
  { id: 'professional', label: 'Profissional', icon: Handshake, description: 'Tom formal e confiável, foco em credibilidade' },
  { id: 'playful', label: 'Descontraído', icon: SmileyWink, description: 'Tom leve com humor sutil, engajamento alto' },
  { id: 'urgent', label: 'Urgente', icon: Lightning, description: 'Tom direto com senso de urgência, ideal para recuperação' },
]

const sampleMessages: Record<string, string> = {
  friendly: 'Oi Ana! 😊 Vi que você deixou uns produtos incríveis no carrinho. Posso te ajudar a finalizar? Se precisar de alguma coisa, tô aqui!',
  professional: 'Olá Ana, notamos que sua compra ficou pendente. Os itens selecionados estão reservados por tempo limitado. Gostaria de concluir seu pedido?',
  playful: 'Eii Ana! 🛒 Seu carrinho tá sentindo saudade... Os produtos que você escolheu são demais! Bora fechar esse pedido? 😄',
  urgent: 'Ana, seus itens estão quase esgotando! ⚡ Complete seu pedido agora antes que o estoque acabe. Últimas unidades disponíveis.',
}

export default function PersonaPage() {
  const [selectedTone, setSelectedTone] = useState('friendly')
  const [personaName, setPersonaName] = useState('Worder IA')
  const [maxDiscount, setMaxDiscount] = useState(15)
  const [freeShippingThreshold, setFreeShippingThreshold] = useState(199)
  const [responseDelay, setResponseDelay] = useState(30)
  const [useEmojis, setUseEmojis] = useState(true)
  const [mentionProducts, setMentionProducts] = useState(true)
  const [useCustomerName, setUseCustomerName] = useState(true)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/ai"
          className="p-2 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft size={18} className="text-gray-500" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold font-display text-gray-900">Persona da IA</h1>
          <p className="text-sm text-gray-500 mt-0.5">Configure como a IA se comunica com seus clientes</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Configuration */}
        <div className="space-y-6">
          {/* Identity */}
          <div className="bg-white/50 border border-gray-200 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Robot size={16} className="text-brand-600" />
              Identidade
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Nome da IA</label>
                <input
                  type="text"
                  value={personaName}
                  onChange={(e) => setPersonaName(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-brand-500 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Tone Selection */}
          <div className="bg-white/50 border border-gray-200 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Brain size={16} className="text-brand-600" />
              Tom de Voz
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {toneOptions.map((tone) => {
                const Icon = tone.icon
                return (
                  <button
                    key={tone.id}
                    onClick={() => setSelectedTone(tone.id)}
                    className={`text-left p-3 rounded-lg border transition-all ${
                      selectedTone === tone.id
                        ? 'border-[#F26B2A] bg-brand-500/5'
                        : 'border-gray-200 bg-gray-50/30 hover:border-gray-200'
                    }`}
                  >
                    <Icon size={20} className={selectedTone === tone.id ? 'text-brand-600' : 'text-gray-500'} />
                    <p className="text-sm font-medium text-gray-900 mt-2">{tone.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{tone.description}</p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Behavior */}
          <div className="bg-white/50 border border-gray-200 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <ChatCircleDots size={16} className="text-brand-600" />
              Comportamento
            </h3>
            <div className="space-y-4">
              {[
                { label: 'Usar emojis nas mensagens', value: useEmojis, setter: setUseEmojis },
                { label: 'Mencionar produtos pelo nome', value: mentionProducts, setter: setMentionProducts },
                { label: 'Usar nome do cliente', value: useCustomerName, setter: setUseCustomerName },
              ].map((toggle) => (
                <div key={toggle.label} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">{toggle.label}</span>
                  <button
                    onClick={() => toggle.setter(!toggle.value)}
                    className={`w-10 h-5 rounded-full transition-colors relative ${
                      toggle.value ? 'bg-brand-500' : 'bg-gray-100'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${
                      toggle.value ? 'translate-x-5' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>
              ))}
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">
                  <Clock size={12} className="inline mr-1" />
                  Delay de resposta (segundos)
                </label>
                <input
                  type="range"
                  min={5}
                  max={120}
                  value={responseDelay}
                  onChange={(e) => setResponseDelay(Number(e.target.value))}
                  className="w-full accent-[#F26B2A]"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>5s</span>
                  <span className="text-gray-900 font-medium">{responseDelay}s</span>
                  <span>120s</span>
                </div>
              </div>
            </div>
          </div>

          {/* Incentive Limits */}
          <div className="bg-white/50 border border-gray-200 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Tag size={16} className="text-brand-600" />
              Limites de Incentivo
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">
                  <Percent size={12} className="inline mr-1" />
                  Desconto máximo permitido
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={50}
                    value={maxDiscount}
                    onChange={(e) => setMaxDiscount(Number(e.target.value))}
                    className="flex-1 accent-[#F26B2A]"
                  />
                  <span className="text-sm font-medium text-gray-900 w-12 text-right">{maxDiscount}%</span>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">
                  <Truck size={12} className="inline mr-1" />
                  Frete grátis acima de
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">R$</span>
                  <input
                    type="number"
                    value={freeShippingThreshold}
                    onChange={(e) => setFreeShippingThreshold(Number(e.target.value))}
                    className="w-28 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-brand-500 transition-colors"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="space-y-6">
          <div className="bg-white/50 border border-gray-200 rounded-xl p-6 sticky top-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Preview da Mensagem</h3>

            {/* Chat Preview */}
            <div className="bg-[#0B141A] rounded-xl p-4 min-h-[300px]">
              {/* WhatsApp Header */}
              <div className="flex items-center gap-3 pb-3 border-b border-gray-200/50 mb-4">
                <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center">
                  <Robot size={16} className="text-brand-500" weight="fill" />
                </div>
                <div>
                  <p className="text-sm text-gray-700 font-medium">{personaName}</p>
                  <p className="text-xs text-emerald-400">online</p>
                </div>
              </div>

              {/* Message Bubble */}
              <div className="flex justify-start mb-3">
                <motion.div
                  key={selectedTone}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-[#202C33] rounded-lg rounded-tl-none px-3 py-2 max-w-[280px]"
                >
                  <p className="text-sm text-gray-800 leading-relaxed">
                    {sampleMessages[selectedTone]}
                  </p>
                  <p className="text-xs text-gray-500 text-right mt-1">14:32</p>
                </motion.div>
              </div>

              {/* Quick Reply Buttons */}
              <div className="flex flex-col gap-1.5 mt-4">
                <button className="w-full py-2 bg-[#202C33] rounded-lg text-sm text-[#53BDEB] hover:bg-[#2A3942] transition-colors">
                  Finalizar compra
                </button>
                <button className="w-full py-2 bg-[#202C33] rounded-lg text-sm text-[#53BDEB] hover:bg-[#2A3942] transition-colors">
                  Ver meu carrinho
                </button>
                <button className="w-full py-2 bg-[#202C33] rounded-lg text-sm text-[#53BDEB] hover:bg-[#2A3942] transition-colors">
                  Falar com atendente
                </button>
              </div>
            </div>

            {/* Save Button */}
            <button className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium">
              <FloppyDisk size={16} />
              Salvar Configurações
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
