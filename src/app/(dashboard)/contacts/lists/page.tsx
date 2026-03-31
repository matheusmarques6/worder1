'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import {
  ListBullets,
  Plus,
  MagnifyingGlass,
  UsersThree,
  PencilSimple,
  Trash,
  ArrowLeft,
  Clock,
  CheckCircle,
  EnvelopeSimple,
  WhatsappLogo,
  DeviceMobileSpeaker,
  Export,
  FunnelSimple,
} from '@phosphor-icons/react'
import { Loader2 } from 'lucide-react'
import { useAuthStore } from '@/stores'

interface ContactList {
  id: string
  name: string
  description?: string
  type: string
  contact_count?: number
  created_at: string
}

export default function ContactListsPage() {
  const [lists, setLists] = useState<ContactList[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const { user } = useAuthStore()

  const fetchLists = useCallback(async () => {
    if (!user?.organization_id) return
    setLoading(true)
    try {
      const res = await fetch(`/api/segments?organization_id=${user.organization_id}&include_count=true`)
      if (res.ok) {
        const data = await res.json()
        setLists(data.segments || [])
      }
    } catch (err) {
      console.error('Failed to fetch lists:', err)
    } finally {
      setLoading(false)
    }
  }, [user?.organization_id])

  useEffect(() => {
    fetchLists()
  }, [fetchLists])

  const filtered = lists.filter((l) =>
    !search || l.name.toLowerCase().includes(search.toLowerCase())
  )

  const totalContacts = lists.reduce((a, l) => a + (l.contact_count || 0), 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/contacts" className="p-2 rounded-lg hover:bg-gray-50 transition-colors">
            <ArrowLeft size={18} className="text-gray-500" />
          </Link>
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <ListBullets size={22} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display text-gray-900">Listas & Segmentos</h1>
            <p className="text-sm text-gray-500 mt-0.5">{lists.length} listas · {totalContacts.toLocaleString('pt-BR')} contatos</p>
          </div>
        </div>
        <Link
          href="/segments/new"
          className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition-opacity text-sm font-medium"
        >
          <Plus size={16} />
          Novo Segmento
        </Link>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          placeholder="Buscar listas..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-white border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500"
        />
      </div>

      {/* Lists */}
      {filtered.length === 0 ? (
        <div className="bg-white/50 border border-gray-200 rounded-xl p-12 text-center">
          <UsersThree size={32} className="text-gray-400 mx-auto mb-3" />
          <p className="text-sm text-gray-500">
            {lists.length === 0
              ? 'Nenhuma lista ou segmento criado ainda.'
              : 'Nenhuma lista encontrada com o filtro atual.'}
          </p>
          <Link
            href="/segments/new"
            className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium"
          >
            <Plus size={14} />
            Criar Primeiro Segmento
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((list, i) => (
            <motion.div
              key={list.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="bg-white/50 border border-gray-200 rounded-xl p-5 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                    <UsersThree size={18} className="text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">{list.name}</h3>
                    {list.description && (
                      <p className="text-xs text-gray-500 mt-0.5">{list.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">
                      {(list.contact_count || 0).toLocaleString('pt-BR')}
                    </p>
                    <p className="text-xs text-gray-400">contatos</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    list.type === 'dynamic' ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-600'
                  }`}>
                    {list.type === 'dynamic' ? 'Dinâmico' : 'Estático'}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
