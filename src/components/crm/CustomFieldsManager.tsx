'use client'

// =============================================
// Custom Fields Manager
// src/components/crm/CustomFieldsManager.tsx
//
// Interface para gerenciar campos personalizados
// =============================================

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Plus,
  Settings,
  Trash2,
  GripVertical,
  Save,
  Type,
  Hash,
  Calendar,
  List,
  ToggleLeft,
  Link,
  Mail,
  Phone,
} from 'lucide-react'
import { useAuthStore } from '@/stores'

interface CustomField {
  id: string
  entityType: string
  key: string
  label: string
  type: string
  options: string[] | null
  isRequired: boolean
  defaultValue: string | null
  placeholder: string | null
  helpText: string | null
  position: number
}

interface CustomFieldsManagerProps {
  isOpen: boolean
  onClose: () => void
  entityType: 'contact' | 'deal'
  onFieldsChange?: () => void
}

const FIELD_TYPES = [
  { key: 'text', label: 'Texto', icon: Type },
  { key: 'number', label: 'Número', icon: Hash },
  { key: 'date', label: 'Data', icon: Calendar },
  { key: 'select', label: 'Lista', icon: List },
  { key: 'boolean', label: 'Sim/Não', icon: ToggleLeft },
  { key: 'url', label: 'URL', icon: Link },
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'phone', label: 'Telefone', icon: Phone },
]

export function CustomFieldsManager({
  isOpen,
  onClose,
  entityType,
  onFieldsChange,
}: CustomFieldsManagerProps) {
  const { user } = useAuthStore()
  const organizationId = user?.organization_id
  
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [fields, setFields] = useState<CustomField[]>([])
  const [editingField, setEditingField] = useState<CustomField | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  
  // Form state for new/edit field
  const [formData, setFormData] = useState({
    label: '',
    type: 'text',
    options: '',
    isRequired: false,
    placeholder: '',
    helpText: '',
  })
  
  const fetchFields = useCallback(async () => {
    if (!organizationId) return
    
    setLoading(true)
    try {
      const res = await fetch(
        `/api/custom-fields?organizationId=${organizationId}&entityType=${entityType}`
      )
      const data = await res.json()
      setFields(data.fields || [])
    } catch (error) {
      console.error('Error fetching fields:', error)
    } finally {
      setLoading(false)
    }
  }, [organizationId, entityType])
  
  useEffect(() => {
    if (isOpen) {
      fetchFields()
    }
  }, [isOpen, fetchFields])
  
  const handleAddField = async () => {
    if (!organizationId || !formData.label.trim()) return
    
    setSaving(true)
    try {
      const fieldKey = formData.label
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
      
      const res = await fetch('/api/custom-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          entityType,
          fieldKey,
          fieldLabel: formData.label,
          fieldType: formData.type,
          options: formData.type === 'select' 
            ? formData.options.split(',').map(o => o.trim()).filter(Boolean)
            : null,
          isRequired: formData.isRequired,
          placeholder: formData.placeholder || null,
          helpText: formData.helpText || null,
        }),
      })
      
      const result = await res.json()
      
      if (result.success) {
        await fetchFields()
        setShowAddForm(false)
        resetForm()
        onFieldsChange?.()
      } else {
        alert(result.error || 'Erro ao criar campo')
      }
    } catch (error) {
      console.error('Error creating field:', error)
    } finally {
      setSaving(false)
    }
  }
  
  const handleUpdateField = async () => {
    if (!organizationId || !editingField) return
    
    setSaving(true)
    try {
      const res = await fetch('/api/custom-fields', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingField.id,
          organizationId,
          fieldLabel: formData.label,
          fieldType: formData.type,
          options: formData.type === 'select'
            ? formData.options.split(',').map(o => o.trim()).filter(Boolean)
            : null,
          isRequired: formData.isRequired,
          placeholder: formData.placeholder || null,
          helpText: formData.helpText || null,
        }),
      })
      
      const result = await res.json()
      
      if (result.success) {
        await fetchFields()
        setEditingField(null)
        resetForm()
        onFieldsChange?.()
      } else {
        alert(result.error || 'Erro ao atualizar campo')
      }
    } catch (error) {
      console.error('Error updating field:', error)
    } finally {
      setSaving(false)
    }
  }
  
  const handleDeleteField = async (field: CustomField) => {
    if (!organizationId) return
    if (!confirm(`Excluir o campo "${field.label}"?`)) return
    
    try {
      const res = await fetch(
        `/api/custom-fields?id=${field.id}&organizationId=${organizationId}`,
        { method: 'DELETE' }
      )
      
      const result = await res.json()
      
      if (result.success) {
        await fetchFields()
        onFieldsChange?.()
      }
    } catch (error) {
      console.error('Error deleting field:', error)
    }
  }
  
  const handleEditField = (field: CustomField) => {
    setEditingField(field)
    setFormData({
      label: field.label,
      type: field.type,
      options: field.options?.join(', ') || '',
      isRequired: field.isRequired,
      placeholder: field.placeholder || '',
      helpText: field.helpText || '',
    })
    setShowAddForm(false)
  }
  
  const resetForm = () => {
    setFormData({
      label: '',
      type: 'text',
      options: '',
      isRequired: false,
      placeholder: '',
      helpText: '',
    })
  }
  
  const handleClose = () => {
    setShowAddForm(false)
    setEditingField(null)
    resetForm()
    onClose()
  }
  
  if (!isOpen) return null
  
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-dark-900 rounded-2xl border border-dark-700 w-full max-w-2xl max-h-[90vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-dark-700">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary-500/20">
                <Settings className="w-5 h-5 text-primary-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">Campos Personalizados</h2>
                <p className="text-sm text-dark-400">
                  {entityType === 'contact' ? 'Contatos' : 'Deals'}
                </p>
              </div>
            </div>
            <button onClick={handleClose} className="p-2 hover:bg-dark-800 rounded-lg transition-colors">
              <X className="w-5 h-5 text-dark-400" />
            </button>
          </div>
          
          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[60vh]">
            {loading ? (
              <div className="text-center py-8 text-dark-400">Carregando...</div>
            ) : (
              <div className="space-y-4">
                {/* Fields List */}
                {fields.length === 0 && !showAddForm && (
                  <div className="text-center py-8 text-dark-400">
                    <Settings className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhum campo personalizado criado</p>
                    <p className="text-sm">Clique em "Adicionar Campo" para começar</p>
                  </div>
                )}
                
                {fields.map(field => (
                  <div
                    key={field.id}
                    className={`
                      flex items-center gap-4 p-4 bg-dark-800 rounded-xl border transition-colors
                      ${editingField?.id === field.id ? 'border-primary-500' : 'border-dark-700'}
                    `}
                  >
                    <GripVertical className="w-4 h-4 text-dark-500 cursor-grab" />
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{field.label}</span>
                        {field.isRequired && (
                          <span className="text-xs text-red-400">*</span>
                        )}
                        <span className="text-xs text-dark-500">({field.key})</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs px-2 py-0.5 bg-dark-700 rounded text-dark-300">
                          {FIELD_TYPES.find(t => t.key === field.type)?.label || field.type}
                        </span>
                        {field.options && field.options.length > 0 && (
                          <span className="text-xs text-dark-400">
                            {field.options.length} opções
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEditField(field)}
                        className="p-2 hover:bg-dark-700 rounded-lg transition-colors"
                      >
                        <Settings className="w-4 h-4 text-dark-400" />
                      </button>
                      <button
                        onClick={() => handleDeleteField(field)}
                        className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  </div>
                ))}
                
                {/* Add/Edit Form */}
                {(showAddForm || editingField) && (
                  <div className="p-4 bg-dark-800/50 rounded-xl border border-dark-700 space-y-4">
                    <h3 className="font-medium text-white">
                      {editingField ? 'Editar Campo' : 'Novo Campo'}
                    </h3>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm text-dark-400 mb-1 block">Nome do Campo *</label>
                        <input
                          type="text"
                          value={formData.label}
                          onChange={(e) => setFormData(prev => ({ ...prev, label: e.target.value }))}
                          placeholder="Ex: CPF, Data de Nascimento..."
                          className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-primary-500"
                        />
                      </div>
                      
                      <div>
                        <label className="text-sm text-dark-400 mb-1 block">Tipo</label>
                        <select
                          value={formData.type}
                          onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value }))}
                          className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-primary-500"
                        >
                          {FIELD_TYPES.map(type => (
                            <option key={type.key} value={type.key}>{type.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    
                    {formData.type === 'select' && (
                      <div>
                        <label className="text-sm text-dark-400 mb-1 block">
                          Opções (separadas por vírgula)
                        </label>
                        <input
                          type="text"
                          value={formData.options}
                          onChange={(e) => setFormData(prev => ({ ...prev, options: e.target.value }))}
                          placeholder="Opção 1, Opção 2, Opção 3"
                          className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-primary-500"
                        />
                      </div>
                    )}
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm text-dark-400 mb-1 block">Placeholder</label>
                        <input
                          type="text"
                          value={formData.placeholder}
                          onChange={(e) => setFormData(prev => ({ ...prev, placeholder: e.target.value }))}
                          placeholder="Texto de exemplo..."
                          className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-primary-500"
                        />
                      </div>
                      
                      <div>
                        <label className="text-sm text-dark-400 mb-1 block">Texto de Ajuda</label>
                        <input
                          type="text"
                          value={formData.helpText}
                          onChange={(e) => setFormData(prev => ({ ...prev, helpText: e.target.value }))}
                          placeholder="Instruções para o usuário..."
                          className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-primary-500"
                        />
                      </div>
                    </div>
                    
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.isRequired}
                        onChange={(e) => setFormData(prev => ({ ...prev, isRequired: e.target.checked }))}
                        className="w-4 h-4 rounded border-dark-600 bg-dark-700 text-primary-500"
                      />
                      <span className="text-sm text-dark-300">Campo obrigatório</span>
                    </label>
                    
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => {
                          setShowAddForm(false)
                          setEditingField(null)
                          resetForm()
                        }}
                        className="px-4 py-2 text-dark-400 hover:text-white transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={editingField ? handleUpdateField : handleAddField}
                        disabled={saving || !formData.label.trim()}
                        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        <Save className="w-4 h-4" />
                        {saving ? 'Salvando...' : 'Salvar'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Footer */}
          <div className="flex items-center justify-between p-6 border-t border-dark-700">
            <button onClick={handleClose} className="px-4 py-2 text-dark-400 hover:text-white transition-colors">
              Fechar
            </button>
            {!showAddForm && !editingField && (
              <button
                onClick={() => setShowAddForm(true)}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Adicionar Campo
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
