// =============================================
// Page: Custom Fields Admin
// /crm/custom-fields
// Gerencia campos personalizados por tipo de entidade
// =============================================

'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Settings,
  Plus,
  Users,
  DollarSign,
  Type,
  Hash,
  Calendar,
  List,
  ToggleLeft,
  Link as LinkIcon,
  Mail,
  Phone,
  Loader2,
} from 'lucide-react'
import { useAuthStore } from '@/stores'
import { CustomFieldsManager } from '@/components/crm'

// =============================================
// CONFIG
// =============================================

type EntityType = 'contact' | 'deal'

const ENTITY_TABS: { key: EntityType; label: string; icon: any }[] = [
  { key: 'contact', label: 'Contatos', icon: Users },
  { key: 'deal', label: 'Deals', icon: DollarSign },
]

const FIELD_TYPE_LABELS: Record<string, { label: string; icon: any }> = {
  text: { label: 'Texto', icon: Type },
  number: { label: 'Número', icon: Hash },
  date: { label: 'Data', icon: Calendar },
  select: { label: 'Lista', icon: List },
  multiselect: { label: 'Lista múltipla', icon: List },
  boolean: { label: 'Sim/Não', icon: ToggleLeft },
  url: { label: 'URL', icon: LinkIcon },
  email: { label: 'Email', icon: Mail },
  phone: { label: 'Telefone', icon: Phone },
}

interface CustomField {
  id: string
  entityType: string
  key: string
  label: string
  type: string
  options: string[] | null
  isRequired: boolean
  placeholder: string | null
  helpText: string | null
  position: number
}

// =============================================
// MAIN PAGE
// =============================================

export default function CustomFieldsPage() {
  const { user } = useAuthStore()
  const organizationId = user?.organization_id || user?.user_metadata?.organization_id || ''

  const [activeEntity, setActiveEntity] = useState<EntityType>('contact')
  const [fields, setFields] = useState<CustomField[]>([])
  const [loading, setLoading] = useState(true)
  const [showManager, setShowManager] = useState(false)

  // =============================================
  // LOAD
  // =============================================
  const fetchFields = useCallback(async () => {
    if (!organizationId) return
    setLoading(true)
    try {
      const res = await fetch(
        `/api/custom-fields?organizationId=${organizationId}&entityType=${activeEntity}`
      )
      const data = await res.json()
      setFields(data.fields || [])
    } catch (error) {
      console.error('[CustomFields] Error fetching fields:', error)
    } finally {
      setLoading(false)
    }
  }, [organizationId, activeEntity])

  useEffect(() => {
    fetchFields()
  }, [fetchFields])

  // =============================================
  // RENDER
  // =============================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campos Personalizados</h1>
          <p className="text-gray-500 mt-1">
            Crie campos extras para enriquecer seus contatos e deals
          </p>
        </div>
        <button
          onClick={() => setShowManager(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-xl hover:bg-primary-600 transition-colors"
        >
          <Settings className="w-4 h-4" />
          Gerenciar
        </button>
      </div>

      {/* Entity Tabs */}
      <div className="flex gap-2">
        {ENTITY_TABS.map((tab) => {
          const Icon = tab.icon
          const active = activeEntity === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveEntity(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                active
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Fields List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
        </div>
      ) : fields.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 border border-gray-200 rounded-2xl">
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4">
            <Settings className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Nenhum campo personalizado
          </h3>
          <p className="text-gray-500 max-w-sm mx-auto mb-6">
            Crie campos personalizados para {activeEntity === 'contact' ? 'seus contatos' : 'seus deals'}
          </p>
          <button
            onClick={() => setShowManager(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-xl hover:bg-primary-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Adicionar Campo
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {fields.map((field) => {
            const typeConfig = FIELD_TYPE_LABELS[field.type] || { label: field.type, icon: Type }
            const TypeIcon = typeConfig.icon
            return (
              <motion.div
                key={field.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-4 p-4 bg-gray-50 border border-gray-200 rounded-xl"
              >
                <div className="p-2.5 rounded-xl bg-brand-100 text-brand-600">
                  <TypeIcon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900">{field.label}</span>
                    {field.isRequired && <span className="text-xs text-error-400">obrigatório</span>}
                    <span className="text-xs text-gray-400 font-mono">{field.key}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-sm">
                    <span className="text-xs px-2 py-0.5 bg-gray-100 rounded text-gray-600">
                      {typeConfig.label}
                    </span>
                    {field.options && field.options.length > 0 && (
                      <span className="text-xs text-gray-500">{field.options.length} opções</span>
                    )}
                    {field.helpText && (
                      <span className="text-xs text-gray-400 truncate">{field.helpText}</span>
                    )}
                  </div>
                </div>
              </motion.div>
            )
          })}
          <button
            onClick={() => setShowManager(true)}
            className="w-full flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 hover:text-brand-600 hover:border-brand-300 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Adicionar / editar campos
          </button>
        </div>
      )}

      {/* Manager modal (full CRUD) */}
      <CustomFieldsManager
        isOpen={showManager}
        onClose={() => setShowManager(false)}
        entityType={activeEntity}
        onFieldsChange={fetchFields}
      />
    </div>
  )
}
