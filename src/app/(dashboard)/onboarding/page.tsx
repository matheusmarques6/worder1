'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Storefront,
  Plugs,
  Palette,
  Rocket,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  ShoppingCart,
  Globe,
  WhatsappLogo,
  EnvelopeSimple,
  DeviceMobileSpeaker,
  Robot,
  Lightning,
  ShieldCheck,
  Confetti,
  Star,
} from '@phosphor-icons/react'

const steps = [
  { id: 1, title: 'Sua Loja', icon: Storefront, description: 'Conecte sua plataforma de e-commerce' },
  { id: 2, title: 'Canais', icon: Plugs, description: 'Configure seus canais de comunicação' },
  { id: 3, title: 'Personalização', icon: Palette, description: 'Personalize a experiência' },
  { id: 4, title: 'Ativar IA', icon: Robot, description: 'Configure a inteligência artificial' },
  { id: 5, title: 'Lançar', icon: Rocket, description: 'Revise e ative tudo' },
]

const platforms = [
  { id: 'shopify', name: 'Shopify', logo: '🛍️', connected: false },
  { id: 'woocommerce', name: 'WooCommerce', logo: '🔮', connected: false },
  { id: 'nuvemshop', name: 'Nuvemshop', logo: '☁️', connected: false },
  { id: 'vtex', name: 'VTEX', logo: '⚡', connected: false },
  { id: 'magento', name: 'Magento', logo: '🟧', connected: false },
  { id: 'tray', name: 'Tray', logo: '📦', connected: false },
]

const channels = [
  { id: 'email', name: 'E-mail', icon: EnvelopeSimple, description: 'Configure seu domínio de envio', color: 'text-[#F26B2A]' },
  { id: 'whatsapp', name: 'WhatsApp', icon: WhatsappLogo, description: 'Conecte via WhatsApp Business API', color: 'text-green-400' },
  { id: 'sms', name: 'SMS', icon: DeviceMobileSpeaker, description: 'Ative envios por SMS', color: 'text-purple-400' },
]

const automations = [
  { id: 'cart', name: 'Carrinho Abandonado', description: 'Recupere vendas automaticamente', recommended: true },
  { id: 'pix', name: 'PIX Pendente', description: 'Lembre clientes de pagamentos PIX', recommended: true },
  { id: 'welcome', name: 'Boas-vindas', description: 'Envie uma série de boas-vindas', recommended: true },
  { id: 'postpurchase', name: 'Pós-Compra', description: 'Acompanhe após a venda', recommended: false },
  { id: 'winback', name: 'Win-back', description: 'Reative clientes inativos', recommended: false },
]

export default function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState(1)
  const [completedSteps, setCompletedSteps] = useState<number[]>([])
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null)
  const [enabledChannels, setEnabledChannels] = useState<string[]>([])
  const [enabledAutomations, setEnabledAutomations] = useState<string[]>(['cart', 'pix', 'welcome'])
  const [storeName, setStoreName] = useState('')
  const [storeUrl, setStoreUrl] = useState('')

  const toggleChannel = (id: string) => {
    setEnabledChannels(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    )
  }

  const toggleAutomation = (id: string) => {
    setEnabledAutomations(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    )
  }

  const completeStep = () => {
    if (!completedSteps.includes(currentStep)) {
      setCompletedSteps(prev => [...prev, currentStep])
    }
    if (currentStep < 5) setCurrentStep(currentStep + 1)
  }

  const progress = (completedSteps.length / steps.length) * 100

  return (
    <div className="min-h-screen flex flex-col items-center py-8 px-4">
      {/* Logo & Progress */}
      <div className="w-full max-w-3xl mb-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#F26B2A] to-[#F5A623] flex items-center justify-center">
              <Lightning size={18} className="text-white" weight="fill" />
            </div>
            <span className="text-lg font-display font-bold text-white">Worder</span>
          </div>
          <span className="text-sm text-zinc-500">Passo {currentStep} de {steps.length}</span>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-[#F26B2A] to-[#F5A623] rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>

        {/* Step Indicators */}
        <div className="flex justify-between mt-4">
          {steps.map((step) => {
            const Icon = step.icon
            const isCompleted = completedSteps.includes(step.id)
            const isCurrent = currentStep === step.id
            return (
              <button
                key={step.id}
                onClick={() => setCurrentStep(step.id)}
                className="flex flex-col items-center gap-1.5"
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                  isCompleted ? 'bg-emerald-500' :
                  isCurrent ? 'bg-[#F26B2A]' : 'bg-zinc-800'
                }`}>
                  {isCompleted ? (
                    <CheckCircle size={20} className="text-white" weight="fill" />
                  ) : (
                    <Icon size={20} className={isCurrent ? 'text-white' : 'text-zinc-500'} />
                  )}
                </div>
                <span className={`text-xs ${isCurrent ? 'text-white' : 'text-zinc-500'}`}>
                  {step.title}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Step Content */}
      <div className="w-full max-w-3xl">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            {/* Step 1: Store */}
            {currentStep === 1 && (
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-8">
                <h2 className="text-xl font-display font-bold text-white mb-2">Conecte sua loja</h2>
                <p className="text-sm text-zinc-400 mb-6">Selecione sua plataforma de e-commerce para sincronizar produtos, pedidos e clientes.</p>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                  {platforms.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPlatform(p.id)}
                      className={`p-4 rounded-xl border text-center transition-all ${
                        selectedPlatform === p.id
                          ? 'border-[#F26B2A] bg-[#F26B2A]/5'
                          : 'border-zinc-700 hover:border-zinc-600'
                      }`}
                    >
                      <span className="text-2xl">{p.logo}</span>
                      <p className="text-sm text-white font-medium mt-2">{p.name}</p>
                    </button>
                  ))}
                </div>

                {selectedPlatform && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="space-y-4 border-t border-zinc-800 pt-4"
                  >
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1.5">Nome da Loja</label>
                      <input
                        type="text"
                        value={storeName}
                        onChange={(e) => setStoreName(e.target.value)}
                        placeholder="Minha Loja"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#F26B2A]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1.5">URL da Loja</label>
                      <input
                        type="text"
                        value={storeUrl}
                        onChange={(e) => setStoreUrl(e.target.value)}
                        placeholder="https://minhaloja.com.br"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#F26B2A]"
                      />
                    </div>
                  </motion.div>
                )}
              </div>
            )}

            {/* Step 2: Channels */}
            {currentStep === 2 && (
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-8">
                <h2 className="text-xl font-display font-bold text-white mb-2">Configure seus canais</h2>
                <p className="text-sm text-zinc-400 mb-6">Escolha os canais que deseja usar para se comunicar com seus clientes.</p>

                <div className="space-y-3">
                  {channels.map((ch) => {
                    const Icon = ch.icon
                    const isEnabled = enabledChannels.includes(ch.id)
                    return (
                      <button
                        key={ch.id}
                        onClick={() => toggleChannel(ch.id)}
                        className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all text-left ${
                          isEnabled
                            ? 'border-[#F26B2A] bg-[#F26B2A]/5'
                            : 'border-zinc-700 hover:border-zinc-600'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Icon size={24} className={ch.color} weight="fill" />
                          <div>
                            <p className="text-sm font-medium text-white">{ch.name}</p>
                            <p className="text-xs text-zinc-500">{ch.description}</p>
                          </div>
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          isEnabled ? 'border-[#F26B2A] bg-[#F26B2A]' : 'border-zinc-600'
                        }`}>
                          {isEnabled && <CheckCircle size={14} className="text-white" weight="fill" />}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Step 3: Personalization */}
            {currentStep === 3 && (
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-8">
                <h2 className="text-xl font-display font-bold text-white mb-2">Personalize a experiência</h2>
                <p className="text-sm text-zinc-400 mb-6">Configure sua marca e preferências visuais.</p>

                <div className="space-y-6">
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1.5">Logo da Loja</label>
                    <div className="w-full h-32 border-2 border-dashed border-zinc-700 rounded-xl flex items-center justify-center hover:border-zinc-600 cursor-pointer transition-colors">
                      <div className="text-center">
                        <Globe size={24} className="text-zinc-600 mx-auto" />
                        <p className="text-xs text-zinc-500 mt-2">Arraste ou clique para enviar</p>
                        <p className="text-xs text-zinc-600">PNG, JPG até 2MB</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-500 mb-1.5">Cor Principal da Marca</label>
                    <div className="flex items-center gap-3">
                      <input type="color" defaultValue="#F26B2A" className="w-10 h-10 rounded cursor-pointer border-0" />
                      <input
                        type="text"
                        defaultValue="#F26B2A"
                        className="w-32 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-[#F26B2A]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-500 mb-1.5">Fuso Horário</label>
                    <select className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F26B2A]">
                      <option>América/São Paulo (GMT-3)</option>
                      <option>América/Manaus (GMT-4)</option>
                      <option>América/Fortaleza (GMT-3)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-500 mb-1.5">Moeda</label>
                    <select className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F26B2A]">
                      <option>BRL - Real Brasileiro (R$)</option>
                      <option>USD - US Dollar ($)</option>
                      <option>EUR - Euro (€)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: AI */}
            {currentStep === 4 && (
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-8">
                <h2 className="text-xl font-display font-bold text-white mb-2">Ative a Worder AI</h2>
                <p className="text-sm text-zinc-400 mb-6">Escolha as automações inteligentes que deseja ativar desde o início.</p>

                <div className="space-y-3">
                  {automations.map((auto) => {
                    const isEnabled = enabledAutomations.includes(auto.id)
                    return (
                      <button
                        key={auto.id}
                        onClick={() => toggleAutomation(auto.id)}
                        className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all text-left ${
                          isEnabled
                            ? 'border-[#F26B2A] bg-[#F26B2A]/5'
                            : 'border-zinc-700 hover:border-zinc-600'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Lightning size={20} className={isEnabled ? 'text-[#F26B2A]' : 'text-zinc-600'} />
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-white">{auto.name}</p>
                              {auto.recommended && (
                                <span className="px-1.5 py-0.5 bg-[#F26B2A]/10 text-[#F5A623] text-xs rounded">
                                  Recomendado
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-zinc-500">{auto.description}</p>
                          </div>
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          isEnabled ? 'border-[#F26B2A] bg-[#F26B2A]' : 'border-zinc-600'
                        }`}>
                          {isEnabled && <CheckCircle size={14} className="text-white" weight="fill" />}
                        </div>
                      </button>
                    )
                  })}
                </div>

                <div className="mt-6 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
                  <div className="flex items-start gap-2">
                    <Robot size={18} className="text-emerald-400 mt-0.5" />
                    <div>
                      <p className="text-sm text-emerald-400 font-medium">IA Pronta para Aprender</p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        A Worder AI começa a aprender sobre seus clientes imediatamente. Quanto mais dados, melhores os resultados de recuperação.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 5: Launch */}
            {currentStep === 5 && (
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-8 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', duration: 0.6 }}
                >
                  <Confetti size={48} className="text-[#F26B2A] mx-auto mb-4" weight="fill" />
                </motion.div>
                <h2 className="text-xl font-display font-bold text-white mb-2">Tudo pronto!</h2>
                <p className="text-sm text-zinc-400 mb-8">Revise suas configurações antes de lançar.</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left mb-8">
                  <div className="bg-zinc-800/30 rounded-lg p-4">
                    <h4 className="text-xs text-zinc-500 mb-2 uppercase tracking-wider">Loja</h4>
                    <p className="text-sm text-white">{storeName || 'Minha Loja'}</p>
                    <p className="text-xs text-zinc-500">{selectedPlatform ? platforms.find(p => p.id === selectedPlatform)?.name : 'Não selecionada'}</p>
                  </div>
                  <div className="bg-zinc-800/30 rounded-lg p-4">
                    <h4 className="text-xs text-zinc-500 mb-2 uppercase tracking-wider">Canais</h4>
                    <div className="flex gap-2">
                      {enabledChannels.length > 0 ? enabledChannels.map(ch => {
                        const channel = channels.find(c => c.id === ch)
                        if (!channel) return null
                        const Icon = channel.icon
                        return <Icon key={ch} size={20} className={channel.color} weight="fill" />
                      }) : <span className="text-xs text-zinc-500">Nenhum selecionado</span>}
                    </div>
                  </div>
                  <div className="bg-zinc-800/30 rounded-lg p-4">
                    <h4 className="text-xs text-zinc-500 mb-2 uppercase tracking-wider">Automações IA</h4>
                    <p className="text-sm text-white">{enabledAutomations.length} ativas</p>
                    <p className="text-xs text-zinc-500">
                      {enabledAutomations.map(a => automations.find(au => au.id === a)?.name).join(', ')}
                    </p>
                  </div>
                  <div className="bg-zinc-800/30 rounded-lg p-4">
                    <h4 className="text-xs text-zinc-500 mb-2 uppercase tracking-wider">Pixel</h4>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span className="text-sm text-emerald-400">Será instalado automaticamente</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={completeStep}
                  className="px-8 py-3 bg-gradient-to-r from-[#F26B2A] to-[#F5A623] text-white rounded-xl hover:opacity-90 transition-opacity text-sm font-medium inline-flex items-center gap-2"
                >
                  <Rocket size={18} />
                  Lançar Worder
                </button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          <button
            onClick={() => currentStep > 1 && setCurrentStep(currentStep - 1)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
              currentStep > 1 ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700' : 'invisible'
            }`}
          >
            <ArrowLeft size={16} />
            Voltar
          </button>
          {currentStep < 5 && (
            <button
              onClick={completeStep}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#F26B2A] to-[#F5A623] text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
            >
              Próximo
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
