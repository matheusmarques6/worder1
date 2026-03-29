'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '@/stores'
import { ArrowLeft, ArrowRight, Check, Loader2, Send, Calendar, Users, FileText, Clock, Tag, Upload, MessageSquare, Sparkles, RefreshCw, BookUser, AlertCircle } from 'lucide-react'
import { useWhatsAppConnection } from '@/hooks/useWhatsAppConnection'
import { WhatsAppConnectionRequired, WhatsAppConnectionLoading, WhatsAppConnectionBanner } from '@/components/whatsapp/WhatsAppConnectionRequired'

interface Template { id: string; name: string; category: string; body_text: string; body_variables: number; buttons: any[] }
interface Phonebook { id: string; name: string; description?: string; contact_count: number }
interface WizardState {
  name: string; description: string; type: 'broadcast' | 'automated'
  audienceType: 'all' | 'tags' | 'import' | 'phonebook'; selectedTags: string[]; selectedPhonebookId: string
  templateId: string; template: Template | null
  templateVariables: Record<string, { type: 'field' | 'static'; value: string }>
  sendNow: boolean; scheduledDate: string; scheduledTime: string
}

const steps = [
  { id: 1, title: 'Detalhes', icon: FileText },
  { id: 2, title: 'Audiência', icon: Users },
  { id: 3, title: 'Mensagem', icon: MessageSquare },
  { id: 4, title: 'Agendar', icon: Calendar },
]
const availableTags = ['Cliente VIP', 'Lead Quente', 'Comprou 2024', 'Newsletter', 'Abandonou Carrinho', 'Novo Cliente']

export default function NewCampaignPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const organizationId = user?.organization_id || ''
  
  // Verificar conexão do WhatsApp
  const { connected, loading: connectionLoading, config } = useWhatsAppConnection(organizationId)
  
  const [currentStep, setCurrentStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [templates, setTemplates] = useState<Template[]>([])
  const [phonebooks, setPhonebooks] = useState<Phonebook[]>([])
  const [audienceCount, setAudienceCount] = useState(0)
  const [syncError, setSyncError] = useState('')
  
  const [state, setState] = useState<WizardState>({
    name: '', description: '', type: 'broadcast', audienceType: 'all', selectedTags: [], selectedPhonebookId: '',
    templateId: '', template: null, templateVariables: {},
    sendNow: true, scheduledDate: '', scheduledTime: '10:00',
  })

  useEffect(() => {
    if (connected) {
      fetch('/api/whatsapp/templates?status=approved').then(r => r.json()).then(d => setTemplates(d.templates || []))
      fetch('/api/whatsapp/phonebooks').then(r => r.json()).then(d => setPhonebooks(d.phonebooks || []))
    }
  }, [connected])

  useEffect(() => {
    if (state.audienceType === 'all') setAudienceCount(5234)
    else if (state.audienceType === 'tags' && state.selectedTags.length > 0) setAudienceCount(Math.floor(Math.random() * 2000) + 500)
    else if (state.audienceType === 'phonebook' && state.selectedPhonebookId) {
      const pb = phonebooks.find(p => p.id === state.selectedPhonebookId)
      setAudienceCount(pb?.contact_count || 0)
    }
    else setAudienceCount(0)
  }, [state.audienceType, state.selectedTags, state.selectedPhonebookId, phonebooks])

  useEffect(() => {
    if (state.template && state.template.body_variables > 0) {
      const vars: Record<string, { type: 'field' | 'static'; value: string }> = {}
      for (let i = 1; i <= state.template.body_variables; i++) vars[i.toString()] = { type: 'field', value: i === 1 ? 'name' : '' }
      setState(prev => ({ ...prev, templateVariables: vars }))
    }
  }, [state.template])

  const updateState = (u: Partial<WizardState>) => setState(prev => ({ ...prev, ...u }))
  const selectTemplate = (t: Template) => updateState({ templateId: t.id, template: t })
  const toggleTag = (tag: string) => setState(prev => ({ ...prev, selectedTags: prev.selectedTags.includes(tag) ? prev.selectedTags.filter(t => t !== tag) : [...prev.selectedTags, tag] }))

  const canProceed = () => {
    if (currentStep === 1) return state.name.trim().length > 0
    if (currentStep === 2) return state.audienceType === 'all' || state.selectedTags.length > 0 || (state.audienceType === 'phonebook' && state.selectedPhonebookId)
    if (currentStep === 3) return state.templateId !== ''
    if (currentStep === 4) return state.sendNow || (state.scheduledDate !== '' && state.scheduledTime !== '')
    return false
  }

  const handleSubmit = async () => {
    setIsLoading(true)
    try {
      const scheduled_at = state.sendNow ? null : new Date(`${state.scheduledDate}T${state.scheduledTime}`).toISOString()
      const res = await fetch('/api/whatsapp/campaigns', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          organizationId, name: state.name, description: state.description,
          type: state.type, template_id: state.templateId, template_name: state.template?.name,
          template_variables: state.templateVariables, audience_type: state.audienceType,
          audience_tags: state.selectedTags, 
          audience_phonebook_id: state.audienceType === 'phonebook' ? state.selectedPhonebookId : null,
          scheduled_at 
        })
      })
      const data = await res.json()
      if (res.ok && data.campaign && state.sendNow) await fetch(`/api/whatsapp/campaigns/${data.campaign.id}/send`, { method: 'POST' })
      router.push('/whatsapp/campaigns')
    } catch (e) { console.error(e) } finally { setIsLoading(false) }
  }

  const renderPreview = () => {
    if (!state.template) return null
    let text = state.template.body_text
    Object.entries(state.templateVariables).forEach(([k, c]) => {
      const v = c.type === 'field' ? (c.value === 'name' ? 'João' : c.value === 'email' ? 'joao@email.com' : `{{${k}}}`) : c.value || `{{${k}}}`
      text = text.replace(`{{${k}}}`, v)
    })
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-4 max-w-[300px]">
        <p className="text-sm text-gray-800 whitespace-pre-wrap">{text}</p>
        {state.template.buttons?.length > 0 && <div className="mt-3 space-y-2">{state.template.buttons.map((b: any, i: number) => <button key={i} className="w-full py-2 bg-gray-100 text-brand-600 text-sm rounded-lg">{b.text}</button>)}</div>}
      </div>
    )
  }

  const costPerMessage = 0.05
  const estimatedCost = audienceCount * costPerMessage

  // Verificar se está carregando a conexão
  if (connectionLoading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => router.back()} className="p-2 hover:bg-white rounded-lg"><ArrowLeft className="w-5 h-5 text-gray-500" /></button>
          <div><h1 className="text-2xl font-bold text-gray-900">Nova Campanha</h1><p className="text-gray-500 mt-1">Configure e envie sua campanha de WhatsApp</p></div>
        </div>
        <WhatsAppConnectionLoading />
      </div>
    )
  }

  // Se não estiver conectado, mostrar tela de conexão necessária
  if (!connected) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => router.back()} className="p-2 hover:bg-white rounded-lg"><ArrowLeft className="w-5 h-5 text-gray-500" /></button>
          <div><h1 className="text-2xl font-bold text-gray-900">Nova Campanha</h1><p className="text-gray-500 mt-1">Configure e envie sua campanha de WhatsApp</p></div>
        </div>
        <WhatsAppConnectionRequired 
          title="Conecte o WhatsApp para criar campanhas"
          description="Para criar e enviar campanhas, você precisa conectar sua conta do WhatsApp Business API."
        />
      </div>
    )
  }

  // Função de sincronização com tratamento de erro
  const handleSyncTemplates = async () => {
    setIsLoading(true)
    setSyncError('')
    try {
      const res = await fetch('/api/whatsapp/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync' })
      })
      const data = await res.json()
      if (res.ok) {
        alert(`✅ ${data.message}`)
        const tRes = await fetch('/api/whatsapp/templates?status=approved')
        const tData = await tRes.json()
        setTemplates(tData.templates || [])
      } else {
        setSyncError(data.error || 'Erro ao sincronizar')
        if (data.error?.includes('token') || data.error?.includes('Token') || data.error?.includes('permission')) {
          alert(`❌ Erro de autenticação. Verifique se o WhatsApp está corretamente conectado nas Integrações.`)
        } else {
          alert(`❌ ${data.error}`)
        }
      }
    } catch (e) { 
      console.error(e)
      setSyncError('Erro de conexão')
    }
    setIsLoading(false)
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => router.back()} className="p-2 hover:bg-white rounded-lg"><ArrowLeft className="w-5 h-5 text-gray-500" /></button>
        <div><h1 className="text-2xl font-bold text-gray-900">Nova Campanha</h1><p className="text-gray-500 mt-1">Configure e envie sua campanha de WhatsApp</p></div>
      </div>

      <div className="flex items-center justify-between mb-8 px-4">
        {steps.map((step, i) => {
          const Icon = step.icon, isActive = currentStep === step.id, isCompleted = currentStep > step.id
          return (
            <div key={step.id} className="flex items-center">
              <div className={`flex items-center gap-3 ${isActive || isCompleted ? 'opacity-100' : 'opacity-50'}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isCompleted ? 'bg-green-500' : isActive ? 'bg-primary-500' : 'bg-gray-100'}`}>
                  {isCompleted ? <Check className="w-5 h-5 text-white" /> : <Icon className="w-5 h-5 text-white" />}
                </div>
                <span className={`text-sm font-medium ${isActive ? 'text-gray-900' : 'text-gray-500'}`}>{step.title}</span>
              </div>
              {i < steps.length - 1 && <div className={`w-16 lg:w-24 h-0.5 mx-4 ${isCompleted ? 'bg-green-500' : 'bg-gray-100'}`} />}
            </div>
          )
        })}
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 lg:p-8">
        <AnimatePresence mode="wait">
          {currentStep === 1 && (
            <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Detalhes da Campanha</h2>
              <div className="space-y-4">
                <div><label className="block text-sm font-medium text-gray-600 mb-2">Nome *</label>
                  <input type="text" value={state.name} onChange={(e) => updateState({ name: e.target.value })} placeholder="Ex: Black Friday 2024" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-dark-400 focus:outline-none focus:border-brand-400" /></div>
                <div><label className="block text-sm font-medium text-gray-600 mb-2">Descrição</label>
                  <textarea value={state.description} onChange={(e) => updateState({ description: e.target.value })} placeholder="Objetivo da campanha..." rows={3} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-dark-400 focus:outline-none focus:border-brand-400 resize-none" /></div>
                <div><label className="block text-sm font-medium text-gray-600 mb-3">Tipo</label>
                  <div className="grid grid-cols-2 gap-4">
                    <button onClick={() => updateState({ type: 'broadcast' })} className={`p-4 rounded-xl border-2 text-left ${state.type === 'broadcast' ? 'border-primary-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <Send className={`w-6 h-6 mb-2 ${state.type === 'broadcast' ? 'text-brand-600' : 'text-gray-500'}`} /><p className="font-medium text-gray-900">Broadcast</p><p className="text-xs text-gray-500 mt-1">Envio único</p></button>
                    <button onClick={() => updateState({ type: 'automated' })} className={`p-4 rounded-xl border-2 text-left ${state.type === 'automated' ? 'border-primary-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <Sparkles className={`w-6 h-6 mb-2 ${state.type === 'automated' ? 'text-brand-600' : 'text-gray-500'}`} /><p className="font-medium text-gray-900">Automatizada</p><p className="text-xs text-gray-500 mt-1">Por gatilho</p></button>
                  </div></div>
              </div>
            </motion.div>
          )}

          {currentStep === 2 && (
            <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Selecione a Audiência</h2>
              <div className="space-y-4">
                <button onClick={() => updateState({ audienceType: 'all', selectedTags: [], selectedPhonebookId: '' })} className={`w-full p-4 rounded-xl border-2 text-left ${state.audienceType === 'all' ? 'border-primary-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className="flex items-center justify-between"><div className="flex items-center gap-3"><Users className={`w-5 h-5 ${state.audienceType === 'all' ? 'text-brand-600' : 'text-gray-500'}`} /><div><p className="font-medium text-gray-900">Todos os contatos</p><p className="text-xs text-gray-500">Enviar para toda a base de contatos</p></div></div><span className="text-sm text-gray-500">~5.234</span></div></button>
                
                <button onClick={() => updateState({ audienceType: 'tags', selectedPhonebookId: '' })} className={`w-full p-4 rounded-xl border-2 text-left ${state.audienceType === 'tags' ? 'border-primary-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className="flex items-center gap-3"><Tag className={`w-5 h-5 ${state.audienceType === 'tags' ? 'text-brand-600' : 'text-gray-500'}`} /><div><p className="font-medium text-gray-900">Filtrar por tags</p><p className="text-xs text-gray-500">Selecione tags específicas</p></div></div></button>
                {state.audienceType === 'tags' && <div className="ml-8 p-4 bg-gray-50 rounded-xl"><p className="text-sm text-gray-600 mb-3">Selecione:</p><div className="flex flex-wrap gap-2">{availableTags.map(t => <button key={t} onClick={() => toggleTag(t)} className={`px-3 py-1.5 rounded-lg text-sm ${state.selectedTags.includes(t) ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{t}</button>)}</div></div>}
                
                <button onClick={() => updateState({ audienceType: 'phonebook', selectedTags: [] })} className={`w-full p-4 rounded-xl border-2 text-left ${state.audienceType === 'phonebook' ? 'border-primary-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className="flex items-center gap-3"><BookUser className={`w-5 h-5 ${state.audienceType === 'phonebook' ? 'text-brand-600' : 'text-gray-500'}`} /><div><p className="font-medium text-gray-900">Lista de contatos (Phonebook)</p><p className="text-xs text-gray-500">Usar uma lista importada</p></div></div></button>
                {state.audienceType === 'phonebook' && (
                  <div className="ml-8 p-4 bg-gray-50 rounded-xl">
                    <p className="text-sm text-gray-600 mb-3">Selecione uma lista:</p>
                    {phonebooks.length === 0 ? (
                      <div className="text-center py-4">
                        <p className="text-sm text-gray-500 mb-2">Nenhuma lista encontrada</p>
                        <button onClick={() => router.push('/whatsapp/phonebooks')} className="text-brand-600 text-sm hover:underline">Criar lista →</button>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {phonebooks.map(pb => (
                          <button key={pb.id} onClick={() => updateState({ selectedPhonebookId: pb.id })} 
                            className={`w-full p-3 rounded-lg text-left flex items-center justify-between ${state.selectedPhonebookId === pb.id ? 'bg-brand-100 border border-brand-300' : 'bg-gray-100 hover:bg-gray-100'}`}>
                            <div className="flex items-center gap-3">
                              <BookUser className="w-4 h-4 text-gray-500" />
                              <span className="text-gray-700 text-sm">{pb.name}</span>
                            </div>
                            <span className="text-xs text-gray-500">{pb.contact_count} contatos</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                
                <button onClick={() => updateState({ audienceType: 'import', selectedTags: [], selectedPhonebookId: '' })} className={`w-full p-4 rounded-xl border-2 text-left ${state.audienceType === 'import' ? 'border-primary-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className="flex items-center gap-3"><Upload className={`w-5 h-5 ${state.audienceType === 'import' ? 'text-brand-600' : 'text-gray-500'}`} /><div><p className="font-medium text-gray-900">Importar CSV</p><p className="text-xs text-gray-500">Carregar arquivo para esta campanha</p></div></div></button>
              </div>
              {audienceCount > 0 && <div className="mt-6 p-4 bg-brand-50 border border-primary-500/20 rounded-xl"><div className="flex items-center gap-2"><Users className="w-5 h-5 text-brand-600" /><span className="text-white font-medium">{audienceCount.toLocaleString()} contatos</span></div></div>}
            </motion.div>
          )}

          {currentStep === 3 && (
            <motion.div key="s3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">Selecione o Template</h2>
                <button 
                  onClick={handleSyncTemplates}
                  disabled={isLoading}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm rounded-lg transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                  Sincronizar da Meta
                </button>
              </div>
              
              {/* Erro de sincronização */}
              {syncError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400" />
                  <span className="text-sm text-red-300">{syncError}</span>
                </div>
              )}
              
              <div className="grid lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <p className="text-sm text-gray-500">Templates aprovados ({templates.length}):</p>
                  {templates.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-gray-500 border border-dashed border-gray-200 rounded-xl">
                      <FileText className="w-12 h-12 mb-3 opacity-30" />
                      <p className="text-sm mb-2">Nenhum template encontrado</p>
                      <p className="text-xs text-gray-400">Clique em "Sincronizar da Meta" para importar</p>
                    </div>
                  ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                    {templates.map(t => (
                      <button key={t.id} onClick={() => selectTemplate(t)} className={`w-full p-4 rounded-xl border-2 text-left ${state.templateId === t.id ? 'border-primary-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}>
                        <div className="flex items-start justify-between"><div><p className="font-medium text-white">{t.name}</p><span className={`inline-block mt-1 px-2 py-0.5 text-[10px] rounded ${t.category === 'MARKETING' ? 'bg-purple-500/10 text-purple-400' : 'bg-blue-500/10 text-blue-400'}`}>{t.category}</span></div>{state.templateId === t.id && <Check className="w-5 h-5 text-brand-600" />}</div>
                        <p className="text-xs text-gray-500 mt-2 line-clamp-2">{t.body_text}</p>
                      </button>
                    ))}
                  </div>
                  )}
                </div>
                <div><p className="text-sm text-gray-500 mb-4">Preview:</p>{state.template ? <div className="space-y-4">{renderPreview()}
                  {state.template.body_variables > 0 && <div className="mt-4 p-4 bg-gray-50 rounded-xl"><p className="text-sm font-medium text-gray-600 mb-3">Variáveis:</p><div className="space-y-3">
                    {Object.keys(state.templateVariables).map(k => (
                      <div key={k} className="flex items-center gap-2"><span className="text-sm text-gray-500 w-12">{`{{${k}}}`}</span>
                        <select value={state.templateVariables[k]?.type || 'field'} onChange={(e) => { const nv = { ...state.templateVariables }; nv[k] = { ...nv[k], type: e.target.value as any }; updateState({ templateVariables: nv }) }} className="px-2 py-1 bg-gray-100 border border-gray-300 rounded text-sm text-gray-700"><option value="field">Campo</option><option value="static">Fixo</option></select>
                        {state.templateVariables[k]?.type === 'field' ? <select value={state.templateVariables[k]?.value || ''} onChange={(e) => { const nv = { ...state.templateVariables }; nv[k] = { ...nv[k], value: e.target.value }; updateState({ templateVariables: nv }) }} className="flex-1 px-2 py-1 bg-gray-100 border border-gray-300 rounded text-sm text-gray-700"><option value="">Selecione...</option><option value="name">Nome</option><option value="phone">Telefone</option><option value="email">Email</option></select>
                        : <input type="text" value={state.templateVariables[k]?.value || ''} onChange={(e) => { const nv = { ...state.templateVariables }; nv[k] = { ...nv[k], value: e.target.value }; updateState({ templateVariables: nv }) }} placeholder="Valor..." className="flex-1 px-2 py-1 bg-gray-100 border border-gray-300 rounded text-sm text-gray-700 placeholder-dark-400" />}
                      </div>
                    ))}
                  </div></div>}
                </div> : <div className="flex flex-col items-center justify-center h-48 text-gray-500"><MessageSquare className="w-12 h-12 mb-3 opacity-30" /><p className="text-sm">Selecione um template</p></div>}</div>
              </div>
            </motion.div>
          )}

          {currentStep === 4 && (
            <motion.div key="s4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Agendar Envio</h2>
              <div className="space-y-4">
                <button onClick={() => updateState({ sendNow: true })} className={`w-full p-4 rounded-xl border-2 text-left ${state.sendNow ? 'border-primary-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className="flex items-center gap-3"><Send className={`w-5 h-5 ${state.sendNow ? 'text-brand-600' : 'text-gray-500'}`} /><div><p className="font-medium text-gray-900">Enviar agora</p><p className="text-xs text-gray-500">Imediatamente</p></div></div></button>
                <button onClick={() => updateState({ sendNow: false })} className={`w-full p-4 rounded-xl border-2 text-left ${!state.sendNow ? 'border-primary-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className="flex items-center gap-3"><Calendar className={`w-5 h-5 ${!state.sendNow ? 'text-brand-600' : 'text-gray-500'}`} /><div><p className="font-medium text-gray-900">Agendar</p><p className="text-xs text-gray-500">Data e hora específicas</p></div></div></button>
                {!state.sendNow && <div className="ml-8 p-4 bg-gray-50 rounded-xl"><div className="grid grid-cols-2 gap-4"><div><label className="block text-sm text-gray-500 mb-2">Data</label><input type="date" value={state.scheduledDate} onChange={(e) => updateState({ scheduledDate: e.target.value })} min={new Date().toISOString().split('T')[0]} className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900" /></div><div><label className="block text-sm text-gray-500 mb-2">Hora</label><input type="time" value={state.scheduledTime} onChange={(e) => updateState({ scheduledTime: e.target.value })} className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900" /></div></div></div>}
              </div>
              <div className="mt-8 p-6 bg-gradient-to-br from-primary-500/10 to-yellow-500/10 border border-primary-500/20 rounded-xl">
                <h3 className="font-semibold text-gray-900 mb-4">Resumo</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Nome:</span><span className="text-gray-900 font-medium">{state.name}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Audiência:</span><span className="text-gray-900">{audienceCount.toLocaleString()} contatos</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Template:</span><span className="text-gray-900">{state.template?.name || '-'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Envio:</span><span className="text-gray-900">{state.sendNow ? 'Agora' : `${state.scheduledDate} ${state.scheduledTime}`}</span></div>
                  <div className="border-t border-gray-200 pt-3 mt-3"><div className="flex justify-between"><span className="text-gray-500">Custo estimado:</span><span className="text-brand-600 font-semibold">~R$ {estimatedCost.toFixed(2)}</span></div></div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200">
          <button onClick={() => currentStep > 1 && setCurrentStep(p => p - 1)} disabled={currentStep === 1} className="flex items-center gap-2 px-4 py-2 text-gray-500 hover:text-white disabled:opacity-30"><ArrowLeft className="w-4 h-4" /> Voltar</button>
          <div className="flex items-center gap-3">
            {currentStep < 4 ? (
              <button onClick={() => canProceed() && setCurrentStep(p => p + 1)} disabled={!canProceed()} className="flex items-center gap-2 px-6 py-2.5 bg-primary-500 text-white rounded-xl hover:bg-primary-600 disabled:opacity-50 font-medium">Próximo <ArrowRight className="w-4 h-4" /></button>
            ) : (
              <button onClick={handleSubmit} disabled={!canProceed() || isLoading} className="flex items-center gap-2 px-6 py-2.5 bg-primary-500 text-white rounded-xl hover:bg-primary-600 disabled:opacity-50 font-medium">{isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}{state.sendNow ? 'Enviar' : 'Agendar'}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
