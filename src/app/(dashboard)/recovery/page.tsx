'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  ShoppingCartSimple,
  CurrencyDollar,
  ArrowClockwise,
  TrendUp,
  WhatsappLogo,
  EnvelopeSimple,
  Eye,
  CreditCard,
  Barcode,
  PixLogo,
  Robot,
  Lightning,
} from '@phosphor-icons/react'

const tabs = [
  { id: 'cart', label: 'Carrinhos Abandonados', icon: ShoppingCartSimple, count: 47 },
  { id: 'pix', label: 'PIX Pendente', icon: PixLogo, count: 12 },
  { id: 'boleto', label: 'Boletos', icon: Barcode, count: 8 },
  { id: 'card', label: 'Cartões Recusados', icon: CreditCard, count: 5 },
]

const kpiCards = [
  { title: 'Valor em Carrinhos', value: 'R$ 47.832', change: '+12%', positive: true, icon: ShoppingCartSimple },
  { title: 'Valor Recuperado', value: 'R$ 18.450', change: '+28%', positive: true, icon: CurrencyDollar, highlight: true },
  { title: 'Taxa de Recuperação', value: '38.6%', change: '+5.2%', positive: true, icon: ArrowClockwise },
  { title: 'ROI da IA', value: '4.2x', change: '+0.8x', positive: true, icon: Robot },
]

const mockData = [
  { id: '#4521', customer: 'Ana Silva', email: 'ana@email.com', value: 'R$ 459,90', date: '2h atrás', status: 'Abandonado', aiStatus: 'Enviado' },
  { id: '#4520', customer: 'Carlos Lima', email: 'carlos@email.com', value: 'R$ 1.290,00', date: '3h atrás', status: 'Recuperado', aiStatus: 'Recuperado' },
  { id: '#4519', customer: 'Maria Costa', email: 'maria@email.com', value: 'R$ 189,90', date: '5h atrás', status: 'Abandonado', aiStatus: 'Não tentou' },
  { id: '#4518', customer: 'João Santos', email: 'joao@email.com', value: 'R$ 2.150,00', date: '6h atrás', status: 'Expirado', aiStatus: 'Falhou' },
  { id: '#4517', customer: 'Fernanda Dias', email: 'fer@email.com', value: 'R$ 349,90', date: '8h atrás', status: 'Abandonado', aiStatus: 'Enviado' },
]

export default function RecoveryPage() {
  const [activeTab, setActiveTab] = useState('cart')

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display text-white">Recuperação de Vendas</h1>
          <p className="text-sm text-dark-400 mt-1">Monitore e recupere vendas perdidas com IA</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-medium text-green-400">IA Ativa</span>
          </div>
          <button className="px-4 py-2 bg-gradient-to-r from-[#F26B2A] to-[#F5A623] text-white text-sm font-medium rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-[#F26B2A]/20">
            Configurar IA
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon
          return (
            <motion.div
              key={kpi.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={`relative overflow-hidden rounded-2xl border p-5 transition-all ${
                kpi.highlight
                  ? 'bg-gradient-to-br from-[#F26B2A]/10 to-[#F5A623]/5 border-[#F26B2A]/20'
                  : 'bg-[#1A1A1A] border-white/[0.06]'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-dark-400 font-medium">{kpi.title}</p>
                  <p className="text-2xl font-bold text-white mt-1 font-display">{kpi.value}</p>
                  <div className="flex items-center gap-1 mt-2">
                    <TrendUp className="w-3.5 h-3.5 text-green-400" weight="bold" />
                    <span className="text-xs font-medium text-green-400">{kpi.change}</span>
                    <span className="text-xs text-dark-500">vs 30d</span>
                  </div>
                </div>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  kpi.highlight ? 'bg-[#F26B2A]/20' : 'bg-white/[0.06]'
                }`}>
                  <Icon className={`w-5 h-5 ${kpi.highlight ? 'text-[#F26B2A]' : 'text-dark-400'}`} weight="duotone" />
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-[#1A1A1A] rounded-xl border border-white/[0.06] w-fit">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-white/[0.08] text-white'
                  : 'text-dark-400 hover:text-dark-200 hover:bg-white/[0.04]'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-[#F26B2A]' : ''}`} weight={isActive ? 'fill' : 'regular'} />
              {tab.label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                isActive ? 'bg-[#F26B2A]/15 text-[#F26B2A]' : 'bg-white/[0.06] text-dark-500'
              }`}>
                {tab.count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div className="bg-[#1A1A1A] rounded-2xl border border-white/[0.06] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-[#111111]">
              <th className="text-left text-xs font-semibold text-dark-400 uppercase tracking-wider px-5 py-3">Pedido</th>
              <th className="text-left text-xs font-semibold text-dark-400 uppercase tracking-wider px-5 py-3">Cliente</th>
              <th className="text-left text-xs font-semibold text-dark-400 uppercase tracking-wider px-5 py-3">Valor</th>
              <th className="text-left text-xs font-semibold text-dark-400 uppercase tracking-wider px-5 py-3">Data</th>
              <th className="text-left text-xs font-semibold text-dark-400 uppercase tracking-wider px-5 py-3">Status</th>
              <th className="text-left text-xs font-semibold text-dark-400 uppercase tracking-wider px-5 py-3">IA Status</th>
              <th className="text-left text-xs font-semibold text-dark-400 uppercase tracking-wider px-5 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {mockData.map((item) => (
              <tr key={item.id} className="border-t border-white/[0.04] hover:bg-white/[0.02] transition-colors group">
                <td className="px-5 py-4 text-sm font-medium text-white">{item.id}</td>
                <td className="px-5 py-4">
                  <div>
                    <p className="text-sm font-medium text-white">{item.customer}</p>
                    <p className="text-xs text-dark-500">{item.email}</p>
                  </div>
                </td>
                <td className="px-5 py-4 text-sm font-semibold text-white">{item.value}</td>
                <td className="px-5 py-4 text-sm text-dark-400">{item.date}</td>
                <td className="px-5 py-4">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                    item.status === 'Recuperado' ? 'bg-green-500/10 text-green-400' :
                    item.status === 'Expirado' ? 'bg-red-500/10 text-red-400' :
                    'bg-amber-500/10 text-amber-400'
                  }`}>
                    {item.status}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                    item.aiStatus === 'Recuperado' ? 'bg-green-500/10 text-green-400' :
                    item.aiStatus === 'Enviado' ? 'bg-blue-500/10 text-blue-400' :
                    item.aiStatus === 'Falhou' ? 'bg-red-500/10 text-red-400' :
                    'bg-dark-700 text-dark-400'
                  }`}>
                    <Robot className="w-3 h-3" weight="fill" />
                    {item.aiStatus}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="p-1.5 rounded-lg hover:bg-[#25D366]/10 text-dark-400 hover:text-[#25D366] transition-colors" title="Enviar WhatsApp">
                      <WhatsappLogo className="w-4 h-4" weight="fill" />
                    </button>
                    <button className="p-1.5 rounded-lg hover:bg-blue-500/10 text-dark-400 hover:text-blue-400 transition-colors" title="Enviar E-mail">
                      <EnvelopeSimple className="w-4 h-4" weight="fill" />
                    </button>
                    <button className="p-1.5 rounded-lg hover:bg-white/[0.06] text-dark-400 hover:text-white transition-colors" title="Ver Detalhes">
                      <Eye className="w-4 h-4" weight="fill" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
