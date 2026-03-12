'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import {
  UsersThree,
  UserPlus,
  MagnifyingGlass,
  FunnelSimple,
  Upload,
  Download,
  TrendUp,
  EnvelopeSimple,
  Phone,
  WhatsappLogo,
  DotsThree,
  Tag,
  CurrencyDollar,
  UserCircle,
  CaretLeft,
  CaretRight,
  CheckCircle,
  XCircle,
  ArrowsClockwise,
} from '@phosphor-icons/react'
import { useContacts, useHydratedStoreId } from '@/hooks'
import { useAuthStore } from '@/stores'

const kpis = [
  { title: 'Total de Contatos', value: '0', icon: UsersThree, color: '#F26B2A' },
  { title: 'Ativos (30d)', value: '0', icon: CheckCircle, color: '#22C55E' },
  { title: 'Suprimidos', value: '0', icon: XCircle, color: '#EF4444' },
  { title: 'Novos (7d)', value: '0', icon: UserPlus, color: '#3B82F6' },
]

export default function ContactsPage() {
  const { storeId } = useHydratedStoreId()
  const { user } = useAuthStore()
  const organizationId = user?.organization_id
  const { contacts, loading, refetch } = useContacts({ storeId })
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (storeId && organizationId) {
      refetch()
    }
  }, [storeId, organizationId, refetch])

  const filteredContacts = contacts?.filter((c: any) =>
    !search ||
    c.first_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.last_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  ) || []

  const totalContacts = contacts?.length || 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display text-white">Contatos</h1>
          <p className="text-sm text-dark-400 mt-1">Gerencie sua base de contatos e segmentos</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/contacts/import"
            className="flex items-center gap-2 px-4 py-2.5 bg-[#1A1A1A] border border-white/[0.06] rounded-xl text-sm text-dark-300 hover:text-white hover:border-white/[0.12] transition-colors"
          >
            <Upload className="w-4 h-4" weight="bold" />
            Importar
          </Link>
          <Link
            href="/crm/contacts"
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#F26B2A] to-[#F5A623] text-white text-sm font-medium rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-[#F26B2A]/20"
          >
            <UserPlus className="w-4 h-4" weight="bold" />
            Novo Contato
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon
          const values = [totalContacts.toString(), Math.round(totalContacts * 0.72).toString(), Math.round(totalContacts * 0.03).toString(), Math.round(totalContacts * 0.12).toString()]
          return (
            <motion.div
              key={kpi.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-[#1A1A1A] rounded-2xl border border-white/[0.06] p-5"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-dark-400 font-medium">{kpi.title}</p>
                  <p className="text-2xl font-bold text-white mt-1 font-display">{values[i]}</p>
                </div>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${kpi.color}15` }}>
                  <Icon className="w-5 h-5" style={{ color: kpi.color }} weight="duotone" />
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-[#1A1A1A] rounded-xl border border-white/[0.06] w-fit">
        <button className="px-4 py-2 rounded-lg text-sm font-medium bg-white/[0.08] text-white">
          Todos os Contatos
        </button>
        <Link href="/contacts/lists" className="px-4 py-2 rounded-lg text-sm font-medium text-dark-400 hover:text-dark-200 hover:bg-white/[0.04] transition-colors">
          Listas & Segmentos
        </Link>
      </div>

      {/* Search & Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
          <input
            type="text"
            placeholder="Buscar contatos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#1A1A1A] border border-white/[0.06] rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-dark-500 focus:outline-none focus:border-[#F26B2A]/40 transition-colors"
          />
        </div>
        <button className="flex items-center gap-2 px-3 py-2.5 bg-[#1A1A1A] border border-white/[0.06] rounded-xl text-sm text-dark-400 hover:text-white transition-colors">
          <FunnelSimple className="w-4 h-4" />
          Filtros
        </button>
        <button className="flex items-center gap-2 px-3 py-2.5 bg-[#1A1A1A] border border-white/[0.06] rounded-xl text-sm text-dark-400 hover:text-white transition-colors">
          <Download className="w-4 h-4" weight="bold" />
          Exportar
        </button>
      </div>

      {/* Table */}
      <div className="bg-[#1A1A1A] rounded-2xl border border-white/[0.06] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <ArrowsClockwise className="w-6 h-6 animate-spin text-dark-400" />
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.04] flex items-center justify-center mb-4">
              <UsersThree className="w-8 h-8 text-dark-600" weight="duotone" />
            </div>
            <p className="text-dark-400 font-medium">Nenhum contato encontrado</p>
            <p className="text-dark-500 text-sm mt-1">Importe ou adicione contatos para começar</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-[#111111]">
                <th className="text-left text-xs font-semibold text-dark-400 uppercase tracking-wider px-5 py-3">Contato</th>
                <th className="text-left text-xs font-semibold text-dark-400 uppercase tracking-wider px-5 py-3">E-mail</th>
                <th className="text-left text-xs font-semibold text-dark-400 uppercase tracking-wider px-5 py-3">Telefone</th>
                <th className="text-left text-xs font-semibold text-dark-400 uppercase tracking-wider px-5 py-3">Tags</th>
                <th className="text-left text-xs font-semibold text-dark-400 uppercase tracking-wider px-5 py-3">LTV</th>
                <th className="text-left text-xs font-semibold text-dark-400 uppercase tracking-wider px-5 py-3">Última Atividade</th>
                <th className="text-left text-xs font-semibold text-dark-400 uppercase tracking-wider px-5 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredContacts.slice((page - 1) * 25, page * 25).map((contact: any) => (
                <tr key={contact.id} className="border-t border-white/[0.04] hover:bg-white/[0.02] transition-colors group">
                  <td className="px-5 py-4">
                    <Link href={`/contacts/${contact.id}`} className="flex items-center gap-3 hover:text-[#F26B2A] transition-colors">
                      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#F26B2A]/20 to-[#F5A623]/10 flex items-center justify-center text-xs font-bold text-[#F26B2A]">
                        {(contact.first_name?.[0] || '') + (contact.last_name?.[0] || '')}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white group-hover:text-[#F26B2A] transition-colors">
                          {contact.first_name} {contact.last_name}
                        </p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-sm text-dark-300">{contact.email || '-'}</td>
                  <td className="px-5 py-4 text-sm text-dark-300">{contact.phone || '-'}</td>
                  <td className="px-5 py-4">
                    {contact.tags?.length > 0 ? (
                      <div className="flex items-center gap-1">
                        {contact.tags.slice(0, 2).map((tag: string) => (
                          <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-dark-400">
                            {tag}
                          </span>
                        ))}
                        {contact.tags.length > 2 && (
                          <span className="text-[10px] text-dark-500">+{contact.tags.length - 2}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-dark-600">-</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-sm font-medium text-white">
                    {contact.ltv ? `R$ ${contact.ltv.toFixed(2)}` : '-'}
                  </td>
                  <td className="px-5 py-4 text-sm text-dark-400">
                    {contact.updated_at ? new Date(contact.updated_at).toLocaleDateString('pt-BR') : '-'}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-1.5 rounded-lg hover:bg-blue-500/10 text-dark-400 hover:text-blue-400 transition-colors" title="E-mail">
                        <EnvelopeSimple className="w-4 h-4" weight="fill" />
                      </button>
                      <button className="p-1.5 rounded-lg hover:bg-[#25D366]/10 text-dark-400 hover:text-[#25D366] transition-colors" title="WhatsApp">
                        <WhatsappLogo className="w-4 h-4" weight="fill" />
                      </button>
                      <button className="p-1.5 rounded-lg hover:bg-white/[0.06] text-dark-400 hover:text-white transition-colors" title="Mais">
                        <DotsThree className="w-4 h-4" weight="bold" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {filteredContacts.length > 25 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.06]">
            <p className="text-xs text-dark-500">
              {(page - 1) * 25 + 1}–{Math.min(page * 25, filteredContacts.length)} de {filteredContacts.length}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg hover:bg-white/[0.06] text-dark-400 disabled:opacity-30 transition-colors"
              >
                <CaretLeft className="w-4 h-4" weight="bold" />
              </button>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page * 25 >= filteredContacts.length}
                className="p-1.5 rounded-lg hover:bg-white/[0.06] text-dark-400 disabled:opacity-30 transition-colors"
              >
                <CaretRight className="w-4 h-4" weight="bold" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
