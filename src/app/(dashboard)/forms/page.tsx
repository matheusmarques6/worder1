'use client'
import { useConfirm } from '@/components/ui/ConfirmDialog'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { useStoreStore } from '@/stores'
import {
  Plus, FileText, Eye, Users, BarChart3, Settings,
  Loader2, Search, Trash2, Copy, ExternalLink,
  CheckCircle, Clock, Archive, MoreVertical,
  Zap, Globe, X, Power, PowerOff, Filter,
  MessageSquare, Maximize, Minus, MousePointer,
  Code,
} from 'lucide-react'

interface Form {
  id: string
  name: string
  slug: string
  description: string | null
  status: 'draft' | 'published' | 'archived'
  submissions_count: number
  views_count: number
  theme: any
  pipeline: { id: string; name: string; color: string } | null
  facebook_pixel_id: string | null
  google_ads_id: string | null
  created_at: string
  updated_at: string
}

type FormType = 'all' | 'popup' | 'embedded' | 'landing'

const statusLabels: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft: { label: 'Rascunho', color: 'text-yellow-600 bg-yellow-50', icon: Clock },
  published: { label: 'Ativo', color: 'text-green-600 bg-green-50', icon: CheckCircle },
  archived: { label: 'Arquivado', color: 'text-gray-500 bg-gray-100', icon: Archive },
}

const formTypeLabels: Record<string, { label: string; icon: React.ElementType }> = {
  popup: { label: 'Popup', icon: MessageSquare },
  embedded: { label: 'Incorporado', icon: Code },
  landing: { label: 'Landing Page', icon: Globe },
  fullscreen: { label: 'Tela Cheia', icon: Maximize },
  bar: { label: 'Barra', icon: Minus },
  flyout: { label: 'Flyout', icon: MousePointer },
}

function getFormType(form: Form): string {
  return form.theme?.popupType || form.theme?.formType || 'embedded'
}

export default function FormsPage() {
  const { confirm } = useConfirm()
  const { currentStore } = useStoreStore()
  const [forms, setForms] = useState<Form[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<FormType>('all')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newFormName, setNewFormName] = useState('')
  const [newFormDescription, setNewFormDescription] = useState('')
  const [newFormType, setNewFormType] = useState('popup')
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>('lifestyle_image')
  const [creating, setCreating] = useState(false)
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  const [copiedEmbed, setCopiedEmbed] = useState<string | null>(null)
  const [togglingStatus, setTogglingStatus] = useState<string | null>(null)

  const fetchForms = useCallback(async () => {
    try {
      setIsLoading(true)
      // Always fetch — don't gate on currentStore.id. If the merchant has no
      // store yet (or currentStore is still hydrating), the API returns all
      // popups in the org and we still display them. Without this guard, a
      // stale Zustand store with a non-existent store ID would leave the
      // page stuck at "0 popups" forever.
      const params = new URLSearchParams()
      if (currentStore?.id) params.set('storeId', currentStore.id)
      // Cache buster so a freshly deployed API isn't masked by stale CDN.
      params.set('_t', String(Date.now()))
      const res = await fetch(`/api/forms?${params}`, { cache: 'no-store' })
      if (!res.ok) {
        console.error('[Forms] fetch failed:', res.status, await res.text())
        setForms([])
        return
      }
      const data = await res.json()
      console.log('[Forms] fetched', data.forms?.length ?? 0, 'forms')
      setForms(data.forms || [])
    } catch (error) {
      console.error('Erro ao buscar formularios:', error)
    } finally {
      setIsLoading(false)
    }
  }, [currentStore?.id])

  useEffect(() => {
    fetchForms()
  }, [fetchForms, currentStore?.id])

  const POPUP_TEMPLATES: Record<string, { name: string; desc: string; recommended?: boolean; design: any }> = {
    // First so it's the most prominent in the picker. Default-selected
    // when the create modal opens (see selectedTemplate state above).
    lifestyle_image: { name: 'Popup com imagem lateral', desc: 'Layout duas colunas: logo + formulário à esquerda, foto à direita.', recommended: true, design: {
      formType: 'popup',
      steps: [{ id: '1', name: 'Etapa 1', blocks: [
        // Logo placeholder — clique no bloco e abra a Media Library para trocar
        { id: 'logo', type: 'image', props: { src: '', alt: 'Logo', imgWidth: 50, maxHeight: 80, align: 'center', objectFit: 'contain', marginTop: 0, marginBottom: 24 } },
        { id: 'h1', type: 'text', props: { content: 'GANHE 10% OFF', tag: 'h2', fontSize: 32, color: '#111827', fontWeight: '800', align: 'center', lineHeight: 1.1, marginBottom: 4, letterSpacing: 0 } },
        { id: 'h2', type: 'text', props: { content: 'NO SEU PRIMEIRO PEDIDO', tag: 'p', fontSize: 13, color: '#6B7280', fontWeight: '600', align: 'center', letterSpacing: 1, marginBottom: 18 } },
        { id: 'sub', type: 'text', props: { content: 'Preencha o formulário e receba seu desconto instantaneamente por e-mail', tag: 'p', fontSize: 13, color: '#6B7280', align: 'center', lineHeight: 1.5, marginBottom: 20 } },
        { id: 'name', type: 'name-input', props: { placeholder: 'Digite seu nome', required: true, showLabel: false, mapTo: 'first_name', backgroundColor: '#F3F4F6', borderColor: '#F3F4F6', borderWidth: 0, corners: 'small', cornerRadius: 6, fontSize: 14, textColor: '#111827', placeholderColor: '#9CA3AF', inputPadTop: 14, inputPadRight: 16, inputPadBottom: 14, inputPadLeft: 16, marginBottom: 10 } },
        { id: 'email', type: 'email', props: { placeholder: 'Digite seu e-mail', required: true, showLabel: false, backgroundColor: '#F3F4F6', borderColor: '#F3F4F6', borderWidth: 0, corners: 'small', cornerRadius: 6, fontSize: 14, textColor: '#111827', placeholderColor: '#9CA3AF', inputPadTop: 14, inputPadRight: 16, inputPadBottom: 14, inputPadLeft: 16, marginBottom: 16 } },
        { id: 'btn', type: 'button', props: { text: 'RECEBER MEU DESCONTO', bgColor: '#DC2626', hoverColor: '#B91C1C', textColor: '#FFFFFF', fontSize: 14, btnFontWeight: '700', btnLetterSpacing: 0.5, borderRadius: 6, fullWidth: true, action: 'submit', paddingV: 16, paddingH: 28 } },
      ] }],
      successStep: { id: 'ok', name: 'Sucesso', blocks: [
        { id: 'ok1', type: 'text', props: { content: 'Pronto! 🎉', tag: 'h2', fontSize: 32, color: '#111827', fontWeight: '800', align: 'center', marginBottom: 8 } },
        { id: 'ok2', type: 'text', props: { content: 'Confira seu email para resgatar o cupom.', tag: 'p', fontSize: 14, color: '#6B7280', align: 'center', marginBottom: 16 } },
      ] },
      styles: {
        width: 720,
        backgroundColor: '#FFFFFF',
        borderRadius: 4,
        padding: 40,
        fontFamily: 'Inter, sans-serif',
        overlay: { enabled: true, color: '#000', opacity: 60, closeOnClick: true },
        closeButton: { show: true, color: '#FFFFFF', size: 22 },
        sideImage: { enabled: true, src: '', position: 'right', width: 360 },
        animation: 'fade',
      },
      behavior: {
        display: { trigger: 'time_delay', delay: 5, scrollPercent: 50 },
        visibility: { devices: 'all', visitorType: 'all', hideFromSubscribers: true },
        frequency: { showAfterDays: 7, stopAfterSubmission: true },
        targeting: { pages: 'all', pageUrls: [], excludeUrls: [] },
        scheduling: { enabled: false, startDate: '', endDate: '' },
        audience: { tags: ['popup-lifestyle'], listId: '', doubleOptIn: false },
      },
    }},
    discount: { name: 'Popup de Desconto', desc: 'Captura email com cupom de desconto', design: {
      formType: 'popup', steps: [{ id: '1', name: 'Etapa 1', blocks: [
        { id: 'h', type: 'text', props: { content: 'Ganhe 10% OFF', fontSize: 32, color: '#111827', fontWeight: 'bold', align: 'center', tag: 'h2' } },
        { id: 's', type: 'text', props: { content: 'Inscreva-se e receba um cupom exclusivo no seu email!', fontSize: 15, color: '#6B7280', align: 'center', tag: 'p' } },
        { id: 'e', type: 'email', props: { placeholder: 'Seu melhor email', required: true, showLabel: false } },
        { id: 'b', type: 'button', props: { text: 'QUERO MEU CUPOM', bgColor: '#F97316', textColor: '#fff', fontSize: 15, borderRadius: 8, fullWidth: true, action: 'submit', paddingV: 14, paddingH: 28 } },
        { id: 'l', type: 'legal-consent', props: { text: 'Aceito receber emails promocionais.', required: true, fontSize: 11, color: '#9CA3AF' } },
      ] }], successStep: { id: 'ok', name: 'Sucesso', blocks: [
        { id: 'ok1', type: 'text', props: { content: 'Pronto! 🎉', fontSize: 28, color: '#111827', fontWeight: 'bold', align: 'center' } },
        { id: 'ok2', type: 'coupon', props: { code: 'DESCONTO10', description: 'Use este cupom:', bgColor: '#FFF7ED', borderColor: '#F97316', fontSize: 24 } },
      ] }, styles: { width: 420, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 32, fontFamily: 'Inter, sans-serif', overlay: { enabled: true, color: '#000', opacity: 50, closeOnClick: true }, closeButton: { show: true, color: '#fff', size: 24 }, sideImage: { enabled: false, src: '', position: 'right', width: 200 }, animation: 'fade' },
      behavior: { display: { trigger: 'time_delay', delay: 5, scrollPercent: 50 }, visibility: { devices: 'all', visitorType: 'all', hideFromSubscribers: false }, frequency: { showAfterDays: 7, stopAfterSubmission: true }, targeting: { pages: 'all', pageUrls: [], excludeUrls: [] }, scheduling: { enabled: false, startDate: '', endDate: '' }, audience: { tags: [], listId: '', doubleOptIn: false } },
    }},
    newsletter: { name: 'Newsletter', desc: 'Captura simples de email para newsletter', design: {
      formType: 'popup', steps: [{ id: '1', name: 'Etapa 1', blocks: [
        { id: 'h', type: 'text', props: { content: 'Fique por dentro!', fontSize: 28, color: '#111827', fontWeight: 'bold', align: 'center' } },
        { id: 's', type: 'text', props: { content: 'Receba novidades e promoções exclusivas.', fontSize: 14, color: '#6B7280', align: 'center', tag: 'p' } },
        { id: 'e', type: 'email', props: { placeholder: 'Seu email', required: true, showLabel: false } },
        { id: 'b', type: 'button', props: { text: 'INSCREVER-SE', bgColor: '#111827', textColor: '#fff', fontSize: 14, borderRadius: 8, fullWidth: true, action: 'submit', paddingV: 12, paddingH: 24 } },
      ] }], successStep: { id: 'ok', name: 'Sucesso', blocks: [
        { id: 'ok1', type: 'text', props: { content: 'Obrigado! Você foi inscrito.', fontSize: 20, color: '#111827', fontWeight: 'bold', align: 'center' } },
      ] }, styles: { width: 400, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 28, fontFamily: 'Inter, sans-serif', overlay: { enabled: true, color: '#000', opacity: 40, closeOnClick: true }, closeButton: { show: true, color: '#9CA3AF', size: 20 }, sideImage: { enabled: false, src: '', position: 'right', width: 200 }, animation: 'slide-up' },
      behavior: { display: { trigger: 'time_delay', delay: 10, scrollPercent: 50 }, visibility: { devices: 'all', visitorType: 'new', hideFromSubscribers: true }, frequency: { showAfterDays: 30, stopAfterSubmission: true }, targeting: { pages: 'all', pageUrls: [], excludeUrls: [] }, scheduling: { enabled: false, startDate: '', endDate: '' }, audience: { tags: ['newsletter'], listId: '', doubleOptIn: false } },
    }},
    exit_intent: { name: 'Exit Intent', desc: 'Popup quando visitante vai sair da página', design: {
      formType: 'popup', steps: [{ id: '1', name: 'Etapa 1', blocks: [
        { id: 'h', type: 'text', props: { content: 'Espere! Não vá embora', fontSize: 28, color: '#111827', fontWeight: 'bold', align: 'center' } },
        { id: 's', type: 'text', props: { content: 'Temos uma oferta especial para você!', fontSize: 15, color: '#6B7280', align: 'center', tag: 'p' } },
        { id: 'e', type: 'email', props: { placeholder: 'Seu email', required: true, showLabel: false } },
        { id: 'b', type: 'button', props: { text: 'VER OFERTA', bgColor: '#DC2626', textColor: '#fff', fontSize: 15, borderRadius: 8, fullWidth: true, action: 'submit', paddingV: 14, paddingH: 28 } },
      ] }], successStep: { id: 'ok', name: 'Sucesso', blocks: [
        { id: 'ok1', type: 'text', props: { content: 'Confira seu email! 📧', fontSize: 22, color: '#111827', fontWeight: 'bold', align: 'center' } },
      ] }, styles: { width: 440, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 32, fontFamily: 'Inter, sans-serif', overlay: { enabled: true, color: '#000', opacity: 60, closeOnClick: true }, closeButton: { show: true, color: '#fff', size: 24 }, sideImage: { enabled: false, src: '', position: 'right', width: 200 }, animation: 'scale' },
      behavior: { display: { trigger: 'exit_intent', delay: 5, scrollPercent: 50, exitEnabled: true }, visibility: { devices: 'desktop', visitorType: 'all', hideFromSubscribers: false }, frequency: { showAfterDays: 3, stopAfterSubmission: true }, targeting: { pages: 'all', pageUrls: [], excludeUrls: [] }, scheduling: { enabled: false, startDate: '', endDate: '' }, audience: { tags: [], listId: '', doubleOptIn: false } },
    }},
    blank: { name: 'Em Branco', desc: 'Comece do zero', design: {} },
  }

  const createForm = async () => {
    if (!newFormName.trim()) return
    setCreating(true)
    const template = selectedTemplate ? POPUP_TEMPLATES[selectedTemplate] : null
    try {
      const res = await fetch('/api/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newFormName,
          description: newFormDescription,
          form_type: newFormType,
          store_id: currentStore?.id || null,
          design_json: template?.design || {},
          theme: {
            formType: newFormType,
            primaryColor: '#F97316',
            backgroundColor: '#ffffff',
            textColor: '#1f2937',
            borderRadius: 12,
            fontFamily: 'Inter',
            fontSize: 14,
            buttonText: 'Enviar',
          },
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setShowCreateModal(false)
        setNewFormName('')
        setNewFormDescription('')
        setNewFormType('popup')
        window.location.href = `/popup-editor/${data.form.id}`
      }
    } catch (error) {
      console.error('Erro ao criar formulario:', error)
    } finally {
      setCreating(false)
    }
  }

  const deleteForm = async (formId: string) => {
    const ok = await confirm({ title: 'Excluir formulário?', destructive: true, confirmLabel: 'Excluir' }); if (!ok) return
    try {
      const res = await fetch(`/api/forms/${formId}`, { method: 'DELETE' })
      if (res.ok) {
        setForms(prev => prev.filter(f => f.id !== formId))
      }
    } catch (error) {
      console.error('Erro ao deletar formulario:', error)
    }
  }

  const duplicateForm = async (form: Form) => {
    try {
      const res = await fetch('/api/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${form.name} (copia)`,
          description: form.description,
          theme: form.theme,
          store_id: currentStore?.id || null,
        }),
      })
      if (res.ok) {
        fetchForms()
      }
    } catch (error) {
      console.error('Erro ao duplicar formulario:', error)
    }
  }

  const toggleStatus = async (form: Form) => {
    const newStatus = form.status === 'published' ? 'draft' : 'published'
    setTogglingStatus(form.id)
    try {
      const res = await fetch(`/api/forms/${form.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        setForms(prev => prev.map(f => f.id === form.id ? { ...f, status: newStatus } : f))
      }
    } catch (error) {
      console.error('Erro ao alterar status:', error)
    } finally {
      setTogglingStatus(null)
    }
  }

  const copyEmbedCode = (form: Form) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const script = `<script src="${origin}/api/forms/${form.id}/embed" async></script>`
    navigator.clipboard.writeText(script)
    setCopiedEmbed(form.id)
    setTimeout(() => setCopiedEmbed(null), 2000)
  }

  const filteredForms = forms.filter(f => {
    const matchesSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.description?.toLowerCase().includes(searchQuery.toLowerCase())
    if (typeFilter === 'all') return matchesSearch
    const ft = getFormType(f)
    if (typeFilter === 'popup') return matchesSearch && ['popup', 'flyout', 'fullscreen', 'bar'].includes(ft)
    if (typeFilter === 'embedded') return matchesSearch && ft === 'embedded'
    if (typeFilter === 'landing') return matchesSearch && ft === 'landing'
    return matchesSearch
  })

  const conversionRate = (form: Form) => {
    if (form.views_count === 0) return 0
    return ((form.submissions_count / form.views_count) * 100)
  }

  const totalSubmissions = forms.reduce((sum, f) => sum + f.submissions_count, 0)
  const totalViews = forms.reduce((sum, f) => sum + f.views_count, 0)
  const activeForms = forms.filter(f => f.status === 'published').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Formularios</h1>
          <p className="text-gray-500 mt-1">Crie popups, formularios incorporados e landing pages para captar leads</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Criar Formulario
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-1">Total de Formularios</p>
          <p className="text-2xl font-bold text-gray-900">{forms.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-1">Formularios Ativos</p>
          <p className="text-2xl font-bold text-green-600">{activeForms}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-1">Total de Leads</p>
          <p className="text-2xl font-bold text-primary-600">{totalSubmissions}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-1">Conversao Media</p>
          <p className="text-2xl font-bold text-purple-600">
            {totalViews > 0 ? ((totalSubmissions / totalViews) * 100).toFixed(1) : '0.0'}%
          </p>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar formularios..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-primary-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          {(['all', 'popup', 'embedded', 'landing'] as FormType[]).map((type) => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                typeFilter === type
                  ? 'bg-primary-500 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {type === 'all' ? 'Todos' : type === 'popup' ? 'Popups' : type === 'embedded' ? 'Incorporados' : 'Landing Pages'}
            </button>
          ))}
        </div>
      </div>

      {/* Forms Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : filteredForms.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-20 bg-gray-50 rounded-2xl border border-dashed border-gray-300"
        >
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <FileText className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {forms.length === 0 ? 'Nenhum formulario criado' : 'Nenhum resultado encontrado'}
          </h3>
          <p className="text-gray-500 text-center max-w-md mb-6">
            {forms.length === 0
              ? 'Crie popups e formularios para captar leads e enviar eventos para Facebook e Google Ads'
              : 'Tente buscar com outros termos ou altere o filtro'}
          </p>
          {forms.length === 0 && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-6 py-3 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Criar Formulario
            </button>
          )}
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredForms.map((form) => {
            const statusInfo = statusLabels[form.status] || statusLabels.draft
            const StatusIcon = statusInfo.icon
            const formType = getFormType(form)
            const typeInfo = formTypeLabels[formType] || formTypeLabels.embedded
            const TypeIcon = typeInfo.icon
            return (
              <motion.div
                key={form.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-300 hover:shadow-sm transition-all group"
              >
                {/* Top row: type + status + menu */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-gray-100 text-gray-600 uppercase">
                      <TypeIcon className="w-3 h-3" />
                      {typeInfo.label}
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${statusInfo.color}`}>
                      <StatusIcon className="w-3 h-3" />
                      {statusInfo.label}
                    </span>
                  </div>

                  <div className="relative">
                    <button
                      onClick={() => setActiveMenu(activeMenu === form.id ? null : form.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    {activeMenu === form.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setActiveMenu(null)} />
                        <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-xl shadow-xl z-20 py-1">
                          <Link
                            href={`/popup-editor/${form.id}`}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            <Settings className="w-4 h-4" />
                            Editar
                          </Link>
                          <Link
                            href={`/forms/${form.id}/submissions`}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            <Users className="w-4 h-4" />
                            Submissoes
                          </Link>
                          <button
                            onClick={() => { toggleStatus(form); setActiveMenu(null) }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            {form.status === 'published' ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                            {form.status === 'published' ? 'Desativar' : 'Ativar'}
                          </button>
                          <button
                            onClick={() => { copyEmbedCode(form); setActiveMenu(null) }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            <Code className="w-4 h-4" />
                            Copiar Embed
                          </button>
                          <button
                            onClick={() => { duplicateForm(form); setActiveMenu(null) }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            <Copy className="w-4 h-4" />
                            Duplicar
                          </button>
                          <hr className="my-1 border-gray-100" />
                          <button
                            onClick={() => { deleteForm(form.id); setActiveMenu(null) }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                            Deletar
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Form name + description */}
                <Link href={`/popup-editor/${form.id}`} className="block">
                  <h3 className="text-base font-semibold text-gray-900 mb-1 group-hover:text-primary-600 transition-colors">
                    {form.name}
                  </h3>
                  {form.description && (
                    <p className="text-sm text-gray-500 line-clamp-2 mb-3">{form.description}</p>
                  )}
                </Link>

                {/* Embed copied feedback */}
                {copiedEmbed === form.id && (
                  <div className="flex items-center gap-1.5 text-xs text-green-600 mb-2">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Codigo de embed copiado!
                  </div>
                )}

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-gray-100">
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase font-medium">Views</p>
                    <p className="text-lg font-bold text-gray-900">{form.views_count}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase font-medium">Leads</p>
                    <p className="text-lg font-bold text-primary-600">{form.submissions_count}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase font-medium">Conversao</p>
                    <p className="text-lg font-bold text-green-600">{conversionRate(form).toFixed(1)}%</p>
                  </div>
                </div>

                {/* Integration badges */}
                <div className="flex items-center gap-2 mt-3">
                  {form.pipeline && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                      <Zap className="w-3 h-3" />
                      {form.pipeline.name}
                    </span>
                  )}
                  {form.facebook_pixel_id && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600">
                      FB Pixel
                    </span>
                  )}
                  {form.google_ads_id && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-600">
                      Google Ads
                    </span>
                  )}
                </div>

                {/* Quick toggle */}
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-xs text-gray-400">
                    {new Date(form.updated_at).toLocaleDateString('pt-BR')}
                  </span>
                  <button
                    onClick={() => toggleStatus(form)}
                    disabled={togglingStatus === form.id}
                    className={`text-xs font-medium px-2.5 py-1 rounded-lg transition-colors ${
                      form.status === 'published'
                        ? 'bg-green-50 text-green-600 hover:bg-green-100'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {togglingStatus === form.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : form.status === 'published' ? 'Ativo' : 'Inativo'}
                  </button>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Create Form Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowCreateModal(false)} />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-white rounded-2xl border border-gray-200 p-6 w-full max-w-lg shadow-2xl"
            >
              <button onClick={() => setShowCreateModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Criar Formulario</h3>
              <p className="text-sm text-gray-500 mb-5">Escolha o tipo e configure seu formulario</p>

              <div className="space-y-4">
                {/* Form Type Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Formulario</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: 'popup', label: 'Popup', icon: MessageSquare, desc: 'Janela sobreposta' },
                      { value: 'flyout', label: 'Flyout', icon: MousePointer, desc: 'Lateral deslizante' },
                      { value: 'fullscreen', label: 'Tela Cheia', icon: Maximize, desc: 'Ocupa toda a tela' },
                      { value: 'bar', label: 'Barra', icon: Minus, desc: 'Barra superior/inferior' },
                      { value: 'embedded', label: 'Incorporado', icon: Code, desc: 'Dentro da pagina' },
                      { value: 'landing', label: 'Landing Page', icon: Globe, desc: 'Pagina dedicada' },
                    ].map((t) => {
                      const Icon = t.icon
                      return (
                        <button
                          key={t.value}
                          onClick={() => setNewFormType(t.value)}
                          className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-center ${
                            newFormType === t.value
                              ? 'border-primary-500 bg-primary-50 text-primary-700'
                              : 'border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          <Icon className="w-5 h-5" />
                          <span className="text-xs font-semibold">{t.label}</span>
                          <span className="text-[10px] text-gray-400">{t.desc}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Template Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Começar com template</label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(POPUP_TEMPLATES).map(([key, tmpl]) => (
                      <button key={key} onClick={() => { setSelectedTemplate(key); if (!newFormName && key !== 'blank') setNewFormName(tmpl.name) }}
                        className={`relative text-left p-3 rounded-xl border-2 transition-all ${selectedTemplate === key ? 'border-zinc-900 bg-gray-50' : 'border-gray-200 hover:border-gray-300'}`}>
                        {tmpl.recommended && (
                          <span className="absolute top-2 right-2 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 rounded">Recomendado</span>
                        )}
                        <p className="text-sm font-semibold text-gray-900 pr-16">{tmpl.name}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">{tmpl.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome do Formulario</label>
                  <input
                    type="text"
                    value={newFormName}
                    onChange={(e) => setNewFormName(e.target.value)}
                    placeholder="Ex: Popup de Desconto 10%"
                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-primary-500"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Descricao (opcional)</label>
                  <textarea
                    value={newFormDescription}
                    onChange={(e) => setNewFormDescription(e.target.value)}
                    placeholder="Descreva o objetivo do formulario..."
                    rows={2}
                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-primary-500 resize-none"
                  />
                </div>
                <button
                  onClick={createForm}
                  disabled={!newFormName.trim() || creating || !currentStore?.id}
                  title={!currentStore?.id ? 'Aguardando loja carregar...' : ''}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-primary-500 hover:bg-primary-600 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl font-medium transition-colors"
                >
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {creating ? 'Criando...' : !currentStore?.id ? 'Aguardando loja...' : 'Criar Formulario'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
