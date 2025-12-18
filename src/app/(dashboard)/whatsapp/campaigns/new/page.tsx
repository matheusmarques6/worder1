'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, Loader2, Send, Calendar, Users, FileText, Clock, Tag, Upload, MessageSquare, Sparkles } from 'lucide-react'

interface Template { id: string; name: string; category: string; body_text: string; body_variables: number; buttons: any[] }
interface WizardState {
  name: string; description: string; type: 'broadcast' | 'automated'
  audienceType: 'all' | 'tags' | 'import'; selectedTags: string[]
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
  const [currentStep, setCurrentStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [templates, setTemplates] = useState<Template[]>([])
  const [audienceCount, setAudienceCount] = useState(0)
  
  const [state, setState] = useState<WizardState>({
    name: '', description: '', type: 'broadcast', audienceType: 'all', selectedTags: [],
    templateId: '', template: null, templateVariables: {},
    sendNow: true, scheduledDate: '', scheduledTime: '10:00',
  })

  useEffect(() => {
    fetch('/api/whatsapp/templates?status=approved').then(r => r.json()).then(d => setTemplates(d.templates || []))
  }, [])

  useEffect(() => {
    if (state.audienceType === 'all') setAudienceCount(5234)
    else if (state.audienceType === 'tags' && state.selectedTags.length > 0) setAudienceCount(Math.floor(Math.random() * 2000) + 500)
    else setAudienceCount(0)
  }, [state.audienceType, state.selectedTags])

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
    if (currentStep === 2) return state.audienceType === 'all' || state.selectedTags.length > 0
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
        body: JSON.stringify({ organizationId: 'org-placeholder', name: state.name, description: state.description,
          type: state.type, template_id: state.templateId, template_name: state.template?.name,
          template_variables: state.templateVariables, audience_type: state.audienceType,
          audience_tags: state.selectedTags, scheduled_at })
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
      <div className="bg-dark-800 border border-dark-700/50 rounded-2xl p-4 max-w-[300px]">
        <p className="text-sm text-dark-100 whitespace-pre-wrap">{text}</p>
        {state.template.buttons?.length > 0 && <div className="mt-3 space-y-2">{state.template.buttons.map((b: any, i: number) => <button key={i} className="w-full py-2 bg-dark-700 text-primary-400 text-sm rounded-lg">{b.text}</button>)}</div>}
      </div>
    )
  }

  const costPerMessage = 0.05
  const estimatedCost = audienceCount * costPerMessage

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => router.back()} className="p-2 hover:bg-dark-800 rounded-lg"><ArrowLeft className="w-5 h-5 text-dark-400" /></button>
        <div><h1 className="text-2xl font-bold text-white">Nova Campanha</h1><p className="text-dark-400 mt-1">Configure e envie sua campanha de WhatsApp</p></div>
      </div>

      <div className="flex items-center justify-between mb-8 px-4">
        {steps.map((step, i) => {
          const Icon = step.icon, isActive = currentStep === step.id, isCompleted = currentStep > step.id
          return (
            <div key={step.id} className="flex items-center">
              <div className={`flex items-center gap-3 ${isActive || isCompleted ? 'opacity-100' : 'opacity-50'}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isCompleted ? 'bg-green-500' : isActive ? 'bg-primary-500' : 'bg-dark-700'}`}>
                  {isCompleted ? <Check className="w-5 h-5 text-white" /> : <Icon className="w-5 h-5 text-white" />}
                </div>
                <span className={`text-sm font-medium ${isActive ? 'text-white' : 'text-dark-400'}`}>{step.title}</span>
              </div>
              {i < steps.length - 1 && <div className={`w-16 lg:w-24 h-0.5 mx-4 ${isCompleted ? 'bg-green-500' : 'bg-dark-700'}`} />}
            </div>
          )
        })}
      </div>

      <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-6 lg:p-8">
        <AnimatePresence mode="wait">
          {currentStep === 1 && (
            <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <h2 className="text-xl font-semibold text-white mb-6">Detalhes da Campanha</h2>
              <div className="space-y-4">
                <div><label className="block text-sm font-medium text-dark-300 mb-2">Nome *</label>
                  <input type="text" value={state.name} onChange={(e) => updateState({ name: e.target.value })} placeholder="Ex: Black Friday 2024" className="w-full px-4 py-3 bg-dark-800/50 border border-dark-700/50 rounded-xl text-white placeholder-dark-400 focus:outline-none focus:border-primary-500/50" /></div>
                <div><label className="block text-sm font-medium text-dark-300 mb-2">Descrição</label>
                  <textarea value={state.description} onChange={(e) => updateState({ description: e.target.value })} placeholder="Objetivo da campanha..." rows={3} className="w-full px-4 py-3 bg-dark-800/50 border border-dark-700/50 rounded-xl text-white placeholder-dark-400 focus:outline-none focus:border-primary-500/50 resize-none" /></div>
                <div><label className="block text-sm font-medium text-dark-300 mb-3">Tipo</label>
                  <div className="grid grid-cols-2 gap-4">
                    <button onClick={() => updateState({ type: 'broadcast' })} className={`p-4 rounded-xl border-2 text-left ${state.type === 'broadcast' ? 'border-primary-500 bg-primary-500/10' : 'border-dark-700 hover:border-dark-600'}`}>
                      <Send className={`w-6 h-6 mb-2 ${state.type === 'broadcast' ? 'text-primary-400' : 'text-dark-400'}`} /><p className="font-medium text-white">Broadcast</p><p className="text-xs text-dark-400 mt-1">Envio único</p></button>
                    <button onClick={() => updateState({ type: 'automated' })} className={`p-4 rounded-xl border-2 text-left ${state.type === 'automated' ? 'border-primary-500 bg-primary-500/10' : 'border-dark-700 hover:border-dark-600'}`}>
                      <Sparkles className={`w-6 h-6 mb-2 ${state.type === 'automated' ? 'text-primary-400' : 'text-dark-400'}`} /><p className="font-medium text-white">Automatizada</p><p className="text-xs text-dark-400 mt-1">Por gatilho</p></button>
                  </div></div>
              </div>
            </motion.div>
          )}

          {currentStep === 2 && (
            <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <h2 className="text-xl font-semibold text-white mb-6">Selecione a Audiência</h2>
              <div className="space-y-4">
                <button onClick={() => updateState({ audienceType: 'all', selectedTags: [] })} className={`w-full p-4 rounded-xl border-2 text-left ${state.audienceType === 'all' ? 'border-primary-500 bg-primary-500/10' : 'border-dark-700 hover:border-dark-600'}`}>
                  <div className="flex items-center justify-between"><div className="flex items-center gap-3"><Users className={`w-5 h-5 ${state.audienceType === 'all' ? 'text-primary-400' : 'text-dark-400'}`} /><div><p className="font-medium text-white">Todos os contatos</p><p className="text-xs text-dark-400">Enviar para toda a base</p></div></div><span className="text-sm text-dark-400">~5.234</span></div></button>
                <button onClick={() => updateState({ audienceType: 'tags' })} className={`w-full p-4 rounded-xl border-2 text-left ${state.audienceType === 'tags' ? 'border-primary-500 bg-primary-500/10' : 'border-dark-700 hover:border-dark-600'}`}>
                  <div className="flex items-center gap-3"><Tag className={`w-5 h-5 ${state.audienceType === 'tags' ? 'text-primary-400' : 'text-dark-400'}`} /><div><p className="font-medium text-white">Filtrar por tags</p><p className="text-xs text-dark-400">Selecione tags específicas</p></div></div></button>
                {state.audienceType === 'tags' && <div className="ml-8 p-4 bg-dark-800/50 rounded-xl"><p className="text-sm text-dark-300 mb-3">Selecione:</p><div className="flex flex-wrap gap-2">{availableTags.map(t => <button key={t} onClick={() => toggleTag(t)} className={`px-3 py-1.5 rounded-lg text-sm ${state.selectedTags.includes(t) ? 'bg-primary-500 text-white' : 'bg-dark-700 text-dark-300 hover:bg-dark-600'}`}>{t}</button>)}</div></div>}
                <button onClick={() => updateState({ audienceType: 'import' })} className={`w-full p-4 rounded-xl border-2 text-left ${state.audienceType === 'import' ? 'border-primary-500 bg-primary-500/10' : 'border-dark-700 hover:border-dark-600'}`}>
                  <div className="flex items-center gap-3"><Upload className={`w-5 h-5 ${state.audienceType === 'import' ? 'text-primary-400' : 'text-dark-400'}`} /><div><p className="font-medium text-white">Importar lista</p><p className="text-xs text-dark-400">Carregar CSV</p></div></div></button>
              </div>
              {audienceCount > 0 && <div className="mt-6 p-4 bg-primary-500/10 border border-primary-500/20 rounded-xl"><div className="flex items-center gap-2"><Users className="w-5 h-5 text-primary-400" /><span className="text-white font-medium">{audienceCount.toLocaleString()} contatos</span></div></div>}
            </motion.div>
          )}

          {currentStep === 3 && (
            <motion.div key="s3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <h2 className="text-xl font-semibold text-white mb-6">Selecione o Template</h2>
              <div className="grid lg:grid-cols-2 gap-6">
                <div className="space-y-4"><p className="text-sm text-dark-400">Templates aprovados:</p>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                    {templates.map(t => (
                      <button key={t.id} onClick={() => selectTemplate(t)} className={`w-full p-4 rounded-xl border-2 text-left ${state.templateId === t.id ? 'border-primary-500 bg-primary-500/10' : 'border-dark-700 hover:border-dark-600'}`}>
                        <div className="flex items-start justify-between"><div><p className="font-medium text-white">{t.name}</p><span className={`inline-block mt-1 px-2 py-0.5 text-[10px] rounded ${t.category === 'MARKETING' ? 'bg-purple-500/10 text-purple-400' : 'bg-blue-500/10 text-blue-400'}`}>{t.category}</span></div>{state.templateId === t.id && <Check className="w-5 h-5 text-primary-400" />}</div>
                        <p className="text-xs text-dark-400 mt-2 line-clamp-2">{t.body_text}</p>
                      </button>
                    ))}
                  </div></div>
                <div><p className="text-sm text-dark-400 mb-4">Preview:</p>{state.template ? <div className="space-y-4">{renderPreview()}
                  {state.template.body_variables > 0 && <div className="mt-4 p-4 bg-dark-800/50 rounded-xl"><p className="text-sm font-medium text-dark-300 mb-3">Variáveis:</p><div className="space-y-3">
                    {Object.keys(state.templateVariables).map(k => (
                      <div key={k} className="flex items-center gap-2"><span className="text-sm text-dark-400 w-12">{`{{${k}}}`}</span>
                        <select value={state.templateVariables[k]?.type || 'field'} onChange={(e) => { const nv = { ...state.templateVariables }; nv[k] = { ...nv[k], type: e.target.value as any }; updateState({ templateVariables: nv }) }} className="px-2 py-1 bg-dark-700 border border-dark-600 rounded text-sm text-white"><option value="field">Campo</option><option value="static">Fixo</option></select>
                        {state.templateVariables[k]?.type === 'field' ? <select value={state.templateVariables[k]?.value || ''} onChange={(e) => { const nv = { ...state.templateVariables }; nv[k] = { ...nv[k], value: e.target.value }; updateState({ templateVariables: nv }) }} className="flex-1 px-2 py-1 bg-dark-700 border border-dark-600 rounded text-sm text-white"><option value="">Selecione...</option><option value="name">Nome</option><option value="phone">Telefone</option><option value="email">Email</option></select>
                        : <input type="text" value={state.templateVariables[k]?.value || ''} onChange={(e) => { const nv = { ...state.templateVariables }; nv[k] = { ...nv[k], value: e.target.value }; updateState({ templateVariables: nv }) }} placeholder="Valor..." className="flex-1 px-2 py-1 bg-dark-700 border border-dark-600 rounded text-sm text-white placeholder-dark-400" />}
                      </div>
                    ))}
                  </div></div>}
                </div> : <div className="flex flex-col items-center justify-center h-48 text-dark-400"><MessageSquare className="w-12 h-12 mb-3 opacity-30" /><p className="text-sm">Selecione um template</p></div>}</div>
              </div>
            </motion.div>
          )}

          {currentStep === 4 && (
            <motion.div key="s4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <h2 className="text-xl font-semibold text-white mb-6">Agendar Envio</h2>
              <div className="space-y-4">
                <button onClick={() => updateState({ sendNow: true })} className={`w-full p-4 rounded-xl border-2 text-left ${state.sendNow ? 'border-primary-500 bg-primary-500/10' : 'border-dark-700 hover:border-dark-600'}`}>
                  <div className="flex items-center gap-3"><Send className={`w-5 h-5 ${state.sendNow ? 'text-primary-400' : 'text-dark-400'}`} /><div><p className="font-medium text-white">Enviar agora</p><p className="text-xs text-dark-400">Imediatamente</p></div></div></button>
                <button onClick={() => updateState({ sendNow: false })} className={`w-full p-4 rounded-xl border-2 text-left ${!state.sendNow ? 'border-primary-500 bg-primary-500/10' : 'border-dark-700 hover:border-dark-600'}`}>
                  <div className="flex items-center gap-3"><Calendar className={`w-5 h-5 ${!state.sendNow ? 'text-primary-400' : 'text-dark-400'}`} /><div><p className="font-medium text-white">Agendar</p><p className="text-xs text-dark-400">Data e hora específicas</p></div></div></button>
                {!state.sendNow && <div className="ml-8 p-4 bg-dark-800/50 rounded-xl"><div className="grid grid-cols-2 gap-4"><div><label className="block text-sm text-dark-400 mb-2">Data</label><input type="date" value={state.scheduledDate} onChange={(e) => updateState({ scheduledDate: e.target.value })} min={new Date().toISOString().split('T')[0]} className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white" /></div><div><label className="block text-sm text-dark-400 mb-2">Hora</label><input type="time" value={state.scheduledTime} onChange={(e) => updateState({ scheduledTime: e.target.value })} className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white" /></div></div></div>}
              </div>
              <div className="mt-8 p-6 bg-gradient-to-br from-primary-500/10 to-yellow-500/10 border border-primary-500/20 rounded-xl">
                <h3 className="font-semibold text-white mb-4">Resumo</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-dark-400">Nome:</span><span className="text-white font-medium">{state.name}</span></div>
                  <div className="flex justify-between"><span className="text-dark-400">Audiência:</span><span className="text-white">{audienceCount.toLocaleString()} contatos</span></div>
                  <div className="flex justify-between"><span className="text-dark-400">Template:</span><span className="text-white">{state.template?.name || '-'}</span></div>
                  <div className="flex justify-between"><span className="text-dark-400">Envio:</span><span className="text-white">{state.sendNow ? 'Agora' : `${state.scheduledDate} ${state.scheduledTime}`}</span></div>
                  <div className="border-t border-dark-700/50 pt-3 mt-3"><div className="flex justify-between"><span className="text-dark-400">Custo estimado:</span><span className="text-primary-400 font-semibold">~R$ {estimatedCost.toFixed(2)}</span></div></div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center justify-between mt-8 pt-6 border-t border-dark-700/50">
          <button onClick={() => currentStep > 1 && setCurrentStep(p => p - 1)} disabled={currentStep === 1} className="flex items-center gap-2 px-4 py-2 text-dark-400 hover:text-white disabled:opacity-30"><ArrowLeft className="w-4 h-4" /> Voltar</button>
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
