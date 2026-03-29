'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  ChatCircleDots,
  PaintBrush,
  Robot,
  Clock,
  Eye,
  Code,
  Check,
  Copy,
  ArrowLeft,
} from '@phosphor-icons/react'
import { useRouter } from 'next/navigation'

export default function ChatWidgetPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('appearance')
  const [copied, setCopied] = useState(false)

  const installCode = `<script src="https://cdn.worder.io/widget.js" data-store-id="YOUR_STORE_ID"></script>`

  const handleCopy = () => {
    navigator.clipboard.writeText(installCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => router.push('/site')} className="p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-gray-500 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" weight="bold" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold font-display text-gray-900">Chat Widget</h1>
          <p className="text-sm text-gray-500 mt-0.5">Configure o widget de chat para o seu site</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs font-medium text-green-400">Widget Ativo</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Config */}
        <div className="lg:col-span-2 space-y-4">
          {/* Tabs */}
          <div className="flex items-center gap-1 p-1 bg-[#1A1A1A] rounded-xl border border-white/[0.06] w-fit">
            {[
              { id: 'appearance', label: 'Aparência', icon: PaintBrush },
              { id: 'behavior', label: 'Comportamento', icon: Robot },
              { id: 'schedule', label: 'Horários', icon: Clock },
              { id: 'install', label: 'Instalação', icon: Code },
            ].map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive ? 'bg-white/[0.08] text-white' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-[#F26B2A]' : ''}`} weight={isActive ? 'fill' : 'regular'} />
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* Appearance */}
          {activeTab === 'appearance' && (
            <div className="bg-[#1A1A1A] rounded-2xl border border-white/[0.06] p-6 space-y-5">
              <div>
                <label className="block text-xs text-gray-500 mb-1.5 font-medium">Cor Principal</label>
                <div className="flex items-center gap-3">
                  <input type="color" defaultValue="#F26B2A" className="w-10 h-10 rounded-lg border border-white/[0.06] cursor-pointer" />
                  <input type="text" defaultValue="#F26B2A" className="bg-[#111111] border border-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-gray-700 font-mono w-32 focus:outline-none focus:border-[#F26B2A]/40 transition-colors" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5 font-medium">Mensagem de Boas-vindas</label>
                <textarea rows={3} defaultValue="Olá! Como posso ajudar você hoje?" className="w-full bg-[#111111] border border-white/[0.06] rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:border-[#F26B2A]/40 transition-colors resize-none" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5 font-medium">Posição do Widget</label>
                <div className="flex items-center gap-3">
                  <button className="px-4 py-2.5 bg-[#F26B2A]/10 border-2 border-[#F26B2A] rounded-xl text-sm font-medium text-[#F26B2A]">Direita</button>
                  <button className="px-4 py-2.5 bg-white/[0.04] border-2 border-white/[0.06] rounded-xl text-sm font-medium text-gray-500 hover:border-white/[0.12] transition-colors">Esquerda</button>
                </div>
              </div>
              <button className="px-4 py-2.5 bg-gradient-to-r from-[#F26B2A] to-[#F5A623] text-white text-sm font-medium rounded-xl hover:opacity-90 transition-opacity">Salvar</button>
            </div>
          )}

          {/* Behavior */}
          {activeTab === 'behavior' && (
            <div className="bg-[#1A1A1A] rounded-2xl border border-white/[0.06] p-6 space-y-4">
              {[
                { label: 'IA Automática', desc: 'Bot responde automaticamente antes de escalar', enabled: true },
                { label: 'Recomendação de Produtos', desc: 'Sugere produtos com base no comportamento', enabled: true },
                { label: 'Coleta de E-mail', desc: 'Pede e-mail do visitante antes de iniciar', enabled: false },
                { label: 'Som de Notificação', desc: 'Emite som quando nova mensagem chega', enabled: true },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between p-4 bg-[#111111] rounded-xl border border-white/[0.06]">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
                  </div>
                  <button className={`w-11 h-6 rounded-full transition-colors ${item.enabled ? 'bg-[#F26B2A]' : 'bg-gray-200'}`}>
                    <div className={`w-5 h-5 rounded-full bg-white shadow-sm transform transition-transform ${item.enabled ? 'translate-x-[22px]' : 'translate-x-[2px]'}`} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Schedule */}
          {activeTab === 'schedule' && (
            <div className="bg-[#1A1A1A] rounded-2xl border border-white/[0.06] p-6 space-y-4">
              <p className="text-sm text-gray-500">Configure os horários de atendimento humano. Fora desses horários, apenas a IA responde.</p>
              {['Segunda a Sexta', 'Sábado', 'Domingo'].map((day) => (
                <div key={day} className="flex items-center justify-between p-4 bg-[#111111] rounded-xl border border-white/[0.06]">
                  <span className="text-sm font-medium text-gray-900">{day}</span>
                  <div className="flex items-center gap-2">
                    <input type="time" defaultValue="09:00" className="bg-white border border-white/[0.06] rounded-lg px-3 py-1.5 text-xs text-gray-600" />
                    <span className="text-gray-500">até</span>
                    <input type="time" defaultValue="18:00" className="bg-white border border-white/[0.06] rounded-lg px-3 py-1.5 text-xs text-gray-600" />
                  </div>
                </div>
              ))}
              <button className="px-4 py-2.5 bg-gradient-to-r from-[#F26B2A] to-[#F5A623] text-white text-sm font-medium rounded-xl hover:opacity-90 transition-opacity">Salvar Horários</button>
            </div>
          )}

          {/* Install */}
          {activeTab === 'install' && (
            <div className="bg-[#1A1A1A] rounded-2xl border border-white/[0.06] p-6 space-y-4">
              <p className="text-sm text-gray-500">Copie e cole o código abaixo antes da tag <code className="text-[#F26B2A]">&lt;/body&gt;</code> do seu site.</p>
              <div className="relative">
                <pre className="bg-[#111111] border border-white/[0.06] rounded-xl p-4 text-xs text-gray-600 font-mono overflow-x-auto">
                  {installCode}
                </pre>
                <button
                  onClick={handleCopy}
                  className="absolute top-3 right-3 p-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-gray-500 hover:text-white transition-colors"
                >
                  {copied ? <Check className="w-4 h-4 text-green-400" weight="bold" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Preview */}
        <div>
          <div className="bg-[#1A1A1A] rounded-2xl border border-white/[0.06] overflow-hidden sticky top-20">
            <div className="px-4 py-3 border-b border-white/[0.06]">
              <span className="text-xs font-medium text-gray-500">Preview do Widget</span>
            </div>
            <div className="h-[500px] bg-[#111111] relative flex items-end justify-end p-4">
              {/* Mock Widget */}
              <div className="w-72 bg-white rounded-2xl shadow-2xl overflow-hidden">
                {/* Widget Header */}
                <div className="bg-gradient-to-r from-[#F26B2A] to-[#F5A623] px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                      <ChatCircleDots className="w-4 h-4 text-white" weight="fill" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Worder Chat</p>
                      <p className="text-[10px] text-gray-500">Online agora</p>
                    </div>
                  </div>
                </div>
                {/* Messages */}
                <div className="p-3 h-48 bg-gray-50">
                  <div className="bg-white rounded-xl px-3 py-2 shadow-sm max-w-[80%] mb-2">
                    <p className="text-xs text-gray-800">Olá! Como posso ajudar você hoje?</p>
                  </div>
                </div>
                {/* Input */}
                <div className="px-3 py-2 border-t border-gray-200">
                  <div className="bg-gray-100 rounded-xl px-3 py-2">
                    <p className="text-xs text-gray-400">Digite sua mensagem...</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
