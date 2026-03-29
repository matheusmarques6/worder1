'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  DeviceMobileSpeaker,
  PaperPlaneTilt,
  UsersThree,
  Clock,
  Lightning,
  Tag,
  Plus,
  X,
  MagnifyingGlass,
  CalendarBlank,
  TextT,
  Link as LinkIcon,
  CursorClick,
  CheckCircle,
  WarningCircle,
  Info,
  CaretDown,
  ChatText,
} from '@phosphor-icons/react'

const audiences = [
  { id: 'all', name: 'Todos os Contatos', count: 12450 },
  { id: 'vip', name: 'Clientes VIP', count: 340 },
  { id: 'active30', name: 'Ativos (30 dias)', count: 8900 },
  { id: 'buyers', name: 'Compradores', count: 4200 },
  { id: 'abandoned', name: 'Carrinho Abandonado', count: 680 },
  { id: 'new', name: 'Novos Assinantes (7d)', count: 420 },
  { id: 'whatsapp', name: 'Opt-in SMS', count: 6800 },
]

const quickTemplates = [
  { id: '1', name: 'Flash Sale', text: '{nome}, FLASH SALE! 🔥 Até 50% OFF por tempo limitado. Aproveite: {link}' },
  { id: '2', name: 'Cupom Exclusivo', text: '{nome}, seu cupom exclusivo: {cupom} — válido por 24h! Compre agora: {link}' },
  { id: '3', name: 'Lembrete Carrinho', text: '{nome}, seus itens ainda estão no carrinho! Finalize com 10% OFF usando: VOLTE10 → {link}' },
  { id: '4', name: 'Novo Produto', text: '✨ Novidade! {nome}, acabou de chegar na loja. Veja em primeira mão: {link}' },
  { id: '5', name: 'Última Chance', text: '⏰ ÚLTIMA CHANCE {nome}! Promoção acaba HOJE. Não perca: {link}' },
]

const variables = [
  { key: '{nome}', label: 'Nome do contato' },
  { key: '{cupom}', label: 'Código do cupom' },
  { key: '{link}', label: 'Link rastreado' },
  { key: '{loja}', label: 'Nome da loja' },
  { key: '{valor}', label: 'Valor do carrinho' },
]

export default function SMSCreatePage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [campaignName, setCampaignName] = useState('')
  const [selectedAudience, setSelectedAudience] = useState<string | null>(null)
  const [messageText, setMessageText] = useState('')
  const [sendType, setSendType] = useState<'now' | 'scheduled'>('now')
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const [showTemplates, setShowTemplates] = useState(false)

  const charCount = messageText.length
  const smsCount = charCount <= 160 ? 1 : Math.ceil(charCount / 153)
  const selectedAudienceData = audiences.find((a) => a.id === selectedAudience)
  const estimatedCredits = (selectedAudienceData?.count || 0) * smsCount

  const steps = [
    { id: 1, label: 'Audiência' },
    { id: 2, label: 'Mensagem' },
    { id: 3, label: 'Agendar' },
    { id: 4, label: 'Revisar' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/sms')}
            className="p-2 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-white transition-colors"
          >
            <ArrowLeft size={18} weight="bold" />
          </button>
          <div>
            <h1 className="text-2xl font-bold font-display text-gray-900">Nova Campanha SMS</h1>
            <p className="text-sm text-gray-500 mt-0.5">Configure e envie sua campanha SMS</p>
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2 flex-1">
            <button
              onClick={() => s.id < step && setStep(s.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors w-full justify-center ${
                step === s.id
                  ? 'bg-brand-500 text-white'
                  : step > s.id
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'bg-gray-50 text-gray-500'
              }`}
            >
              {step > s.id ? <CheckCircle size={14} weight="fill" /> : <span className="text-xs">{s.id}</span>}
              {s.label}
            </button>
            {i < steps.length - 1 && <div className="w-4 h-px bg-gray-100 flex-shrink-0" />}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2">
          {/* Step 1: Audience */}
          {step === 1 && (
            <div className="bg-white/50 border border-gray-200 rounded-xl p-6 space-y-5">
              <div>
                <label className="block text-xs text-gray-500 mb-1.5 font-medium">Nome da Campanha</label>
                <input
                  type="text"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="Ex: Flash Sale Março"
                  className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-3 font-medium">Selecione a Audiência</label>
                <div className="space-y-2">
                  {audiences.map((aud) => (
                    <button
                      key={aud.id}
                      onClick={() => setSelectedAudience(aud.id)}
                      className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
                        selectedAudience === aud.id
                          ? 'border-[#F26B2A] bg-brand-500/5'
                          : 'border-gray-200 bg-gray-50/30 hover:border-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <UsersThree size={18} className={selectedAudience === aud.id ? 'text-[#F26B2A]' : 'text-gray-500'} />
                        <span className="text-sm text-gray-700 font-medium">{aud.name}</span>
                      </div>
                      <span className="text-xs text-gray-500">{aud.count.toLocaleString('pt-BR')} contatos</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => step === 1 && campaignName && selectedAudience && setStep(2)}
                  disabled={!campaignName || !selectedAudience}
                  className="px-6 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity"
                >
                  Próximo
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Message */}
          {step === 2 && (
            <div className="bg-white/50 border border-gray-200 rounded-xl p-6 space-y-5">
              <div className="flex items-center justify-between">
                <label className="block text-xs text-gray-500 font-medium">Mensagem SMS</label>
                <button
                  onClick={() => setShowTemplates(!showTemplates)}
                  className="text-xs text-[#F26B2A] hover:text-[#F5A623] transition-colors"
                >
                  {showTemplates ? 'Fechar templates' : 'Usar template'}
                </button>
              </div>

              {showTemplates && (
                <div className="space-y-2">
                  {quickTemplates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => { setMessageText(t.text); setShowTemplates(false) }}
                      className="w-full text-left p-3 bg-gray-50/30 rounded-lg border border-gray-200 hover:border-gray-200 transition-colors"
                    >
                      <p className="text-xs text-[#F26B2A] font-medium mb-1">{t.name}</p>
                      <p className="text-xs text-gray-500">{t.text}</p>
                    </button>
                  ))}
                </div>
              )}

              <div className="relative">
                <textarea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Digite sua mensagem SMS aqui..."
                  rows={5}
                  className="w-full bg-white border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500 resize-none"
                />
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${charCount > 160 ? 'text-yellow-400' : 'text-gray-500'}`}>
                      {charCount}/160 caracteres
                    </span>
                    {smsCount > 1 && (
                      <span className="text-xs text-yellow-400">({smsCount} SMS)</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Variables */}
              <div>
                <p className="text-xs text-gray-500 mb-2">Variáveis disponíveis (clique para inserir)</p>
                <div className="flex flex-wrap gap-2">
                  {variables.map((v) => (
                    <button
                      key={v.key}
                      onClick={() => setMessageText((prev) => prev + v.key)}
                      className="px-2.5 py-1 bg-gray-50 rounded-lg text-xs text-gray-500 hover:text-[#F26B2A] hover:bg-brand-500/10 transition-colors font-mono"
                    >
                      {v.key}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <button onClick={() => setStep(1)} className="text-sm text-gray-500 hover:text-white transition-colors">
                  Voltar
                </button>
                <button
                  onClick={() => messageText.trim() && setStep(3)}
                  disabled={!messageText.trim()}
                  className="px-6 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity"
                >
                  Próximo
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Schedule */}
          {step === 3 && (
            <div className="bg-white/50 border border-gray-200 rounded-xl p-6 space-y-5">
              <h3 className="text-sm font-semibold text-gray-900">Quando enviar?</h3>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setSendType('now')}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    sendType === 'now' ? 'border-[#F26B2A] bg-brand-500/5' : 'border-gray-200 bg-gray-50/30 hover:border-gray-200'
                  }`}
                >
                  <Lightning size={20} className={sendType === 'now' ? 'text-[#F26B2A]' : 'text-gray-500'} weight="fill" />
                  <p className="text-sm text-gray-700 font-medium mt-2">Enviar Agora</p>
                  <p className="text-xs text-gray-500 mt-0.5">Envio imediato para toda a audiência</p>
                </button>
                <button
                  onClick={() => setSendType('scheduled')}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    sendType === 'scheduled' ? 'border-[#F26B2A] bg-brand-500/5' : 'border-gray-200 bg-gray-50/30 hover:border-gray-200'
                  }`}
                >
                  <CalendarBlank size={20} className={sendType === 'scheduled' ? 'text-[#F26B2A]' : 'text-gray-500'} weight="fill" />
                  <p className="text-sm text-gray-700 font-medium mt-2">Agendar</p>
                  <p className="text-xs text-gray-500 mt-0.5">Escolha data e horário de envio</p>
                </button>
              </div>

              {sendType === 'scheduled' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5 font-medium">Data</label>
                    <input
                      type="date"
                      value={scheduleDate}
                      onChange={(e) => setScheduleDate(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5 font-medium">Horário</label>
                    <input
                      type="time"
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-brand-500"
                    />
                  </div>
                </div>
              )}

              <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 flex items-start gap-3">
                <Info size={16} className="text-blue-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-blue-300">
                  SMS são enviados apenas para contatos com opt-in ativo. Horários permitidos: 8h às 20h (horário local do destinatário).
                </p>
              </div>

              <div className="flex items-center justify-between">
                <button onClick={() => setStep(2)} className="text-sm text-gray-500 hover:text-white transition-colors">
                  Voltar
                </button>
                <button
                  onClick={() => setStep(4)}
                  className="px-6 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
                >
                  Próximo
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {step === 4 && (
            <div className="bg-white/50 border border-gray-200 rounded-xl p-6 space-y-5">
              <h3 className="text-sm font-semibold text-gray-900">Revisão da Campanha</h3>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50/30 rounded-lg p-4">
                    <p className="text-xs text-gray-500">Nome</p>
                    <p className="text-sm text-gray-700 font-medium mt-1">{campaignName}</p>
                  </div>
                  <div className="bg-gray-50/30 rounded-lg p-4">
                    <p className="text-xs text-gray-500">Audiência</p>
                    <p className="text-sm text-gray-700 font-medium mt-1">{selectedAudienceData?.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{selectedAudienceData?.count.toLocaleString('pt-BR')} contatos</p>
                  </div>
                  <div className="bg-gray-50/30 rounded-lg p-4">
                    <p className="text-xs text-gray-500">Envio</p>
                    <p className="text-sm text-gray-700 font-medium mt-1">
                      {sendType === 'now' ? 'Imediato' : `${scheduleDate} às ${scheduleTime}`}
                    </p>
                  </div>
                  <div className="bg-gray-50/30 rounded-lg p-4">
                    <p className="text-xs text-gray-500">Créditos SMS</p>
                    <p className="text-sm text-gray-700 font-medium mt-1">{estimatedCredits.toLocaleString('pt-BR')} créditos</p>
                    <p className="text-xs text-gray-500 mt-0.5">{smsCount} SMS por contato</p>
                  </div>
                </div>

                <div className="bg-gray-50/30 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-2">Mensagem</p>
                  <p className="text-sm text-gray-700 leading-relaxed font-mono bg-white/50 rounded-lg p-3">
                    {messageText}
                  </p>
                  <p className="text-xs text-gray-400 mt-2">{charCount} caracteres · {smsCount} SMS</p>
                </div>
              </div>

              {charCount > 320 && (
                <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3 flex items-start gap-3">
                  <WarningCircle size={16} className="text-yellow-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-yellow-300">
                    Mensagem longa ({smsCount} SMS). Considere reduzir para diminuir custos.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between">
                <button onClick={() => setStep(3)} className="text-sm text-gray-500 hover:text-white transition-colors">
                  Voltar
                </button>
                <button className="flex items-center gap-2 px-6 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity shadow-sm">
                  <PaperPlaneTilt size={16} weight="bold" />
                  {sendType === 'now' ? 'Enviar Agora' : 'Agendar Envio'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Preview */}
        <div className="space-y-4">
          {/* Phone Preview */}
          <div className="bg-white/50 border border-gray-200 rounded-xl overflow-hidden sticky top-20">
            <div className="px-4 py-3 border-b border-gray-200">
              <span className="text-xs font-medium text-gray-500">Preview SMS</span>
            </div>
            <div className="p-4 bg-zinc-950">
              {/* Phone mockup */}
              <div className="mx-auto w-64 bg-white rounded-3xl border-2 border-gray-200 overflow-hidden">
                {/* Status bar */}
                <div className="h-6 bg-gray-50 flex items-center justify-center">
                  <div className="w-16 h-1 rounded-full bg-zinc-600" />
                </div>
                {/* Header */}
                <div className="px-4 py-3 bg-gray-50/50 border-b border-gray-200">
                  <p className="text-xs text-gray-500 text-center">Mensagem SMS</p>
                  <p className="text-[10px] text-gray-400 text-center mt-0.5">Sua Loja</p>
                </div>
                {/* Message */}
                <div className="px-4 py-6 min-h-[200px]">
                  {messageText ? (
                    <div className="bg-gray-50 rounded-2xl rounded-tl-sm px-3 py-2.5 max-w-[90%]">
                      <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">
                        {messageText
                          .replace(/\{nome\}/g, 'Maria')
                          .replace(/\{cupom\}/g, 'PROMO20')
                          .replace(/\{link\}/g, 'loja.co/oferta')
                          .replace(/\{loja\}/g, 'Minha Loja')
                          .replace(/\{valor\}/g, 'R$ 349,90')}
                      </p>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <DeviceMobileSpeaker size={24} className="text-zinc-700 mx-auto mb-2" weight="duotone" />
                      <p className="text-[10px] text-gray-400">Digite a mensagem para ver o preview</p>
                    </div>
                  )}
                </div>
                {/* Bottom */}
                <div className="h-4 bg-gray-50/30" />
              </div>
            </div>
          </div>

          {/* Cost Estimate */}
          {selectedAudienceData && (
            <div className="bg-white/50 border border-gray-200 rounded-xl p-5">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Estimativa de Custo</h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Destinatários</span>
                  <span className="text-sm text-gray-700">{selectedAudienceData.count.toLocaleString('pt-BR')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">SMS por contato</span>
                  <span className="text-sm text-gray-700">{smsCount}</span>
                </div>
                <div className="w-full h-px bg-gray-50" />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 font-medium">Total de créditos</span>
                  <span className="text-sm text-[#F26B2A] font-bold">{estimatedCredits.toLocaleString('pt-BR')}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
