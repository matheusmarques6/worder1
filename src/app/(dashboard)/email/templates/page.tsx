'use client'
import { useConfirm } from '@/components/ui/ConfirmDialog'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Mail,
  Search,
  Plus,
  Loader2,
  Edit3,
  Trash2,
  MoreVertical,
  FileText,
  Tag,
  Share2,
} from 'lucide-react'
import Link from 'next/link'
import { useStoreStore } from '@/stores'
import { CloneToStoreModal } from '@/components/ui/CloneToStoreModal'

interface EmailTemplate {
  id: string
  name: string
  category: string
  subject?: string
  updated_at: string
  created_at: string
  thumbnail_url?: string
  html?: string
}

const categoryColors: Record<string, string> = {
  marketing: 'bg-blue-50 text-blue-700 border border-blue-200',
  transactional: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  notification: 'bg-amber-50 text-amber-700 border border-amber-200',
  custom: 'bg-gray-50 text-gray-700 border border-gray-200',
}

const categoryLabels: Record<string, string> = {
  marketing: 'Marketing',
  transactional: 'Transacional',
  notification: 'Notificação',
  custom: 'Personalizado',
}

export default function EmailTemplatesPage() {
  const { confirm } = useConfirm()
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  const [cloneTarget, setCloneTarget] = useState<{ id: string; name: string } | null>(null)
  const { currentStore } = useStoreStore()

  const fetchTemplates = useCallback(async () => {
    if (!currentStore?.id) return // Wait for store to be selected
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('store_id', currentStore.id)
      if (search) params.set('search', search)
      const res = await fetch(`/api/email/templates?${params}`)
      if (res.ok) {
        const data = await res.json()
        setTemplates(data.templates || [])
      }
    } catch (err) {
      console.error('Failed to fetch templates:', err)
    } finally {
      setLoading(false)
    }
  }, [currentStore, search])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  const handleDelete = async (id: string) => {
    const ok = await confirm({ title: 'Excluir template?', destructive: true, confirmLabel: 'Excluir' }); if (!ok) return
    try {
      const res = await fetch(`/api/email/templates/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setTemplates((prev) => prev.filter((t) => t.id !== id))
      }
    } catch (err) {
      console.error('Failed to delete template:', err)
    }
    setActiveMenu(null)
  }

  const filtered = templates.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Templates de Email</h1>
          <p className="text-sm text-gray-500 mt-1">
            Crie e gerencie seus templates de email
          </p>
        </div>
        <Link
          href="/email/templates/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Criar Template
        </Link>
      </div>

      {/* Pre-built Templates */}
      {templates.length === 0 && !loading && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Começar com um template</h2>
          <p className="text-sm text-gray-500 mb-4">Escolha um template pré-configurado ou comece do zero</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { name: 'Boas-vindas', desc: 'Email de boas-vindas para novos inscritos', cat: 'marketing', color: 'bg-blue-50 border-blue-200' },
              { name: 'Carrinho Abandonado', desc: 'Recupere carrinhos abandonados', cat: 'marketing', color: 'bg-amber-50 border-amber-200' },
              { name: 'Promoção', desc: 'Template para ofertas e promoções', cat: 'marketing', color: 'bg-rose-50 border-rose-200' },
              { name: 'Newsletter', desc: 'Novidades e conteúdo periódico', cat: 'marketing', color: 'bg-emerald-50 border-emerald-200' },
              { name: 'Confirmação Pedido', desc: 'Confirmação de compra', cat: 'transactional', color: 'bg-indigo-50 border-indigo-200' },
              { name: 'Envio Rastreio', desc: 'Informações de entrega', cat: 'transactional', color: 'bg-cyan-50 border-cyan-200' },
              { name: 'Aniversário', desc: 'Email de aniversário com cupom', cat: 'marketing', color: 'bg-pink-50 border-pink-200' },
              { name: 'Em Branco', desc: 'Comece do zero', cat: 'custom', color: 'bg-gray-50 border-gray-200' },
            ].map(t => (
              <button key={t.name} onClick={async () => {
                try {
                  const res = await fetch('/api/email/templates', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: t.name, category: t.cat, store_id: currentStore?.id || undefined }),
                  })
                  if (res.ok) {
                    const data = await res.json()
                    window.location.href = `/email/templates/${data.template?.id || data.id}/edit`
                  }
                } catch {}
              }}
                className={`p-4 rounded-xl border ${t.color} hover:shadow-md transition-all group text-left cursor-pointer`}>
                <div className="w-8 h-8 rounded-lg bg-white/60 flex items-center justify-center mb-2">
                  <Mail className="w-4 h-4 text-gray-500" />
                </div>
                <p className="text-sm font-semibold text-gray-900 group-hover:text-brand-600">{t.name}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">{t.desc}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar templates..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
        />
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
        </div>
      )}

      {/* Empty State */}
      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <FileText className="w-7 h-7 text-gray-400" />
          </div>
          <h3 className="text-base font-medium text-gray-500 mb-1">
            Nenhum template encontrado
          </h3>
          <p className="text-sm text-gray-400 mb-6">
            {search
              ? 'Tente ajustar sua busca'
              : 'Comece criando seu primeiro template de email'}
          </p>
          {!search && (
            <Link
              href="/email/templates/new"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Criar Template
            </Link>
          )}
        </div>
      )}

      {/* Grid */}
      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filtered.map((template, i) => (
            <motion.div
              key={template.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="group bg-white border border-zinc-200 rounded-xl hover:shadow-lg hover:border-zinc-300 transition-all duration-200 relative"
            >
              {/* Thumbnail / HTML Preview */}
              <div className="aspect-[4/3] bg-zinc-50 relative overflow-hidden border-b border-zinc-100 rounded-t-xl">
                {template.html ? (
                  <div className="absolute inset-0 flex items-start justify-center">
                    <iframe
                      srcDoc={template.html
                        .replace(/\{\{countdown_base_url\}\}/g, window.location.origin)
                        .replace(/\{\{first_name\}\}/g, 'Cliente')
                        .replace(/\{\{store_name\}\}/g, 'Loja')
                        .replace(/\{\{store_url\}\}/g, '#')
                        .replace(/\{\{checkout_url\}\}/g, '#')
                        .replace(/\{\{[^}]+\}\}/g, '')
                      }
                      title={template.name}
                      className="border-0 pointer-events-none select-none"
                      style={{ width: 600, height: 900, transform: 'scale(var(--preview-scale))', transformOrigin: 'top center' }}
                      sandbox=""
                      loading="lazy"
                      ref={(el) => {
                        if (el) {
                          const w = el.parentElement?.offsetWidth || 280
                          el.style.setProperty('--preview-scale', String(w / 600))
                        }
                      }}
                    />
                  </div>
                ) : template.thumbnail_url ? (
                  <img src={template.thumbnail_url} alt={template.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <Mail className="w-8 h-8 text-zinc-300" />
                    <span className="text-[11px] text-zinc-400 mt-1.5">Sem preview</span>
                  </div>
                )}

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <Link
                    href={`/email/templates/${template.id}/edit`}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-zinc-900 text-[13px] font-semibold rounded-lg shadow-lg hover:bg-zinc-50 transition-colors"
                  >
                    <Edit3 className="w-4 h-4" />
                    Editar
                  </Link>
                </div>
              </div>

              {/* Info */}
              <div className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[13px] font-semibold text-zinc-900 truncate">
                      {template.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full ${
                          categoryColors[template.category] || categoryColors.custom
                        }`}
                      >
                        <Tag className="w-2.5 h-2.5" />
                        {categoryLabels[template.category] || template.category}
                      </span>
                      <span className="text-[10px] text-zinc-400">
                        {new Date(template.updated_at).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  </div>

                  {/* Actions menu */}
                  <div className="relative">
                    <button
                      onClick={() =>
                        setActiveMenu(activeMenu === template.id ? null : template.id)
                      }
                      className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    {activeMenu === template.id && (
                      <>
                        {/* backdrop — fecha menu ao clicar fora */}
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setActiveMenu(null)}
                        />
                        <div className="absolute right-0 top-8 z-50 w-44 bg-white border border-gray-200 rounded-lg shadow-xl py-1">
                          <Link
                            href={`/email/templates/${template.id}/edit`}
                            onClick={() => setActiveMenu(null)}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            <Edit3 className="w-4 h-4" />
                            Editar
                          </Link>
                          <button
                            onClick={() => {
                              setActiveMenu(null);
                              setCloneTarget({ id: template.id, name: template.name });
                            }}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 w-full text-left"
                          >
                            <Share2 className="w-4 h-4" />
                            Clonar para outra loja
                          </button>
                          <button
                            onClick={() => { setActiveMenu(null); handleDelete(template.id); }}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 w-full text-left"
                          >
                            <Trash2 className="w-4 h-4" />
                            Excluir
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {cloneTarget && (
        <CloneToStoreModal
          open={!!cloneTarget}
          onClose={() => setCloneTarget(null)}
          endpoint={`/api/email/templates/${cloneTarget.id}/clone-to-store`}
          resourceName={cloneTarget.name}
          resourceLabel="Template"
          currentStoreId={currentStore?.id}
          onCloned={() => fetchTemplates()}
        />
      )}
    </div>
  )
}
