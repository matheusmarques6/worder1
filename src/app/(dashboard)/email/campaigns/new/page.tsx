'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, Send, Clock, Loader2 } from 'lucide-react'

const steps = ['Detalhes', 'Destinatários', 'Conteúdo', 'Revisar']

export default function NewCampaignPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    subject: '',
    preview_text: '',
    sender_name: '',
    sender_email: '',
    template_id: '',
    segment_id: '',
    reply_to: '',
  })
  const [templates, setTemplates] = useState<any[]>([])
  const [segments, setSegments] = useState<any[]>([])
  const [contactCount, setContactCount] = useState<number | null>(null)

  // Load templates and segments when reaching those steps
  useState(() => {
    fetch('/api/email/templates').then(r => r.json()).then(d => setTemplates(d.templates || [])).catch(() => {})
    fetch('/api/segments').then(r => r.json()).then(d => setSegments(d.segments || [])).catch(() => {})
    fetch('/api/contacts/stats').then(r => r.json()).then(d => setContactCount(d.total || 0)).catch(() => {})
  })

  const handleCreate = async (sendNow: boolean) => {
    setSaving(true)
    try {
      const res = await fetch('/api/email/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (data.success && sendNow && data.campaign?.id) {
        await fetch('/api/email/campaigns/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaignId: data.campaign.id }),
        })
      }
      router.push('/email/campaigns')
    } catch (err) { console.error(err) }
    finally { setSaving(false) }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="text-2xl font-bold text-gray-900">Nova Campanha</h1>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-2 flex-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-brand-500 text-white' : 'bg-gray-200 text-gray-500'
            }`}>
              {i < step ? <Check className="w-4 h-4" /> : i + 1}
            </div>
            <span className={`text-sm ${i === step ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>{s}</span>
            {i < steps.length - 1 && <div className="flex-1 h-px bg-gray-200" />}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome da campanha</label>
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none" placeholder="Ex: Promoção de Verão" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Assunto do email</label>
              <input value={form.subject} onChange={e => setForm({...form, subject: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none" placeholder="Ex: 🔥 50% OFF só hoje!" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Texto de preview</label>
              <input value={form.preview_text} onChange={e => setForm({...form, preview_text: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none" placeholder="Texto que aparece na prévia do email" />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">Escolha quem vai receber esta campanha</p>
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                <input type="radio" name="audience" checked={!form.segment_id} onChange={() => setForm({...form, segment_id: ''})} className="text-brand-500" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Todos os contatos inscritos</p>
                  <p className="text-xs text-gray-500">{contactCount !== null ? `${contactCount} contatos` : 'Carregando...'}</p>
                </div>
              </label>
              {segments.map((seg: any) => (
                <label key={seg.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                  <input type="radio" name="audience" checked={form.segment_id === seg.id} onChange={() => setForm({...form, segment_id: seg.id})} className="text-brand-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{seg.name}</p>
                    <p className="text-xs text-gray-500">{seg.description || `${seg.conditions?.length || 0} condições`}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Template</label>
              <select value={form.template_id} onChange={e => setForm({...form, template_id: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none">
                <option value="">Selecione um template...</option>
                {templates.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome do remetente</label>
                <input value={form.sender_name} onChange={e => setForm({...form, sender_name: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none" placeholder="Minha Loja" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email do remetente</label>
                <input value={form.sender_email} onChange={e => setForm({...form, sender_email: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none" placeholder="contato@minhaloja.com" />
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Resumo da Campanha</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">Nome:</span> <span className="text-gray-900 font-medium ml-2">{form.name || '-'}</span></div>
              <div><span className="text-gray-500">Assunto:</span> <span className="text-gray-900 font-medium ml-2">{form.subject || '-'}</span></div>
              <div><span className="text-gray-500">Remetente:</span> <span className="text-gray-900 font-medium ml-2">{form.sender_name || '-'}</span></div>
              <div><span className="text-gray-500">Email:</span> <span className="text-gray-900 font-medium ml-2">{form.sender_email || '-'}</span></div>
              <div><span className="text-gray-500">Template:</span> <span className="text-gray-900 font-medium ml-2">{templates.find(t => t.id === form.template_id)?.name || 'Não selecionado'}</span></div>
              <div><span className="text-gray-500">Destinatários:</span> <span className="text-gray-900 font-medium ml-2">{form.segment_id ? segments.find(s => s.id === form.segment_id)?.name : 'Todos os contatos'}</span></div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button onClick={() => step > 0 ? setStep(step - 1) : router.back()} className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
          <ArrowLeft className="w-4 h-4" />
          {step === 0 ? 'Cancelar' : 'Voltar'}
        </button>
        {step < 3 ? (
          <button onClick={() => setStep(step + 1)} disabled={step === 0 && !form.name} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 disabled:opacity-50">
            Próximo <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button onClick={() => handleCreate(false)} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
              <Clock className="w-4 h-4" /> Salvar Rascunho
            </button>
            <button onClick={() => { if (confirm('Enviar campanha agora?')) handleCreate(true) }} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Enviar Agora
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
