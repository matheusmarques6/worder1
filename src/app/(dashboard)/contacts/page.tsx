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

// KPIs are computed from real data below

export default function ContactsPage() {
  const { storeId } = useHydratedStoreId()
  const { user } = useAuthStore()
  const organizationId = user?.organization_id
  const { contacts, loading, refetch } = useContacts({ storeId })
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')

  useEffect(() => {
    if (organizationId) {
      refetch()
    }
  }, [storeId, organizationId, refetch])

  const handleSyncFromShopify = async () => {
    setSyncing(true)
    setSyncMessage('')
    try {
      const res = await fetch('/api/shopify/sync-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syncType: 'customers' }),
      })
      const data = await res.json()
      if (data.success || data.data) {
        setSyncMessage(`Sincronizados: ${data.data?.customers || 0} clientes`)
        refetch()
      } else {
        setSyncMessage(data.error || 'Erro no sync')
      }
    } catch {
      setSyncMessage('Erro ao sincronizar')
    } finally {
      setSyncing(false)
    }
  }

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
          <h1 className="text-2xl font-bold font-display text-gray-900">Contatos</h1>
          <p className="text-sm text-gray-500 mt-1">Gerencie sua base de contatos e segmentos</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSyncFromShopify}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <ArrowsClockwise className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} weight="bold" />
            {syncing ? 'Sincronizando...' : 'Sync Shopify'}
          </button>
          <Link
            href="/contacts/import"
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Upload className="w-4 h-4" weight="bold" />
            Importar
          </Link>
          <Link
            href="/crm/contacts"
            className="flex items-center gap-2 px-4 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-xl hover:opacity-90 transition-opacity shadow-sm"
          >
            <UserPlus className="w-4 h-4" weight="bold" />
            Novo Contato
          </Link>
        </div>
      </div>

      {/* Sync Message */}
      {syncMessage && (
        <div className={`p-3 rounded-xl text-sm ${syncMessage.includes('Erro') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
          {syncMessage}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: 'Total de Contatos', value: totalContacts.toString(), icon: UsersThree, color: '#F26B2A' },
          { title: 'Ativos (30d)', value: contacts?.filter((c: any) => c.last_active_at && new Date(c.last_active_at) > new Date(Date.now() - 30*24*60*60*1000)).length?.toString() || '0', icon: CheckCircle, color: '#22C55E' },
          { title: 'Com Pedidos', value: contacts?.filter((c: any) => (c.total_orders || 0) > 0).length?.toString() || '0', icon: CurrencyDollar, color: '#8B5CF6' },
          { title: 'Novos (7d)', value: contacts?.filter((c: any) => c.created_at && new Date(c.created_at) > new Date(Date.now() - 7*24*60*60*1000)).length?.toString() || '0', icon: UserPlus, color: '#3B82F6' },
        ].map((kpi, i) => {
          const Icon = kpi.icon
          return (
            <motion.div
              key={kpi.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-white rounded-2xl border border-gray-200 p-5"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-gray-500 font-medium">{kpi.title}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1 font-display">{kpi.value}</p>
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
      <div className="flex items-center gap-1 p-1 bg-white rounded-xl border border-gray-200 w-fit">
        <button className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-50 text-white">
          Todos os Contatos
        </button>
        <Link href="/contacts/lists" className="px-4 py-2 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors">
          Listas & Segmentos
        </Link>
      </div>

      {/* Search & Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Buscar contatos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:border-brand-500 transition-colors"
          />
        </div>
        <button className="flex items-center gap-2 px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-500 hover:text-white transition-colors">
          <FunnelSimple className="w-4 h-4" />
          Filtros
        </button>
        <button className="flex items-center gap-2 px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-500 hover:text-white transition-colors">
          <Download className="w-4 h-4" weight="bold" />
          Exportar
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <ArrowsClockwise className="w-6 h-6 animate-spin text-gray-500" />
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
              <UsersThree className="w-8 h-8 text-gray-400" weight="duotone" />
            </div>
            <p className="text-gray-500 font-medium">Nenhum contato encontrado</p>
            <p className="text-gray-500 text-sm mt-1">Importe ou adicione contatos para começar</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Contato</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">E-mail</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Telefone</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Tags</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">LTV</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Última Atividade</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredContacts.slice((page - 1) * 25, page * 25).map((contact: any) => (
                <tr key={contact.id} className="border-t border-gray-200 hover:bg-gray-50 transition-colors group">
                  <td className="px-5 py-4">
                    <Link href={`/contacts/${contact.id}`} className="flex items-center gap-3 hover:text-brand-600 transition-colors">
                      <div className="w-9 h-9 rounded-lg bg-brand-100 flex items-center justify-center text-xs font-bold text-brand-600">
                        {(contact.first_name?.[0] || '') + (contact.last_name?.[0] || '')}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 group-hover:text-brand-600 transition-colors">
                          {contact.first_name} {contact.last_name}
                        </p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-600">{contact.email || '-'}</td>
                  <td className="px-5 py-4 text-sm text-gray-600">{contact.phone || '-'}</td>
                  <td className="px-5 py-4">
                    {contact.tags?.length > 0 ? (
                      <div className="flex items-center gap-1">
                        {contact.tags.slice(0, 2).map((tag: string) => (
                          <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-50 text-gray-500">
                            {tag}
                          </span>
                        ))}
                        {contact.tags.length > 2 && (
                          <span className="text-[10px] text-gray-500">+{contact.tags.length - 2}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-sm font-medium text-gray-900">
                    {contact.ltv ? `R$ ${contact.ltv.toFixed(2)}` : '-'}
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-500">
                    {contact.updated_at ? new Date(contact.updated_at).toLocaleDateString('pt-BR') : '-'}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-1.5 rounded-lg hover:bg-blue-500/10 text-gray-500 hover:text-blue-400 transition-colors" title="E-mail">
                        <EnvelopeSimple className="w-4 h-4" weight="fill" />
                      </button>
                      <button className="p-1.5 rounded-lg hover:bg-[#25D366]/10 text-gray-500 hover:text-[#25D366] transition-colors" title="WhatsApp">
                        <WhatsappLogo className="w-4 h-4" weight="fill" />
                      </button>
                      <button className="p-1.5 rounded-lg hover:bg-gray-50 text-gray-500 hover:text-white transition-colors" title="Mais">
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
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200">
            <p className="text-xs text-gray-500">
              {(page - 1) * 25 + 1}–{Math.min(page * 25, filteredContacts.length)} de {filteredContacts.length}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg hover:bg-gray-50 text-gray-500 disabled:opacity-30 transition-colors"
              >
                <CaretLeft className="w-4 h-4" weight="bold" />
              </button>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page * 25 >= filteredContacts.length}
                className="p-1.5 rounded-lg hover:bg-gray-50 text-gray-500 disabled:opacity-30 transition-colors"
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
