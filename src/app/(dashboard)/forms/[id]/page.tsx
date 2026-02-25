'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Save, Eye, Code, Settings, Zap, Plus, Trash2,
  GripVertical, ChevronDown, ChevronUp, Loader2, CheckCircle,
  Globe, X, Copy, FileText, Mail, Phone, Hash, AlignLeft,
  List, CheckSquare, Calendar, Link as LinkIcon, EyeOff,
  ToggleLeft, ToggleRight, AlertCircle,
} from 'lucide-react'

// Field type configs
const fieldTypeOptions = [
  { type: 'text', label: 'Texto', icon: FileText },
  { type: 'email', label: 'E-mail', icon: Mail },
  { type: 'phone', label: 'Telefone', icon: Phone },
  { type: 'number', label: 'Numero', icon: Hash },
  { type: 'textarea', label: 'Texto longo', icon: AlignLeft },
  { type: 'select', label: 'Selecao', icon: List },
  { type: 'radio', label: 'Radio', icon: CheckSquare },
  { type: 'checkbox', label: 'Checkbox', icon: CheckSquare },
  { type: 'date', label: 'Data', icon: Calendar },
  { type: 'url', label: 'URL', icon: LinkIcon },
  { type: 'cpf', label: 'CPF', icon: Hash },
  { type: 'hidden', label: 'Oculto', icon: EyeOff },
]

const contactFieldOptions = [
  { value: '', label: 'Nao mapear' },
  { value: 'name', label: 'Nome' },
  { value: 'email', label: 'E-mail' },
  { value: 'phone', label: 'Telefone' },
  { value: 'company', label: 'Empresa' },
]

const triggerTypeLabels: Record<string, string> = {
  on_submit: 'Quando formulario e submetido',
  on_condition: 'Quando condicoes sao atendidas',
  on_page_view: 'Quando visita pagina de obrigado',
  on_stage_change: 'Quando lead muda de estagio',
}

interface FormField {
  id: string
  field_type: string
  label: string
  placeholder: string | null
  description: string | null
  required: boolean
  position: number
  options: any[]
  validation: any
  map_to_contact_field: string | null
  conditional: any
}

interface FormEvent {
  id: string
  name: string
  event_name: string
  trigger_type: string
  send_to_facebook: boolean
  send_to_google: boolean
  event_value: number | null
  event_currency: string
  conditions: any[]
  target_stage_id: string | null
  is_active: boolean
  position: number
}

interface FormData {
  id: string
  name: string
  slug: string
  description: string | null
  status: string
  pipeline_id: string | null
  stage_id: string | null
  theme: any
  logo_url: string | null
  success_message: string
  redirect_url: string | null
  facebook_pixel_id: string | null
  google_ads_id: string | null
  google_analytics_id: string | null
  submissions_count: number
  views_count: number
  fields: FormField[]
  events: FormEvent[]
  pipeline: any
}

export default function FormBuilderPage() {
  const params = useParams()
  const router = useRouter()
  const formId = params.id as string

  const [form, setForm] = useState<FormData | null>(null)
  const [fields, setFields] = useState<FormField[]>([])
  const [events, setEvents] = useState<FormEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'fields' | 'events' | 'settings' | 'embed'>('fields')
  const [expandedField, setExpandedField] = useState<string | null>(null)
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null)
  const [pipelines, setPipelines] = useState<any[]>([])
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Fetch form data
  const fetchForm = useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await fetch(`/api/forms/${formId}`)
      if (res.ok) {
        const data = await res.json()
        setForm(data.form)
        setFields(data.form.fields || [])
        setEvents(data.form.events || [])
      }
    } catch (error) {
      console.error('Error fetching form:', error)
    } finally {
      setIsLoading(false)
    }
  }, [formId])

  // Fetch pipelines
  const fetchPipelines = useCallback(async () => {
    try {
      const res = await fetch('/api/crm/pipelines')
      if (res.ok) {
        const data = await res.json()
        setPipelines(data.pipelines || [])
      }
    } catch (error) {
      console.error('Error fetching pipelines:', error)
    }
  }, [])

  useEffect(() => {
    fetchForm()
    fetchPipelines()
  }, [fetchForm, fetchPipelines])

  // Save fields
  const saveFields = async () => {
    setIsSaving(true)
    try {
      const res = await fetch(`/api/forms/${formId}/fields`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      })
      if (res.ok) {
        const data = await res.json()
        setFields(data.fields)
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 2000)
      }
    } catch (error) {
      console.error('Error saving fields:', error)
    } finally {
      setIsSaving(false)
    }
  }

  // Save form settings
  const saveFormSettings = async (updates: Partial<FormData>) => {
    setIsSaving(true)
    try {
      const res = await fetch(`/api/forms/${formId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (res.ok) {
        const data = await res.json()
        setForm(prev => prev ? { ...prev, ...data.form } : null)
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 2000)
      }
    } catch (error) {
      console.error('Error saving form:', error)
    } finally {
      setIsSaving(false)
    }
  }

  // Add field
  const addField = (fieldType: string) => {
    const typeConfig = fieldTypeOptions.find(f => f.type === fieldType)
    const newField: FormField = {
      id: `new-${Date.now()}`,
      field_type: fieldType,
      label: typeConfig?.label || fieldType,
      placeholder: null,
      description: null,
      required: false,
      position: fields.length,
      options: fieldType === 'select' || fieldType === 'radio' || fieldType === 'checkbox'
        ? [{ label: 'Opcao 1', value: 'opcao_1' }, { label: 'Opcao 2', value: 'opcao_2' }]
        : [],
      validation: {},
      map_to_contact_field: null,
      conditional: null,
    }
    setFields(prev => [...prev, newField])
    setExpandedField(newField.id)
  }

  // Remove field
  const removeField = (fieldId: string) => {
    setFields(prev => prev.filter(f => f.id !== fieldId))
  }

  // Update field
  const updateField = (fieldId: string, updates: Partial<FormField>) => {
    setFields(prev => prev.map(f => f.id === fieldId ? { ...f, ...updates } : f))
  }

  // Move field
  const moveField = (index: number, direction: 'up' | 'down') => {
    const newFields = [...fields]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= newFields.length) return
    ;[newFields[index], newFields[targetIndex]] = [newFields[targetIndex], newFields[index]]
    newFields.forEach((f, i) => f.position = i)
    setFields(newFields)
  }

  // Add event
  const addEvent = async () => {
    try {
      const res = await fetch(`/api/forms/${formId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Novo Evento',
          event_name: 'Lead',
          trigger_type: 'on_submit',
          send_to_facebook: true,
          send_to_google: false,
          position: events.length,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setEvents(prev => [...prev, data.event])
        setExpandedEvent(data.event.id)
      }
    } catch (error) {
      console.error('Error adding event:', error)
    }
  }

  // Update event
  const updateEvent = async (eventId: string, updates: Partial<FormEvent>) => {
    try {
      await fetch(`/api/forms/${formId}/events`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, ...updates }),
      })
      setEvents(prev => prev.map(e => e.id === eventId ? { ...e, ...updates } : e))
    } catch (error) {
      console.error('Error updating event:', error)
    }
  }

  // Delete event
  const deleteEvent = async (eventId: string) => {
    try {
      await fetch(`/api/forms/${formId}/events?eventId=${eventId}`, { method: 'DELETE' })
      setEvents(prev => prev.filter(e => e.id !== eventId))
    } catch (error) {
      console.error('Error deleting event:', error)
    }
  }

  // Get embed code
  const getEmbedCode = () => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
    return `<iframe
  src="${baseUrl}/embed/${formId}"
  width="100%"
  height="600"
  frameborder="0"
  style="border: none; border-radius: 12px;"
></iframe>`
  }

  // Get script embed code
  const getScriptCode = () => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
    return `<div id="worder-form-${formId}"></div>
<script src="${baseUrl}/embed/widget.js" data-form-id="${formId}"></script>`
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-dark-400" />
      </div>
    )
  }

  if (!form) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
        <h3 className="text-lg font-semibold text-white">Formulario nao encontrado</h3>
        <button onClick={() => router.push('/forms')} className="mt-4 text-primary-400 hover:text-primary-300">
          Voltar para formularios
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/forms')} className="p-2 rounded-lg hover:bg-dark-800 text-dark-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm(prev => prev ? { ...prev, name: e.target.value } : null)}
              onBlur={(e) => saveFormSettings({ name: e.target.value })}
              className="text-2xl font-bold text-white bg-transparent border-none outline-none focus:ring-0"
            />
            <div className="flex items-center gap-3 mt-1">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                form.status === 'published' ? 'bg-green-500/10 text-green-400' :
                form.status === 'draft' ? 'bg-yellow-500/10 text-yellow-400' :
                'bg-dark-500/10 text-dark-400'
              }`}>
                {form.status === 'published' ? 'Publicado' : form.status === 'draft' ? 'Rascunho' : 'Arquivado'}
              </span>
              <span className="text-xs text-dark-500">{form.submissions_count} leads | {form.views_count} views</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {saveSuccess && (
            <motion.span
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="text-sm text-green-400 flex items-center gap-1"
            >
              <CheckCircle className="w-4 h-4" />
              Salvo
            </motion.span>
          )}

          {form.status === 'draft' ? (
            <button
              onClick={() => saveFormSettings({ status: 'published' })}
              className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl font-medium transition-colors"
            >
              <Globe className="w-4 h-4" />
              Publicar
            </button>
          ) : (
            <button
              onClick={() => saveFormSettings({ status: 'draft' })}
              className="flex items-center gap-2 px-4 py-2 bg-dark-700 hover:bg-dark-600 text-white rounded-xl font-medium transition-colors"
            >
              <EyeOff className="w-4 h-4" />
              Despublicar
            </button>
          )}

          <button
            onClick={saveFields}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 disabled:bg-dark-700 text-white rounded-xl font-medium transition-colors"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-dark-800/50 p-1 rounded-xl border border-dark-700/50 overflow-x-auto">
        {[
          { id: 'fields' as const, label: 'Campos', icon: FileText },
          { id: 'events' as const, label: 'Eventos Ads', icon: Zap },
          { id: 'settings' as const, label: 'Configuracoes', icon: Settings },
          { id: 'embed' as const, label: 'Incorporar', icon: Code },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? 'bg-dark-700 text-white'
                : 'text-dark-400 hover:text-white'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2">
          {/* FIELDS TAB */}
          {activeTab === 'fields' && (
            <div className="space-y-3">
              {fields.map((field, index) => {
                const typeConfig = fieldTypeOptions.find(f => f.type === field.field_type)
                const TypeIcon = typeConfig?.icon || FileText
                const isExpanded = expandedField === field.id

                return (
                  <motion.div
                    key={field.id}
                    layout
                    className="bg-dark-800/60 border border-dark-700/50 rounded-xl overflow-hidden"
                  >
                    {/* Field header */}
                    <div
                      className="flex items-center gap-3 p-4 cursor-pointer"
                      onClick={() => setExpandedField(isExpanded ? null : field.id)}
                    >
                      <GripVertical className="w-4 h-4 text-dark-500 cursor-grab" />
                      <div className="p-1.5 rounded-lg bg-dark-700/50">
                        <TypeIcon className="w-4 h-4 text-primary-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white">{field.label}</p>
                        <p className="text-xs text-dark-400">{typeConfig?.label} {field.required && '(obrigatorio)'}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={(e) => { e.stopPropagation(); moveField(index, 'up') }} className="p-1 text-dark-500 hover:text-white" disabled={index === 0}>
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); moveField(index, 'down') }} className="p-1 text-dark-500 hover:text-white" disabled={index === fields.length - 1}>
                          <ChevronDown className="w-4 h-4" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); removeField(field.id) }} className="p-1 text-dark-500 hover:text-red-400">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Field editor */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="border-t border-dark-700/50 px-4 pb-4"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                            <div>
                              <label className="block text-xs text-dark-400 mb-1">Label</label>
                              <input
                                type="text"
                                value={field.label}
                                onChange={(e) => updateField(field.id, { label: e.target.value })}
                                className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-primary-500"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-dark-400 mb-1">Placeholder</label>
                              <input
                                type="text"
                                value={field.placeholder || ''}
                                onChange={(e) => updateField(field.id, { placeholder: e.target.value })}
                                className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-primary-500"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-dark-400 mb-1">Mapear para Contato</label>
                              <select
                                value={field.map_to_contact_field || ''}
                                onChange={(e) => updateField(field.id, { map_to_contact_field: e.target.value || null })}
                                className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-primary-500"
                              >
                                {contactFieldOptions.map(opt => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                            </div>
                            <div className="flex items-center gap-3">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <button
                                  onClick={() => updateField(field.id, { required: !field.required })}
                                  className={`w-10 h-5 rounded-full relative transition-colors ${field.required ? 'bg-primary-500' : 'bg-dark-700'}`}
                                >
                                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${field.required ? 'left-5' : 'left-0.5'}`} />
                                </button>
                                <span className="text-sm text-dark-300">Obrigatorio</span>
                              </label>
                            </div>
                          </div>

                          {/* Options for select/radio/checkbox */}
                          {(['select', 'radio', 'checkbox', 'multi_select'].includes(field.field_type)) && (
                            <div className="mt-4">
                              <label className="block text-xs text-dark-400 mb-2">Opcoes</label>
                              <div className="space-y-2">
                                {(field.options || []).map((opt: any, optIndex: number) => (
                                  <div key={optIndex} className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      value={opt.label}
                                      onChange={(e) => {
                                        const newOptions = [...field.options]
                                        newOptions[optIndex] = { ...newOptions[optIndex], label: e.target.value, value: e.target.value.toLowerCase().replace(/\s+/g, '_') }
                                        updateField(field.id, { options: newOptions })
                                      }}
                                      className="flex-1 px-3 py-1.5 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-primary-500"
                                    />
                                    <button
                                      onClick={() => {
                                        const newOptions = field.options.filter((_: any, i: number) => i !== optIndex)
                                        updateField(field.id, { options: newOptions })
                                      }}
                                      className="p-1 text-dark-500 hover:text-red-400"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                ))}
                                <button
                                  onClick={() => {
                                    const newOptions = [...field.options, { label: `Opcao ${field.options.length + 1}`, value: `opcao_${field.options.length + 1}` }]
                                    updateField(field.id, { options: newOptions })
                                  }}
                                  className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1"
                                >
                                  <Plus className="w-3 h-3" />
                                  Adicionar opcao
                                </button>
                              </div>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )
              })}

              {/* Add field */}
              <div className="p-4 bg-dark-800/40 rounded-xl border border-dark-700/30 border-dashed">
                <p className="text-sm text-dark-400 mb-3">Adicionar campo</p>
                <div className="flex flex-wrap gap-2">
                  {fieldTypeOptions.map(ft => (
                    <button
                      key={ft.type}
                      onClick={() => addField(ft.type)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 hover:bg-dark-600 text-dark-300 hover:text-white rounded-lg text-xs font-medium transition-colors"
                    >
                      <ft.icon className="w-3.5 h-3.5" />
                      {ft.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* EVENTS TAB */}
          {activeTab === 'events' && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                <p className="text-sm text-blue-400">
                  Configure eventos para disparar para Facebook Ads e Google Ads quando leads se cadastram.
                  Voce pode criar condicoes para enviar eventos diferentes baseado nas respostas do formulario.
                </p>
              </div>

              {events.map(event => {
                const isExpanded = expandedEvent === event.id
                return (
                  <motion.div
                    key={event.id}
                    layout
                    className="bg-dark-800/60 border border-dark-700/50 rounded-xl overflow-hidden"
                  >
                    <div
                      className="flex items-center gap-3 p-4 cursor-pointer"
                      onClick={() => setExpandedEvent(isExpanded ? null : event.id)}
                    >
                      <div className={`p-1.5 rounded-lg ${event.is_active ? 'bg-green-500/20' : 'bg-dark-700/50'}`}>
                        <Zap className={`w-4 h-4 ${event.is_active ? 'text-green-400' : 'text-dark-500'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white">{event.name}</p>
                        <p className="text-xs text-dark-400">{triggerTypeLabels[event.trigger_type]} | Evento: {event.event_name}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {event.send_to_facebook && <span className="px-2 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-400">FB</span>}
                        {event.send_to_google && <span className="px-2 py-0.5 rounded text-[10px] bg-red-500/10 text-red-400">Google</span>}
                        <button onClick={(e) => { e.stopPropagation(); deleteEvent(event.id) }} className="p-1 text-dark-500 hover:text-red-400">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="border-t border-dark-700/50 px-4 pb-4"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                            <div>
                              <label className="block text-xs text-dark-400 mb-1">Nome do Evento (interno)</label>
                              <input
                                type="text"
                                value={event.name}
                                onChange={(e) => updateEvent(event.id, { name: e.target.value })}
                                className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-primary-500"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-dark-400 mb-1">Nome Evento Ads</label>
                              <select
                                value={event.event_name}
                                onChange={(e) => updateEvent(event.id, { event_name: e.target.value })}
                                className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-primary-500"
                              >
                                <option value="Lead">Lead</option>
                                <option value="CompleteRegistration">CompleteRegistration (Lead Qualificado)</option>
                                <option value="Schedule">Schedule (Reuniao Marcada)</option>
                                <option value="SubmitApplication">SubmitApplication</option>
                                <option value="Contact">Contact</option>
                                <option value="ViewContent">ViewContent</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-dark-400 mb-1">Trigger</label>
                              <select
                                value={event.trigger_type}
                                onChange={(e) => updateEvent(event.id, { trigger_type: e.target.value })}
                                className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-primary-500"
                              >
                                <option value="on_submit">Quando formulario e submetido</option>
                                <option value="on_condition">Quando condicoes sao atendidas</option>
                                <option value="on_page_view">Quando visita pagina de obrigado</option>
                                <option value="on_stage_change">Quando lead muda de estagio</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-dark-400 mb-1">Valor do Evento (R$)</label>
                              <input
                                type="number"
                                value={event.event_value || ''}
                                onChange={(e) => updateEvent(event.id, { event_value: e.target.value ? parseFloat(e.target.value) : null })}
                                placeholder="Opcional"
                                className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-primary-500"
                              />
                            </div>
                          </div>

                          {/* Platforms */}
                          <div className="flex items-center gap-4 mt-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <button
                                onClick={() => updateEvent(event.id, { send_to_facebook: !event.send_to_facebook })}
                                className={`w-10 h-5 rounded-full relative transition-colors ${event.send_to_facebook ? 'bg-blue-500' : 'bg-dark-700'}`}
                              >
                                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${event.send_to_facebook ? 'left-5' : 'left-0.5'}`} />
                              </button>
                              <span className="text-sm text-dark-300">Facebook Ads</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <button
                                onClick={() => updateEvent(event.id, { send_to_google: !event.send_to_google })}
                                className={`w-10 h-5 rounded-full relative transition-colors ${event.send_to_google ? 'bg-red-500' : 'bg-dark-700'}`}
                              >
                                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${event.send_to_google ? 'left-5' : 'left-0.5'}`} />
                              </button>
                              <span className="text-sm text-dark-300">Google Ads</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <button
                                onClick={() => updateEvent(event.id, { is_active: !event.is_active })}
                                className={`w-10 h-5 rounded-full relative transition-colors ${event.is_active ? 'bg-green-500' : 'bg-dark-700'}`}
                              >
                                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${event.is_active ? 'left-5' : 'left-0.5'}`} />
                              </button>
                              <span className="text-sm text-dark-300">Ativo</span>
                            </label>
                          </div>

                          {/* Conditions (for on_condition trigger) */}
                          {event.trigger_type === 'on_condition' && (
                            <div className="mt-4 p-3 bg-dark-900/50 rounded-lg">
                              <p className="text-xs text-dark-400 mb-2">Condicoes (todas devem ser verdadeiras)</p>
                              {(event.conditions || []).map((cond: any, condIndex: number) => (
                                <div key={condIndex} className="flex items-center gap-2 mb-2">
                                  <select
                                    value={cond.field_id || ''}
                                    onChange={(e) => {
                                      const newConds = [...(event.conditions || [])]
                                      newConds[condIndex] = { ...newConds[condIndex], field_id: e.target.value }
                                      updateEvent(event.id, { conditions: newConds })
                                    }}
                                    className="flex-1 px-2 py-1.5 bg-dark-800 border border-dark-700 rounded text-xs text-white"
                                  >
                                    <option value="">Selecione campo</option>
                                    {fields.map(f => (
                                      <option key={f.id} value={f.id}>{f.label}</option>
                                    ))}
                                  </select>
                                  <select
                                    value={cond.operator || 'equals'}
                                    onChange={(e) => {
                                      const newConds = [...(event.conditions || [])]
                                      newConds[condIndex] = { ...newConds[condIndex], operator: e.target.value }
                                      updateEvent(event.id, { conditions: newConds })
                                    }}
                                    className="px-2 py-1.5 bg-dark-800 border border-dark-700 rounded text-xs text-white"
                                  >
                                    <option value="equals">Igual a</option>
                                    <option value="contains">Contem</option>
                                    <option value="not_equals">Diferente de</option>
                                    <option value="greater_than">Maior que</option>
                                    <option value="less_than">Menor que</option>
                                    <option value="in">Esta em</option>
                                    <option value="not_empty">Nao vazio</option>
                                  </select>
                                  <input
                                    type="text"
                                    value={cond.value || ''}
                                    onChange={(e) => {
                                      const newConds = [...(event.conditions || [])]
                                      newConds[condIndex] = { ...newConds[condIndex], value: e.target.value }
                                      updateEvent(event.id, { conditions: newConds })
                                    }}
                                    placeholder="Valor"
                                    className="flex-1 px-2 py-1.5 bg-dark-800 border border-dark-700 rounded text-xs text-white"
                                  />
                                  <button
                                    onClick={() => {
                                      const newConds = (event.conditions || []).filter((_: any, i: number) => i !== condIndex)
                                      updateEvent(event.id, { conditions: newConds })
                                    }}
                                    className="p-1 text-dark-500 hover:text-red-400"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                              <button
                                onClick={() => {
                                  const newConds = [...(event.conditions || []), { field_id: '', operator: 'equals', value: '' }]
                                  updateEvent(event.id, { conditions: newConds })
                                }}
                                className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1 mt-1"
                              >
                                <Plus className="w-3 h-3" />
                                Adicionar condicao
                              </button>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )
              })}

              <button
                onClick={addEvent}
                className="w-full p-4 bg-dark-800/40 rounded-xl border border-dark-700/30 border-dashed text-dark-400 hover:text-white hover:border-primary-500/30 transition-all flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Adicionar Evento
              </button>
            </div>
          )}

          {/* SETTINGS TAB */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
              {/* Pipeline Config */}
              <div className="p-5 bg-dark-800/60 border border-dark-700/50 rounded-xl">
                <h3 className="text-base font-semibold text-white mb-4">Pipeline CRM</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-dark-400 mb-1">Pipeline</label>
                    <select
                      value={form.pipeline_id || ''}
                      onChange={(e) => saveFormSettings({ pipeline_id: e.target.value || null })}
                      className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-primary-500"
                    >
                      <option value="">Nenhum pipeline</option>
                      {pipelines.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  {form.pipeline_id && (
                    <div>
                      <label className="block text-xs text-dark-400 mb-1">Estagio inicial</label>
                      <select
                        value={form.stage_id || ''}
                        onChange={(e) => saveFormSettings({ stage_id: e.target.value || null })}
                        className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-primary-500"
                      >
                        <option value="">Primeiro estagio</option>
                        {pipelines.find(p => p.id === form.pipeline_id)?.stages?.map((s: any) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* Tracking Pixels */}
              <div className="p-5 bg-dark-800/60 border border-dark-700/50 rounded-xl">
                <h3 className="text-base font-semibold text-white mb-4">Pixels de Rastreamento</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-dark-400 mb-1">Facebook Pixel ID</label>
                    <input
                      type="text"
                      value={form.facebook_pixel_id || ''}
                      onChange={(e) => setForm(prev => prev ? { ...prev, facebook_pixel_id: e.target.value } : null)}
                      onBlur={(e) => saveFormSettings({ facebook_pixel_id: e.target.value || null })}
                      placeholder="Ex: 1234567890"
                      className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-dark-400 mb-1">Google Ads Conversion ID</label>
                    <input
                      type="text"
                      value={form.google_ads_id || ''}
                      onChange={(e) => setForm(prev => prev ? { ...prev, google_ads_id: e.target.value } : null)}
                      onBlur={(e) => saveFormSettings({ google_ads_id: e.target.value || null })}
                      placeholder="Ex: AW-123456789"
                      className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-dark-400 mb-1">Google Analytics ID</label>
                    <input
                      type="text"
                      value={form.google_analytics_id || ''}
                      onChange={(e) => setForm(prev => prev ? { ...prev, google_analytics_id: e.target.value } : null)}
                      onBlur={(e) => saveFormSettings({ google_analytics_id: e.target.value || null })}
                      placeholder="Ex: G-XXXXXXXXXX"
                      className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-primary-500"
                    />
                  </div>
                </div>
              </div>

              {/* Success Config */}
              <div className="p-5 bg-dark-800/60 border border-dark-700/50 rounded-xl">
                <h3 className="text-base font-semibold text-white mb-4">Apos Envio</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-dark-400 mb-1">Mensagem de Sucesso</label>
                    <textarea
                      value={form.success_message || ''}
                      onChange={(e) => setForm(prev => prev ? { ...prev, success_message: e.target.value } : null)}
                      onBlur={(e) => saveFormSettings({ success_message: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-primary-500 resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-dark-400 mb-1">URL de Redirecionamento (opcional)</label>
                    <input
                      type="url"
                      value={form.redirect_url || ''}
                      onChange={(e) => setForm(prev => prev ? { ...prev, redirect_url: e.target.value } : null)}
                      onBlur={(e) => saveFormSettings({ redirect_url: e.target.value || null })}
                      placeholder="https://seusite.com/obrigado"
                      className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-primary-500"
                    />
                    <p className="text-xs text-dark-500 mt-1">Se preenchido, o lead sera redirecionado para esta URL apos o envio. Use para paginas de obrigado com eventos de &quot;Reuniao Marcada&quot;.</p>
                  </div>
                </div>
              </div>

              {/* Design/Appearance */}
              <div className="p-5 bg-dark-800/60 border border-dark-700/50 rounded-xl">
                <h3 className="text-base font-semibold text-white mb-4">Aparencia do Formulario</h3>
                <div className="space-y-4">
                  {/* Hide Labels Toggle */}
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm text-white">Ocultar labels</label>
                      <p className="text-xs text-dark-400">Usar apenas placeholders nos campos</p>
                    </div>
                    <button
                      onClick={() => {
                        const newTheme = { ...form.theme, hideLabels: !form.theme?.hideLabels }
                        setForm(prev => prev ? { ...prev, theme: newTheme } : null)
                        saveFormSettings({ theme: newTheme })
                      }}
                      className={`w-10 h-5 rounded-full relative transition-colors ${form.theme?.hideLabels ? 'bg-primary-500' : 'bg-dark-700'}`}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${form.theme?.hideLabels ? 'left-5' : 'left-0.5'}`} />
                    </button>
                  </div>

                  {/* Color Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Background Color */}
                    <div>
                      <label className="block text-xs text-dark-400 mb-1">Cor de fundo</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={form.theme?.backgroundColor || '#ffffff'}
                          onChange={(e) => {
                            const newTheme = { ...form.theme, backgroundColor: e.target.value }
                            setForm(prev => prev ? { ...prev, theme: newTheme } : null)
                          }}
                          onBlur={() => saveFormSettings({ theme: form.theme })}
                          className="w-10 h-10 rounded-lg cursor-pointer border-0"
                        />
                        <input
                          type="text"
                          value={form.theme?.backgroundColor || '#ffffff'}
                          onChange={(e) => {
                            const newTheme = { ...form.theme, backgroundColor: e.target.value }
                            setForm(prev => prev ? { ...prev, theme: newTheme } : null)
                          }}
                          onBlur={() => saveFormSettings({ theme: form.theme })}
                          className="flex-1 px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-primary-500"
                        />
                      </div>
                    </div>

                    {/* Text Color */}
                    <div>
                      <label className="block text-xs text-dark-400 mb-1">Cor do texto</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={form.theme?.textColor || '#1f2937'}
                          onChange={(e) => {
                            const newTheme = { ...form.theme, textColor: e.target.value }
                            setForm(prev => prev ? { ...prev, theme: newTheme } : null)
                          }}
                          onBlur={() => saveFormSettings({ theme: form.theme })}
                          className="w-10 h-10 rounded-lg cursor-pointer border-0"
                        />
                        <input
                          type="text"
                          value={form.theme?.textColor || '#1f2937'}
                          onChange={(e) => {
                            const newTheme = { ...form.theme, textColor: e.target.value }
                            setForm(prev => prev ? { ...prev, theme: newTheme } : null)
                          }}
                          onBlur={() => saveFormSettings({ theme: form.theme })}
                          className="flex-1 px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-primary-500"
                        />
                      </div>
                    </div>

                    {/* Primary/Button Color */}
                    <div>
                      <label className="block text-xs text-dark-400 mb-1">Cor do botao</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={form.theme?.primaryColor || '#6366f1'}
                          onChange={(e) => {
                            const newTheme = { ...form.theme, primaryColor: e.target.value }
                            setForm(prev => prev ? { ...prev, theme: newTheme } : null)
                          }}
                          onBlur={() => saveFormSettings({ theme: form.theme })}
                          className="w-10 h-10 rounded-lg cursor-pointer border-0"
                        />
                        <input
                          type="text"
                          value={form.theme?.primaryColor || '#6366f1'}
                          onChange={(e) => {
                            const newTheme = { ...form.theme, primaryColor: e.target.value }
                            setForm(prev => prev ? { ...prev, theme: newTheme } : null)
                          }}
                          onBlur={() => saveFormSettings({ theme: form.theme })}
                          className="flex-1 px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-primary-500"
                        />
                      </div>
                    </div>

                    {/* Input Background */}
                    <div>
                      <label className="block text-xs text-dark-400 mb-1">Fundo dos campos</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={form.theme?.inputBackgroundColor || '#ffffff'}
                          onChange={(e) => {
                            const newTheme = { ...form.theme, inputBackgroundColor: e.target.value }
                            setForm(prev => prev ? { ...prev, theme: newTheme } : null)
                          }}
                          onBlur={() => saveFormSettings({ theme: form.theme })}
                          className="w-10 h-10 rounded-lg cursor-pointer border-0"
                        />
                        <input
                          type="text"
                          value={form.theme?.inputBackgroundColor || '#ffffff'}
                          onChange={(e) => {
                            const newTheme = { ...form.theme, inputBackgroundColor: e.target.value }
                            setForm(prev => prev ? { ...prev, theme: newTheme } : null)
                          }}
                          onBlur={() => saveFormSettings({ theme: form.theme })}
                          className="flex-1 px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-primary-500"
                        />
                      </div>
                    </div>

                    {/* Input Border Color */}
                    <div>
                      <label className="block text-xs text-dark-400 mb-1">Borda dos campos</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={form.theme?.inputBorderColor || '#e5e7eb'}
                          onChange={(e) => {
                            const newTheme = { ...form.theme, inputBorderColor: e.target.value }
                            setForm(prev => prev ? { ...prev, theme: newTheme } : null)
                          }}
                          onBlur={() => saveFormSettings({ theme: form.theme })}
                          className="w-10 h-10 rounded-lg cursor-pointer border-0"
                        />
                        <input
                          type="text"
                          value={form.theme?.inputBorderColor || '#e5e7eb'}
                          onChange={(e) => {
                            const newTheme = { ...form.theme, inputBorderColor: e.target.value }
                            setForm(prev => prev ? { ...prev, theme: newTheme } : null)
                          }}
                          onBlur={() => saveFormSettings({ theme: form.theme })}
                          className="flex-1 px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-primary-500"
                        />
                      </div>
                    </div>

                    {/* Border Radius */}
                    <div>
                      <label className="block text-xs text-dark-400 mb-1">Arredondamento (px)</label>
                      <input
                        type="number"
                        min="0"
                        max="30"
                        value={form.theme?.borderRadius || 12}
                        onChange={(e) => {
                          const newTheme = { ...form.theme, borderRadius: parseInt(e.target.value) || 0 }
                          setForm(prev => prev ? { ...prev, theme: newTheme } : null)
                        }}
                        onBlur={() => saveFormSettings({ theme: form.theme })}
                        className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-primary-500"
                      />
                    </div>
                  </div>

                  {/* Quick Themes */}
                  <div>
                    <label className="block text-xs text-dark-400 mb-2">Temas rapidos</label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          const lightTheme = {
                            ...form.theme,
                            backgroundColor: '#ffffff',
                            textColor: '#1f2937',
                            primaryColor: '#6366f1',
                            inputBackgroundColor: '#ffffff',
                            inputBorderColor: '#e5e7eb',
                          }
                          setForm(prev => prev ? { ...prev, theme: lightTheme } : null)
                          saveFormSettings({ theme: lightTheme })
                        }}
                        className="px-3 py-1.5 bg-white border border-gray-300 text-gray-800 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
                      >
                        Claro
                      </button>
                      <button
                        onClick={() => {
                          const darkTheme = {
                            ...form.theme,
                            backgroundColor: '#1a1a2e',
                            textColor: '#ffffff',
                            primaryColor: '#6366f1',
                            inputBackgroundColor: '#16213e',
                            inputBorderColor: '#0f3460',
                          }
                          setForm(prev => prev ? { ...prev, theme: darkTheme } : null)
                          saveFormSettings({ theme: darkTheme })
                        }}
                        className="px-3 py-1.5 bg-[#1a1a2e] border border-[#0f3460] text-white rounded-lg text-xs font-medium hover:bg-[#16213e] transition-colors"
                      >
                        Escuro
                      </button>
                      <button
                        onClick={() => {
                          const greenTheme = {
                            ...form.theme,
                            backgroundColor: '#0d1117',
                            textColor: '#c9d1d9',
                            primaryColor: '#238636',
                            inputBackgroundColor: '#161b22',
                            inputBorderColor: '#30363d',
                          }
                          setForm(prev => prev ? { ...prev, theme: greenTheme } : null)
                          saveFormSettings({ theme: greenTheme })
                        }}
                        className="px-3 py-1.5 bg-[#0d1117] border border-[#30363d] text-[#c9d1d9] rounded-lg text-xs font-medium hover:bg-[#161b22] transition-colors"
                      >
                        GitHub
                      </button>
                      <button
                        onClick={() => {
                          const blueTheme = {
                            ...form.theme,
                            backgroundColor: '#0f172a',
                            textColor: '#e2e8f0',
                            primaryColor: '#3b82f6',
                            inputBackgroundColor: '#1e293b',
                            inputBorderColor: '#334155',
                          }
                          setForm(prev => prev ? { ...prev, theme: blueTheme } : null)
                          saveFormSettings({ theme: blueTheme })
                        }}
                        className="px-3 py-1.5 bg-[#0f172a] border border-[#334155] text-[#e2e8f0] rounded-lg text-xs font-medium hover:bg-[#1e293b] transition-colors"
                      >
                        Azul
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* EMBED TAB */}
          {activeTab === 'embed' && (
            <div className="space-y-6">
              {form.status !== 'published' && (
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-yellow-400 font-medium">Formulario nao publicado</p>
                    <p className="text-xs text-yellow-400/70 mt-1">Publique o formulario para que ele funcione no embed.</p>
                  </div>
                </div>
              )}

              {/* iFrame embed */}
              <div className="p-5 bg-dark-800/60 border border-dark-700/50 rounded-xl">
                <h3 className="text-base font-semibold text-white mb-2">Incorporar via iFrame</h3>
                <p className="text-xs text-dark-400 mb-4">Cole este codigo no HTML do seu site onde deseja exibir o formulario.</p>
                <div className="relative">
                  <pre className="p-4 bg-dark-900 rounded-lg text-xs text-green-400 overflow-x-auto whitespace-pre-wrap">
                    {getEmbedCode()}
                  </pre>
                  <button
                    onClick={() => navigator.clipboard.writeText(getEmbedCode())}
                    className="absolute top-2 right-2 p-2 bg-dark-700 hover:bg-dark-600 rounded-lg text-dark-300 hover:text-white transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Direct link */}
              <div className="p-5 bg-dark-800/60 border border-dark-700/50 rounded-xl">
                <h3 className="text-base font-semibold text-white mb-2">Link Direto</h3>
                <p className="text-xs text-dark-400 mb-4">Compartilhe este link diretamente com seus leads.</p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={typeof window !== 'undefined' ? `${window.location.origin}/embed/${formId}` : ''}
                    className="flex-1 px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-dark-300"
                  />
                  <button
                    onClick={() => navigator.clipboard.writeText(`${window.location.origin}/embed/${formId}`)}
                    className="px-4 py-2 bg-dark-700 hover:bg-dark-600 text-dark-300 hover:text-white rounded-lg transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Preview Sidebar */}
        <div className="lg:col-span-1">
          <div className="sticky top-20">
            <div className="p-5 bg-dark-800/60 border border-dark-700/50 rounded-xl">
              <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
                <Eye className="w-4 h-4" />
                Preview
              </h3>
              <div className="p-4 bg-white rounded-xl">
                <div className="space-y-3">
                  {fields.map(field => (
                    <div key={field.id}>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        {field.label} {field.required && <span className="text-red-500">*</span>}
                      </label>
                      {field.field_type === 'textarea' ? (
                        <textarea
                          placeholder={field.placeholder || ''}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs text-gray-900 placeholder:text-gray-400"
                          rows={3}
                          readOnly
                        />
                      ) : field.field_type === 'select' ? (
                        <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs text-gray-900" disabled>
                          <option>{field.placeholder || 'Selecione...'}</option>
                          {(field.options || []).map((opt: any, i: number) => (
                            <option key={i}>{opt.label}</option>
                          ))}
                        </select>
                      ) : field.field_type === 'radio' ? (
                        <div className="space-y-1">
                          {(field.options || []).map((opt: any, i: number) => (
                            <label key={i} className="flex items-center gap-2 text-xs text-gray-700">
                              <input type="radio" name={field.id} disabled className="w-3 h-3" />
                              {opt.label}
                            </label>
                          ))}
                        </div>
                      ) : field.field_type === 'checkbox' ? (
                        <div className="space-y-1">
                          {(field.options || []).map((opt: any, i: number) => (
                            <label key={i} className="flex items-center gap-2 text-xs text-gray-700">
                              <input type="checkbox" disabled className="w-3 h-3" />
                              {opt.label}
                            </label>
                          ))}
                        </div>
                      ) : (
                        <input
                          type={field.field_type === 'email' ? 'email' : field.field_type === 'phone' ? 'tel' : field.field_type === 'number' ? 'number' : 'text'}
                          placeholder={field.placeholder || ''}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs text-gray-900 placeholder:text-gray-400"
                          readOnly
                        />
                      )}
                    </div>
                  ))}
                  <button className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium">
                    Enviar
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
