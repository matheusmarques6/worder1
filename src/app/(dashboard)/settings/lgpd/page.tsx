'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  ShieldCheck,
  Lock,
  Eye,
  UserMinus,
  FileText,
  Download,
  Trash,
  CheckCircle,
  Warning,
  Clock,
  EnvelopeSimple,
  Cookie,
  ToggleRight,
  ToggleLeft,
  MagnifyingGlass,
  ArrowRight,
  Export,
  Fingerprint,
} from '@phosphor-icons/react'

const complianceStatus = [
  { title: 'Consentimento de Coleta', status: 'compliant', description: 'Pixel e formulários com opt-in ativo' },
  { title: 'Política de Privacidade', status: 'compliant', description: 'Política atualizada e publicada' },
  { title: 'Direito ao Esquecimento', status: 'compliant', description: 'Processo automatizado de exclusão' },
  { title: 'Portabilidade de Dados', status: 'compliant', description: 'Export de dados em JSON/CSV' },
  { title: 'Banner de Cookies', status: 'warning', description: 'Banner configurado mas sem granularidade' },
  { title: 'DPO Registrado', status: 'pending', description: 'Necessário designar encarregado' },
]

const consentSettings = [
  { id: 'marketing_email', label: 'E-mail Marketing', description: 'Envio de campanhas e newsletters', enabled: true },
  { id: 'marketing_sms', label: 'SMS Marketing', description: 'Envio de promoções por SMS', enabled: true },
  { id: 'marketing_whatsapp', label: 'WhatsApp Marketing', description: 'Mensagens promocionais via WhatsApp', enabled: true },
  { id: 'tracking', label: 'Rastreamento de Navegação', description: 'Pixel de tracking no site', enabled: true },
  { id: 'analytics', label: 'Analytics e Relatórios', description: 'Dados para análise de performance', enabled: true },
  { id: 'profiling', label: 'Perfilamento e Scoring', description: 'Lead scoring e segmentação automática', enabled: false },
]

const dataRequests = [
  { id: '#DR-001', type: 'Exclusão', contact: 'ana@email.com', date: '12 Mar 2026', status: 'completed', completedAt: '12 Mar 2026' },
  { id: '#DR-002', type: 'Exportação', contact: 'carlos@email.com', date: '11 Mar 2026', status: 'completed', completedAt: '11 Mar 2026' },
  { id: '#DR-003', type: 'Exclusão', contact: 'maria@email.com', date: '10 Mar 2026', status: 'processing', completedAt: null },
  { id: '#DR-004', type: 'Retificação', contact: 'joao@email.com', date: '09 Mar 2026', status: 'completed', completedAt: '09 Mar 2026' },
]

const retentionPolicies = [
  { data: 'Contatos Inativos', retention: '24 meses', action: 'Anonimizar', editable: true },
  { data: 'Dados de Navegação', retention: '12 meses', action: 'Excluir', editable: true },
  { data: 'Logs de E-mail', retention: '6 meses', action: 'Excluir', editable: true },
  { data: 'Dados de Compra', retention: '60 meses', action: 'Manter (fiscal)', editable: false },
  { data: 'Consentimentos', retention: 'Indefinido', action: 'Manter (legal)', editable: false },
]

const statusIcon: Record<string, { icon: React.ComponentType<any>; color: string; label: string }> = {
  compliant: { icon: CheckCircle, color: 'text-emerald-400', label: 'Conforme' },
  warning: { icon: Warning, color: 'text-yellow-400', label: 'Atenção' },
  pending: { icon: Clock, color: 'text-red-400', label: 'Pendente' },
}

const requestStatusColors: Record<string, string> = {
  completed: 'bg-emerald-500/10 text-emerald-400',
  processing: 'bg-yellow-500/10 text-yellow-400',
  pending: 'bg-zinc-500/10 text-zinc-400',
}

export default function LGPDPage() {
  const [consents, setConsents] = useState<Record<string, boolean>>(
    Object.fromEntries(consentSettings.map(c => [c.id, c.enabled]))
  )
  const [search, setSearch] = useState('')

  const toggleConsent = (id: string) => {
    setConsents(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const compliantCount = complianceStatus.filter(s => s.status === 'compliant').length
  const totalChecks = complianceStatus.length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <ShieldCheck size={22} className="text-emerald-400" weight="fill" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display text-white">LGPD & Privacidade</h1>
            <p className="text-sm text-zinc-400 mt-0.5">Gerencie conformidade, consentimento e dados pessoais</p>
          </div>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition-colors text-sm">
          <Export size={16} />
          Relatório de Conformidade
        </button>
      </div>

      {/* Compliance Score */}
      <div className="bg-gradient-to-r from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm text-emerald-400 font-medium">Score de Conformidade LGPD</h3>
            <p className="text-3xl font-bold text-white mt-1">
              {compliantCount}/{totalChecks}
              <span className="text-lg text-zinc-400 ml-2">
                ({((compliantCount / totalChecks) * 100).toFixed(0)}%)
              </span>
            </p>
          </div>
          <div className="w-20 h-20 rounded-full border-4 border-emerald-500/30 flex items-center justify-center">
            <ShieldCheck size={32} className="text-emerald-400" weight="fill" />
          </div>
        </div>
      </div>

      {/* Compliance Checklist */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Checklist de Conformidade</h3>
        <div className="space-y-3">
          {complianceStatus.map((item) => {
            const status = statusIcon[item.status]
            const StatusIcon = status.icon
            return (
              <div key={item.title} className="flex items-center justify-between py-3 border-b border-zinc-800/50 last:border-0">
                <div className="flex items-center gap-3">
                  <StatusIcon size={20} className={status.color} weight="fill" />
                  <div>
                    <p className="text-sm text-white font-medium">{item.title}</p>
                    <p className="text-xs text-zinc-500">{item.description}</p>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  item.status === 'compliant' ? 'bg-emerald-500/10 text-emerald-400' :
                  item.status === 'warning' ? 'bg-yellow-500/10 text-yellow-400' :
                  'bg-red-500/10 text-red-400'
                }`}>
                  {status.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Consent Management */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Fingerprint size={16} className="text-[#F26B2A]" />
            Gerenciamento de Consentimento
          </h3>
          <p className="text-xs text-zinc-500 mb-4">
            Configure quais tipos de consentimento são coletados dos contatos.
          </p>
          <div className="space-y-3">
            {consentSettings.map((consent) => (
              <div key={consent.id} className="flex items-center justify-between py-2 border-b border-zinc-800/50 last:border-0">
                <div>
                  <p className="text-sm text-white">{consent.label}</p>
                  <p className="text-xs text-zinc-500">{consent.description}</p>
                </div>
                <button onClick={() => toggleConsent(consent.id)}>
                  {consents[consent.id] ? (
                    <ToggleRight size={28} className="text-emerald-400" weight="fill" />
                  ) : (
                    <ToggleLeft size={28} className="text-zinc-600" weight="fill" />
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Data Retention */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Clock size={16} className="text-[#F26B2A]" />
            Políticas de Retenção de Dados
          </h3>
          <div className="space-y-3">
            {retentionPolicies.map((policy) => (
              <div key={policy.data} className="flex items-center justify-between py-2 border-b border-zinc-800/50 last:border-0">
                <div>
                  <p className="text-sm text-white">{policy.data}</p>
                  <p className="text-xs text-zinc-500">{policy.action}</p>
                </div>
                <div className="flex items-center gap-2">
                  {policy.editable ? (
                    <select className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white focus:outline-none">
                      <option>{policy.retention}</option>
                      <option>6 meses</option>
                      <option>12 meses</option>
                      <option>24 meses</option>
                      <option>36 meses</option>
                    </select>
                  ) : (
                    <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-1 rounded">{policy.retention}</span>
                  )}
                  {!policy.editable && <Lock size={12} className="text-zinc-600" />}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Data Subject Requests */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <UserMinus size={16} className="text-[#F26B2A]" />
            Solicitações de Titulares
          </h3>
          <div className="relative">
            <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Buscar por e-mail..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-[#F26B2A] w-48"
            />
          </div>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left text-xs text-zinc-500 font-medium pb-3">ID</th>
              <th className="text-left text-xs text-zinc-500 font-medium pb-3">Tipo</th>
              <th className="text-left text-xs text-zinc-500 font-medium pb-3">Contato</th>
              <th className="text-left text-xs text-zinc-500 font-medium pb-3">Solicitado em</th>
              <th className="text-left text-xs text-zinc-500 font-medium pb-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {dataRequests.map((req) => (
              <tr key={req.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                <td className="py-3 text-sm text-zinc-400 font-mono">{req.id}</td>
                <td className="py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    req.type === 'Exclusão' ? 'bg-red-500/10 text-red-400' :
                    req.type === 'Exportação' ? 'bg-blue-500/10 text-blue-400' :
                    'bg-yellow-500/10 text-yellow-400'
                  }`}>
                    {req.type}
                  </span>
                </td>
                <td className="py-3 text-sm text-white">{req.contact}</td>
                <td className="py-3 text-sm text-zinc-500">{req.date}</td>
                <td className="py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${requestStatusColors[req.status]}`}>
                    {req.status === 'completed' ? 'Concluído' : 'Processando'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cookie Banner Config */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Cookie size={16} className="text-[#F26B2A]" />
          Banner de Cookies
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-zinc-500 mb-1.5">Texto do Banner</label>
              <textarea
                rows={3}
                defaultValue="Utilizamos cookies para melhorar sua experiência. Ao continuar navegando, você concorda com nossa Política de Privacidade."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F26B2A] resize-none"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1.5">Link da Política de Privacidade</label>
              <input
                type="text"
                defaultValue="https://minhaloja.com.br/privacidade"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F26B2A]"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Preview</label>
            <div className="bg-zinc-950 rounded-lg p-4 border border-zinc-800">
              <div className="bg-zinc-800 rounded-lg p-4">
                <p className="text-xs text-zinc-300 mb-3">
                  Utilizamos cookies para melhorar sua experiência. Ao continuar navegando, você concorda com nossa Política de Privacidade.
                </p>
                <div className="flex items-center gap-2">
                  <button className="px-3 py-1 bg-[#F26B2A] text-white text-xs rounded hover:opacity-90">
                    Aceitar
                  </button>
                  <button className="px-3 py-1 bg-zinc-700 text-zinc-300 text-xs rounded hover:bg-zinc-600">
                    Configurar
                  </button>
                  <button className="text-xs text-zinc-500 hover:text-zinc-400 ml-auto">
                    Rejeitar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
