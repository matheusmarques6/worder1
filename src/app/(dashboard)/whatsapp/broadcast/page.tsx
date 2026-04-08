'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  WhatsappLogo,
  PaperPlaneTilt,
  CurrencyDollar,
  Eye,
  CursorClick,
  TrendUp,
  Plus,
  MagnifyingGlass,
  Clock,
  CheckCircle,
  XCircle,
  Pause,
  UsersThree,
  Lightning,
  Image,
  FileText,
  VideoCamera,
  ChatCircleDots,
  ArrowRight,
  Warning,
} from '@phosphor-icons/react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

const broadcastKpis = [
  { title: 'Broadcasts Enviados', value: '8.200', change: '+24%', positive: true, icon: PaperPlaneTilt },
  { title: 'Taxa de Leitura', value: '89.4%', change: '+2.1%', positive: true, icon: Eye },
  { title: 'Taxa de Resposta', value: '12.8%', change: '+1.4%', positive: true, icon: ChatCircleDots },
  { title: 'Receita Atribuída', value: 'R$ 34.200', change: '+28%', positive: true, icon: CurrencyDollar },
]

const weeklyData = [
  { day: 'Seg', sent: 1200, read: 1068, replied: 156 },
  { day: 'Ter', sent: 1400, read: 1260, replied: 182 },
  { day: 'Qua', sent: 1100, read: 990, replied: 132 },
  { day: 'Qui', sent: 1600, read: 1424, replied: 208 },
  { day: 'Sex', sent: 1800, read: 1602, replied: 234 },
  { day: 'Sáb', sent: 600, read: 534, replied: 72 },
  { day: 'Dom', sent: 500, read: 445, replied: 60 },
]

const broadcasts = [
  {
    name: 'Promoção Dia do Consumidor',
    status: 'sent',
    type: 'image',
    audience: 'Compradores Recorrentes',
    sent: 3200,
    read: 2880,
    replied: 416,
    revenue: 'R$ 18.200',
    date: '12 Mar 14:00',
  },
  {
    name: 'Lançamento Nova Coleção',
    status: 'sent',
    type: 'video',
    audience: 'Alto Valor (VIP)',
    sent: 1840,
    read: 1656,
    replied: 258,
    revenue: 'R$ 9.800',
    date: '10 Mar 10:00',
  },
  {
    name: 'Cupom Exclusivo WhatsApp',
    status: 'active',
    type: 'text',
    audience: 'Engajados E-mail',
    sent: 2400,
    read: 2160,
    replied: 312,
    revenue: 'R$ 6.200',
    date: '08 Mar 15:00',
  },
  {
    name: 'Reativação Clientes 90d',
    status: 'scheduled',
    type: 'image',
    audience: 'Risco de Churn',
    sent: 0,
    read: 0,
    replied: 0,
    revenue: '—',
    date: '15 Mar 11:00',
  },
]

const templateTypes = [
  { type: 'text', icon: FileText, label: 'Texto' },
  { type: 'image', icon: Image, label: 'Imagem' },
  { type: 'video', icon: VideoCamera, label: 'Vídeo' },
]

const statusConfig: Record<string, { label: string; color: string }> = {
  sent: { label: 'Enviado', color: 'bg-blue-500/10 text-blue-400' },
  active: { label: 'Ativo', color: 'bg-emerald-500/10 text-emerald-400' },
  scheduled: { label: 'Agendado', color: 'bg-yellow-500/10 text-yellow-400' },
  failed: { label: 'Falhou', color: 'bg-red-500/10 text-red-400' },
}

export default function WhatsAppBroadcastPage() {
  const [showCreate, setShowCreate] = useState(false)
  const [selectedType, setSelectedType] = useState('text')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
            <WhatsappLogo size={22} className="text-green-400" weight="fill" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display text-gray-900">WhatsApp Broadcast</h1>
            <p className="text-sm text-gray-500 mt-0.5">Envie mensagens em massa via WhatsApp Business API</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
        >
          <Plus size={16} />
          Novo Broadcast
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {broadcastKpis.map((kpi, i) => {
          const Icon = kpi.icon
          return (
            <motion.div
              key={kpi.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-white/50 border border-gray-200 rounded-xl p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon size={16} className="text-gray-500" />
                <span className="text-xs text-gray-500">{kpi.title}</span>
              </div>
              <p className="text-xl font-bold text-gray-900">{kpi.value}</p>
              <span className="text-xs text-emerald-400">{kpi.change}</span>
            </motion.div>
          )
        })}
      </div>

      {/* Create Broadcast Panel */}
      {showCreate && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="bg-white/50 border border-green-500/30 rounded-xl p-6"
        >
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Criar Broadcast</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Nome do Broadcast</label>
                <input
                  type="text"
                  placeholder="Ex: Promoção de Março"
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Tipo de Mensagem</label>
                <div className="flex gap-2">
                  {templateTypes.map((t) => {
                    const Icon = t.icon
                    return (
                      <button
                        key={t.type}
                        onClick={() => setSelectedType(t.type)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                          selectedType === t.type
                            ? 'border-green-500 bg-green-500/5 text-white'
                            : 'border-gray-200 text-gray-500 hover:border-gray-200'
                        }`}
                      >
                        <Icon size={16} />
                        {t.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Mensagem</label>
                <textarea
                  rows={4}
                  placeholder="Digite sua mensagem... Use {{nome}} para personalizar"
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-500 resize-none"
                />
                <p className="text-xs text-gray-400 mt-1">Variáveis: {'{{nome}}'}, {'{{produto}}'}, {'{{valor}}'}, {'{{cupom}}'}, {'{{link}}'}</p>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Audiência</label>
                <select className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-green-500">
                  <option>Compradores Recorrentes (3.420)</option>
                  <option>Alto Valor - VIP (1.840)</option>
                  <option>Novos Leads 7d (820)</option>
                  <option>Engajados E-mail (8.900)</option>
                  <option>Risco de Churn (2.100)</option>
                </select>
              </div>
            </div>

            {/* Preview */}
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Preview</label>
              <div className="bg-[#0B141A] rounded-xl p-4">
                <div className="flex items-center gap-3 pb-3 border-b border-gray-200/50 mb-4">
                  <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center">
                    <WhatsappLogo size={16} className="text-white" weight="fill" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-700 font-medium">Sua Loja</p>
                    <p className="text-xs text-gray-500">Business Account</p>
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="bg-[#202C33] rounded-lg rounded-tl-none px-3 py-2 max-w-[260px]">
                    <p className="text-sm text-gray-700 leading-relaxed">
                      Olá {'{{nome}}'}! 🎉 Temos uma promoção exclusiva para você. Use o cupom {'{{cupom}}'} e ganhe desconto especial!
                    </p>
                    <p className="text-xs text-gray-500 text-right mt-1">14:32 ✓✓</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
                <div className="flex items-start gap-2">
                  <Warning size={16} className="text-yellow-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-yellow-400 font-medium">Atenção</p>
                    <p className="text-xs text-gray-500">Templates de broadcast precisam ser aprovados pela Meta antes do envio.</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex gap-3">
                <button className="flex-1 px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:opacity-90 text-sm font-medium">
                  Enviar Agora
                </button>
                <button className="px-4 py-2 bg-gray-50 text-gray-500 rounded-lg hover:bg-gray-100 text-sm">
                  Agendar
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Weekly Performance */}
      <div className="bg-white/50 border border-gray-200 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Performance Semanal</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={weeklyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="day" stroke="#71717a" fontSize={12} />
            <YAxis stroke="#71717a" fontSize={12} />
            <Tooltip
              contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px' }}
              labelStyle={{ color: '#fff' }}
            />
            <Bar dataKey="sent" fill="#25D366" radius={[4, 4, 0, 0]} name="Enviados" />
            <Bar dataKey="read" fill="#128C7E" radius={[4, 4, 0, 0]} name="Lidos" />
            <Bar dataKey="replied" fill="#075E54" radius={[4, 4, 0, 0]} name="Respostas" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Broadcasts Table */}
      <div className="bg-white/50 border border-gray-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">Broadcasts Recentes</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left text-xs text-gray-500 font-medium p-4 pb-3">Broadcast</th>
              <th className="text-left text-xs text-gray-500 font-medium p-4 pb-3">Status</th>
              <th className="text-left text-xs text-gray-500 font-medium p-4 pb-3">Audiência</th>
              <th className="text-right text-xs text-gray-500 font-medium p-4 pb-3">Enviados</th>
              <th className="text-right text-xs text-gray-500 font-medium p-4 pb-3">Lidos</th>
              <th className="text-right text-xs text-gray-500 font-medium p-4 pb-3">Respostas</th>
              <th className="text-right text-xs text-gray-500 font-medium p-4 pb-3">Receita</th>
            </tr>
          </thead>
          <tbody>
            {broadcasts.map((bc, i) => {
              const status = statusConfig[bc.status]
              const TypeIcon = templateTypes.find(t => t.type === bc.type)?.icon || FileText
              return (
                <tr key={i} className="border-b border-gray-200/50 hover:bg-gray-50/30 transition-colors cursor-pointer">
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <TypeIcon size={16} className="text-gray-500" />
                      <span className="text-sm text-gray-700 font-medium">{bc.name}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
                      {status.label}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-gray-500">{bc.audience}</td>
                  <td className="p-4 text-sm text-gray-500 text-right">{bc.sent.toLocaleString('pt-BR')}</td>
                  <td className="p-4 text-sm text-gray-500 text-right">{bc.read.toLocaleString('pt-BR')}</td>
                  <td className="p-4 text-sm text-gray-500 text-right">{bc.replied.toLocaleString('pt-BR')}</td>
                  <td className="p-4 text-sm text-emerald-400 font-medium text-right">{bc.revenue}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
