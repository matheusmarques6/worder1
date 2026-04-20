'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Save, Plus, Trash2, CheckCircle, AlertCircle, Mail, Globe } from 'lucide-react'
import { useAuthStore } from '@/stores'

interface Domain {
  id: string
  domain: string
  status: 'verified' | 'pending' | 'failed'
  spf: boolean
  dkim: boolean
  dmarc: boolean
  created_at: string
}

interface EmailSettings {
  default_sender_name: string
  default_sender_email: string
  default_reply_to: string
  footer_company_name: string
  footer_address: string
}

export default function EmailSettingsPage() {
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [domains, setDomains] = useState<Domain[]>([])
  const [newDomain, setNewDomain] = useState('')
  const [addingDomain, setAddingDomain] = useState(false)
  const [settings, setSettings] = useState<EmailSettings>({
    default_sender_name: '',
    default_sender_email: '',
    default_reply_to: '',
    footer_company_name: '',
    footer_address: '',
  })

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  useEffect(() => {
    async function load() {
      try {
        // Load email settings from organization
        const res = await fetch('/api/settings/organization')
        if (res.ok) {
          const data = await res.json()
          const org = data.organization || data
          setSettings({
            default_sender_name: org.default_sender_name || org.name || '',
            default_sender_email: org.default_sender_email || '',
            default_reply_to: org.default_reply_to || '',
            footer_company_name: org.footer_company_name || org.name || '',
            footer_address: org.footer_address || '',
          })
        }
      } catch (e) {
        console.error('Failed to load settings:', e)
      }

      try {
        // Load domains
        const dRes = await fetch('/api/email/domains')
        if (dRes.ok) {
          const dData = await dRes.json()
          setDomains(dData.domains || dData || [])
        }
      } catch (e) {
        console.error('Failed to load domains:', e)
      }

      setLoading(false)
    }
    load()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings/organization', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (res.ok) showToast('Configurações salvas')
      else showToast('Erro ao salvar', 'error')
    } catch { showToast('Erro ao salvar', 'error') }
    setSaving(false)
  }

  const handleAddDomain = async () => {
    if (!newDomain.trim()) return
    setAddingDomain(true)
    try {
      const res = await fetch('/api/email/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: newDomain.trim() }),
      })
      if (res.ok) {
        const data = await res.json()
        setDomains(prev => [...prev, data.domain || data])
        setNewDomain('')
        showToast('Domínio adicionado')
      } else showToast('Erro ao adicionar domínio', 'error')
    } catch { showToast('Erro', 'error') }
    setAddingDomain(false)
  }

  const handleDeleteDomain = async (id: string) => {
    if (!confirm('Remover este domínio?')) return
    try {
      await fetch(`/api/email/domains/${id}`, { method: 'DELETE' })
      setDomains(prev => prev.filter(d => d.id !== id))
      showToast('Domínio removido')
    } catch { showToast('Erro', 'error') }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-20 right-6 z-50 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium ${toast.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {toast.msg}
        </div>
      )}

      {/* Remetente Padrão */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Remetente Padrão</h2>
            <p className="text-sm text-gray-500 mt-0.5">Configurações padrão para envio de emails</p>
          </div>
          <button onClick={handleSave} disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar
          </button>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome do remetente</label>
              <input type="text" value={settings.default_sender_name}
                onChange={e => setSettings(s => ({ ...s, default_sender_name: e.target.value }))}
                placeholder="Sua Empresa"
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 focus:border-gray-400 focus:ring-1 focus:ring-gray-400/20 focus:outline-none transition-all" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email do remetente</label>
              <input type="email" value={settings.default_sender_email}
                onChange={e => setSettings(s => ({ ...s, default_sender_email: e.target.value }))}
                placeholder="contato@suaempresa.com"
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 focus:border-gray-400 focus:ring-1 focus:ring-gray-400/20 focus:outline-none transition-all" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Responder para</label>
            <input type="email" value={settings.default_reply_to}
              onChange={e => setSettings(s => ({ ...s, default_reply_to: e.target.value }))}
              placeholder="suporte@suaempresa.com"
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 focus:border-gray-400 focus:ring-1 focus:ring-gray-400/20 focus:outline-none transition-all" />
          </div>
          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome da empresa (rodapé)</label>
              <input type="text" value={settings.footer_company_name}
                onChange={e => setSettings(s => ({ ...s, footer_company_name: e.target.value }))}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 focus:border-gray-400 focus:ring-1 focus:ring-gray-400/20 focus:outline-none transition-all" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Endereço (rodapé)</label>
              <input type="text" value={settings.footer_address}
                onChange={e => setSettings(s => ({ ...s, footer_address: e.target.value }))}
                placeholder="Rua Example, 123 - Cidade/UF"
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 focus:border-gray-400 focus:ring-1 focus:ring-gray-400/20 focus:outline-none transition-all" />
            </div>
          </div>
        </div>
      </div>

      {/* Domínios de Envio */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-6 py-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Domínios de Envio</h2>
          <p className="text-sm text-gray-500 mt-0.5">Autentique seus domínios para melhorar a entregabilidade</p>
        </div>
        <div className="p-6">
          {/* Add domain */}
          <div className="flex gap-3 mb-5">
            <input type="text" value={newDomain} onChange={e => setNewDomain(e.target.value)}
              placeholder="Ex: suaempresa.com"
              onKeyDown={e => e.key === 'Enter' && handleAddDomain()}
              className="flex-1 px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 focus:border-gray-400 focus:ring-1 focus:ring-gray-400/20 focus:outline-none transition-all" />
            <button onClick={handleAddDomain} disabled={addingDomain || !newDomain.trim()}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors">
              {addingDomain ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Adicionar
            </button>
          </div>

          {/* Domain list */}
          {domains.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-gray-200 rounded-lg">
              <Globe className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">Nenhum domínio configurado</p>
              <p className="text-xs text-gray-400 mt-1">Adicione um domínio para começar a enviar emails</p>
            </div>
          ) : (
            <div className="space-y-3">
              {domains.map(domain => (
                <div key={domain.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${domain.status === 'verified' ? 'bg-emerald-500' : domain.status === 'pending' ? 'bg-amber-500' : 'bg-red-500'}`} />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{domain.domain}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className={`text-[11px] font-medium ${domain.spf ? 'text-emerald-600' : 'text-gray-400'}`}>
                          SPF {domain.spf ? '✓' : '—'}
                        </span>
                        <span className={`text-[11px] font-medium ${domain.dkim ? 'text-emerald-600' : 'text-gray-400'}`}>
                          DKIM {domain.dkim ? '✓' : '—'}
                        </span>
                        <span className={`text-[11px] font-medium ${domain.dmarc ? 'text-emerald-600' : 'text-gray-400'}`}>
                          DMARC {domain.dmarc ? '✓' : '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 text-[11px] font-medium rounded-full ${
                      domain.status === 'verified' ? 'bg-emerald-50 text-emerald-700' : domain.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
                    }`}>
                      {domain.status === 'verified' ? 'Verificado' : domain.status === 'pending' ? 'Pendente' : 'Falhou'}
                    </span>
                    <button onClick={() => handleDeleteDomain(domain.id)}
                      className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
