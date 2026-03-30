'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Mail,
  Loader2,
  FileText,
  Megaphone,
  Bell,
  Palette,
} from 'lucide-react'
import Link from 'next/link'
// Template creation

const categories = [
  {
    value: 'marketing',
    label: 'Marketing',
    description: 'Campanhas, promoções e newsletters',
    icon: Megaphone,
    color: 'text-blue-600 bg-blue-50 border-blue-200',
  },
  {
    value: 'transactional',
    label: 'Transacional',
    description: 'Confirmações de pedido, envio e pagamento',
    icon: FileText,
    color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  },
  {
    value: 'notification',
    label: 'Notificação',
    description: 'Alertas, lembretes e atualizações',
    icon: Bell,
    color: 'text-amber-600 bg-amber-50 border-amber-200',
  },
  {
    value: 'custom',
    label: 'Personalizado',
    description: 'Template livre para qualquer uso',
    icon: Palette,
    color: 'text-gray-600 bg-gray-50 border-gray-200',
  },
]

export default function NewTemplatePage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [category, setCategory] = useState('marketing')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Nome do template é obrigatório')
      return
    }

    setSaving(true)
    setError('')

    try {
      const res = await fetch('/api/email/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          category,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erro ao criar template')
      }

      const data = await res.json()
      const templateId = data.template?.id || data.id
      router.push(`/email/templates/${templateId}/edit`)
    } catch (err: any) {
      setError(err.message || 'Erro ao criar template')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/email/templates"
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Novo Template</h1>
          <p className="text-sm text-gray-500 mt-1">
            Defina o nome e a categoria do seu template
          </p>
        </div>
      </div>

      {/* Form Card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white border border-gray-200 rounded-lg shadow-sm"
      >
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Nome do Template
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError('')
              }}
              placeholder="Ex: Newsletter Semanal"
              className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Categoria
            </label>
            <div className="grid grid-cols-2 gap-3">
              {categories.map((cat) => {
                const Icon = cat.icon
                const isSelected = category === cat.value
                return (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setCategory(cat.value)}
                    className={`flex items-start gap-3 p-4 border rounded-lg text-left transition-all ${
                      isSelected
                        ? 'border-brand-500 bg-brand-50/50 ring-2 ring-brand-500/20'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center border flex-shrink-0 ${cat.color}`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{cat.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{cat.description}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Link
              href="/email/templates"
              className="px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Criando...
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4" />
                  Criar e Editar
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}
