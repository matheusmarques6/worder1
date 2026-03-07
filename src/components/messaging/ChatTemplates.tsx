'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageSquare,
  Plus,
  Search,
  Star,
  StarOff,
  Pencil,
  Trash2,
  Copy,
  X,
  Check,
  ChevronDown,
  Folder,
  Send,
  Clock,
  Image as ImageIcon,
  FileText,
  Zap,
  Eye,
} from 'lucide-react'
import { useChatTemplates, type ChatTemplate, type CreateTemplateParams } from '@/hooks/useChatTemplates'

// =============================================
// UTILITY
// =============================================

const CATEGORY_LABELS: Record<string, string> = {
  general: 'Geral',
  greeting: 'Saudações',
  followup: 'Follow-up',
  sales: 'Vendas',
  support: 'Suporte',
  closing: 'Fechamento',
  reactivation: 'Reativação',
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  general: <MessageSquare className="w-4 h-4" />,
  greeting: <Zap className="w-4 h-4" />,
  followup: <Clock className="w-4 h-4" />,
  sales: <Send className="w-4 h-4" />,
  support: <FileText className="w-4 h-4" />,
  closing: <Check className="w-4 h-4" />,
  reactivation: <Star className="w-4 h-4" />,
}

// =============================================
// TEMPLATE CARD
// =============================================

interface TemplateCardProps {
  template: ChatTemplate
  onSelect: (template: ChatTemplate) => void
  onEdit: (template: ChatTemplate) => void
  onDelete: (template: ChatTemplate) => void
  onToggleFavorite: (id: string) => void
}

function TemplateCard({
  template,
  onSelect,
  onEdit,
  onDelete,
  onToggleFavorite,
}: TemplateCardProps) {
  const [showPreview, setShowPreview] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="group bg-dark-800/50 border border-dark-700/50 rounded-xl p-4 hover:border-dark-600 transition-colors"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-primary-500/10 rounded-lg text-primary-400">
            {CATEGORY_ICONS[template.category] || <MessageSquare className="w-4 h-4" />}
          </div>
          <div>
            <h3 className="font-medium text-white">{template.name}</h3>
            <p className="text-xs text-dark-400">
              {CATEGORY_LABELS[template.category] || template.category}
            </p>
          </div>
        </div>
        <button
          onClick={() => onToggleFavorite(template.id)}
          className={`p-1.5 rounded-lg transition-colors ${
            template.is_favorite
              ? 'text-amber-400 bg-amber-500/10'
              : 'text-dark-500 hover:text-amber-400 hover:bg-amber-500/10'
          }`}
        >
          {template.is_favorite ? (
            <Star className="w-4 h-4 fill-current" />
          ) : (
            <StarOff className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Preview */}
      <div className="relative">
        <p className="text-sm text-dark-300 line-clamp-3 mb-3">{template.content}</p>
        {template.content.length > 150 && (
          <button
            onClick={() => setShowPreview(true)}
            className="text-xs text-primary-400 hover:text-primary-300"
          >
            Ver mais
          </button>
        )}
      </div>

      {/* Variables */}
      {template.variables.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {template.variables.map((v) => (
            <span
              key={v}
              className="px-2 py-0.5 text-xs bg-primary-500/10 text-primary-400 rounded"
            >
              {`{{${v}}}`}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-dark-700/50">
        <span className="text-xs text-dark-500">
          {template.usage_count} {template.usage_count === 1 ? 'uso' : 'usos'}
        </span>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEdit(template)}
            className="p-1.5 text-dark-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(template)}
            className="p-1.5 text-dark-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onSelect(template)}
            className="px-3 py-1.5 text-xs font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg transition-colors"
          >
            Usar
          </button>
        </div>
      </div>

      {/* Full Preview Modal */}
      <AnimatePresence>
        {showPreview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={() => setShowPreview(false)}
          >
            <div className="absolute inset-0 bg-black/60" />
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="relative bg-dark-800 border border-dark-700 rounded-2xl p-6 max-w-lg w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowPreview(false)}
                className="absolute top-4 right-4 p-1 text-dark-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
              <h3 className="text-lg font-semibold text-white mb-4">{template.name}</h3>
              <p className="text-dark-300 whitespace-pre-wrap">{template.content}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// =============================================
// CREATE/EDIT MODAL
// =============================================

interface TemplateModalProps {
  isOpen: boolean
  template?: ChatTemplate | null
  onClose: () => void
  onSave: (params: CreateTemplateParams) => Promise<void>
}

function TemplateModal({ isOpen, template, onClose, onSave }: TemplateModalProps) {
  const [name, setName] = useState(template?.name || '')
  const [category, setCategory] = useState(template?.category || 'general')
  const [content, setContent] = useState(template?.content || '')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (template) {
      setName(template.name)
      setCategory(template.category)
      setContent(template.content)
    } else {
      setName('')
      setCategory('general')
      setContent('')
    }
  }, [template])

  const handleSave = async () => {
    if (!name.trim() || !content.trim()) return

    setIsSaving(true)
    try {
      await onSave({ name, category, content })
      onClose()
    } finally {
      setIsSaving(false)
    }
  }

  const insertVariable = (variable: string) => {
    setContent((prev) => prev + `{{${variable}}}`)
  }

  if (!isOpen) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.95 }}
        className="relative bg-dark-800 border border-dark-700 rounded-2xl w-full max-w-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-dark-700">
          <h2 className="text-xl font-semibold text-white">
            {template ? 'Editar Template' : 'Novo Template'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-dark-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Nome</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Boas-vindas"
              className="w-full px-4 py-2.5 bg-dark-900 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Categoria</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-4 py-2.5 bg-dark-900 border border-dark-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Content */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-dark-300">Mensagem</label>
              <div className="flex items-center gap-1">
                <span className="text-xs text-dark-500">Variáveis:</span>
                {['nome', 'produto', 'valor', 'link'].map((v) => (
                  <button
                    key={v}
                    onClick={() => insertVariable(v)}
                    className="px-2 py-0.5 text-xs bg-primary-500/10 text-primary-400 rounded hover:bg-primary-500/20 transition-colors"
                  >
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Digite a mensagem do template..."
              rows={6}
              className="w-full px-4 py-3 bg-dark-900 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
            <p className="text-xs text-dark-500 mt-1">
              Use {`{{variavel}}`} para criar campos dinâmicos
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-dark-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-dark-400 hover:text-white transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || !content.trim() || isSaving}
            className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Salvando...' : template ? 'Salvar' : 'Criar'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// =============================================
// MAIN COMPONENT
// =============================================

interface ChatTemplatesProps {
  organizationId: string
  storeId?: string | null
  onSelectTemplate?: (content: string, template: ChatTemplate) => void
}

export function ChatTemplates({
  organizationId,
  storeId,
  onSelectTemplate,
}: ChatTemplatesProps) {
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<ChatTemplate | null>(null)

  const {
    templates,
    categories,
    isLoading,
    error,
    loadTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    useTemplate,
    toggleFavorite,
  } = useChatTemplates({
    organizationId,
    storeId,
    category: selectedCategory === 'all' ? undefined : selectedCategory,
  })

  // Filter templates
  const filteredTemplates = templates.filter((t) => {
    if (search) {
      const searchLower = search.toLowerCase()
      return (
        t.name.toLowerCase().includes(searchLower) ||
        t.content.toLowerCase().includes(searchLower)
      )
    }
    return true
  })

  // Separate favorites
  const favorites = filteredTemplates.filter((t) => t.is_favorite)
  const others = filteredTemplates.filter((t) => !t.is_favorite)

  const handleSelect = async (template: ChatTemplate) => {
    const content = await useTemplate(template.id)
    if (content && onSelectTemplate) {
      onSelectTemplate(content, template)
    }
  }

  const handleSave = async (params: CreateTemplateParams) => {
    if (editingTemplate) {
      await updateTemplate(editingTemplate.id, params)
    } else {
      await createTemplate(params)
    }
    setEditingTemplate(null)
  }

  const handleDelete = async (template: ChatTemplate) => {
    if (confirm(`Deseja excluir o template "${template.name}"?`)) {
      await deleteTemplate(template.id)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Templates de Mensagem</h2>
          <p className="text-dark-400 text-sm mt-1">
            Respostas rápidas com campos dinâmicos
          </p>
        </div>
        <button
          onClick={() => {
            setEditingTemplate(null)
            setShowModal(true)
          }}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-medium transition-colors"
        >
          <Plus className="w-5 h-5" />
          Novo Template
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar templates..."
            className="w-full pl-10 pr-4 py-2.5 bg-dark-800 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        {/* Categories */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              selectedCategory === 'all'
                ? 'bg-primary-500 text-white'
                : 'bg-dark-800 text-dark-400 hover:text-white'
            }`}
          >
            Todos
          </button>
          {categories.slice(0, 5).map((cat) => (
            <button
              key={cat.name}
              onClick={() => setSelectedCategory(cat.name)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                selectedCategory === cat.name
                  ? 'bg-primary-500 text-white'
                  : 'bg-dark-800 text-dark-400 hover:text-white'
              }`}
            >
              {CATEGORY_LABELS[cat.name] || cat.name} ({cat.count})
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-center">
          {error}
        </div>
      )}

      {/* Templates */}
      {!isLoading && !error && (
        <div className="space-y-6">
          {/* Favorites */}
          {favorites.length > 0 && (
            <div>
              <h3 className="flex items-center gap-2 text-sm font-medium text-amber-400 mb-3">
                <Star className="w-4 h-4 fill-current" />
                Favoritos
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {favorites.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    onSelect={handleSelect}
                    onEdit={(t) => {
                      setEditingTemplate(t)
                      setShowModal(true)
                    }}
                    onDelete={handleDelete}
                    onToggleFavorite={toggleFavorite}
                  />
                ))}
              </div>
            </div>
          )}

          {/* All Templates */}
          {others.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {others.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onSelect={handleSelect}
                  onEdit={(t) => {
                    setEditingTemplate(t)
                    setShowModal(true)
                  }}
                  onDelete={handleDelete}
                  onToggleFavorite={toggleFavorite}
                />
              ))}
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="text-center py-12">
              <MessageSquare className="w-12 h-12 text-dark-600 mx-auto mb-4" />
              <p className="text-dark-400">Nenhum template encontrado</p>
              <button
                onClick={() => {
                  setEditingTemplate(null)
                  setShowModal(true)
                }}
                className="mt-4 text-primary-400 hover:text-primary-300"
              >
                Criar primeiro template
              </button>
            </div>
          ) : null}
        </div>
      )}

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {showModal && (
          <TemplateModal
            isOpen={showModal}
            template={editingTemplate}
            onClose={() => {
              setShowModal(false)
              setEditingTemplate(null)
            }}
            onSave={handleSave}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

export default ChatTemplates
