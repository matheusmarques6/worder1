'use client'

// =============================================
// WORDER: Email Domains settings
// /settings/email
//
// Adds a domain → Resend returns DNS records → merchant copies them
// into their DNS provider → clicks "Verificar" → we call Resend's
// verify API and update the status badge.
// =============================================

import { useEffect, useState } from 'react'
import {
  Globe,
  CheckCircle,
  AlertCircle,
  Copy,
  RefreshCw,
  Plus,
  Shield,
  Loader2,
  Trash2,
  Zap,
} from 'lucide-react'

interface DnsRecord {
  type?: string
  name?: string
  value?: string
  record?: string
  ttl?: string | number
  priority?: number | null
}

interface Domain {
  id: string
  domain: string
  resend_domain_id: string | null
  status: 'pending' | 'verified' | 'failed' | string
  dns_records: DnsRecord[] | null
  verified_at: string | null
  created_at: string
}

function statusBadgeClass(status: string) {
  if (status === 'verified') return 'bg-emerald-50 text-emerald-700 border border-emerald-200'
  if (status === 'failed') return 'bg-red-50 text-red-700 border border-red-200'
  return 'bg-amber-50 text-amber-700 border border-amber-200'
}

function statusLabel(status: string) {
  if (status === 'verified') return 'Verificado'
  if (status === 'failed') return 'Falhou'
  return 'Aguardando verificação'
}

export default function SettingsEmailPage() {
  const [domains, setDomains] = useState<Domain[]>([])
  const [loading, setLoading] = useState(true)
  const [newDomain, setNewDomain] = useState('')
  const [adding, setAdding] = useState(false)
  const [verifying, setVerifying] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2200)
  }

  const loadDomains = async () => {
    try {
      const res = await fetch('/api/email/domains', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setDomains(data.domains || [])
      }
    } catch { /* silent */ }
    setLoading(false)
  }

  useEffect(() => { loadDomains() }, [])

  const handleAdd = async () => {
    const d = newDomain.trim().toLowerCase()
    if (!d) return
    setAdding(true)
    try {
      const res = await fetch('/api/email/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: d }),
      })
      const data = await res.json()
      if (!res.ok) {
        showToast(data.error || 'Erro ao adicionar domínio', 'error')
      } else {
        setNewDomain('')
        showToast('Domínio adicionado. Configure os registros DNS abaixo.')
        loadDomains()
      }
    } catch {
      showToast('Erro ao adicionar domínio', 'error')
    } finally {
      setAdding(false)
    }
  }

  const handleVerify = async (domainId: string) => {
    setVerifying(domainId)
    try {
      const res = await fetch('/api/email/domains/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domainId }),
      })
      const data = await res.json()
      if (!res.ok) {
        showToast(data.error || 'Falha ao verificar', 'error')
      } else {
        showToast('Status atualizado')
        loadDomains()
      }
    } catch {
      showToast('Erro ao verificar', 'error')
    } finally {
      setVerifying(null)
    }
  }

  const handleRemove = async (domainId: string, domain: string) => {
    if (!confirm(`Remover o domínio ${domain}? Os emails configurados para este domínio deixarão de funcionar.`)) return
    setRemoving(domainId)
    try {
      const res = await fetch(`/api/email/domains/${domainId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        showToast(data.error || 'Falha ao remover', 'error')
      } else {
        showToast('Domínio removido')
        loadDomains()
      }
    } catch {
      showToast('Erro ao remover', 'error')
    } finally {
      setRemoving(null)
    }
  }

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(null), 1200)
    } catch { /* silent */ }
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
      {toast && (
        <div
          className={`fixed top-20 right-6 z-50 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium ${
            toast.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Adicionar domínio */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#FF6A2B]" />
            <h2 className="text-base font-semibold text-gray-900">Adicionar Domínio</h2>
          </div>
          <p className="text-sm text-gray-500 mt-1 leading-relaxed">
            Para enviar com sua marca (ex: <span className="font-mono text-[13px] text-gray-700">contato@sualoja.com.br</span>),
            adicione o domínio e configure os registros DNS no seu provedor.
          </p>
        </div>
        <div className="p-6 flex gap-3">
          <input
            type="text"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="sualoja.com.br"
            className="flex-1 px-4 py-2.5 border border-zinc-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 font-mono focus:outline-none focus:ring-2 focus:ring-[#FF6A2B]/20 focus:border-[#FF6A2B]"
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newDomain.trim()}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#FF6A2B] text-white text-sm font-medium rounded-lg hover:bg-[#E85D1F] disabled:opacity-50 transition-colors"
          >
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Adicionar
          </button>
        </div>
      </div>

      {/* Lista de domínios */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900">Seus Domínios</h3>
          <span className="text-xs text-zinc-400">{domains.length} {domains.length === 1 ? 'domínio' : 'domínios'}</span>
        </div>

        {domains.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-zinc-300 p-10 text-center">
            <Globe className="w-6 h-6 text-zinc-300 mx-auto mb-2" />
            <p className="text-sm text-zinc-500">Nenhum domínio configurado.</p>
            <p className="text-xs text-zinc-400 mt-1">Adicione um domínio para autenticar seus emails com SPF, DKIM e DMARC.</p>
          </div>
        ) : (
          domains.map((d) => {
            const records = Array.isArray(d.dns_records) ? d.dns_records : []
            return (
              <div key={d.id} className="bg-white rounded-xl border border-zinc-200 shadow-sm">
                {/* Header */}
                <div className="px-6 py-4 flex items-center justify-between border-b border-zinc-100">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-zinc-50 flex items-center justify-center flex-shrink-0">
                      <Globe className="w-4 h-4 text-zinc-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-zinc-900 font-mono truncate">{d.domain}</p>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        Adicionado em {new Date(d.created_at).toLocaleDateString('pt-BR')}
                        {d.verified_at && (
                          <> · Verificado em {new Date(d.verified_at).toLocaleDateString('pt-BR')}</>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${statusBadgeClass(d.status)}`}>
                      {d.status === 'verified' ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                      {statusLabel(d.status)}
                    </span>
                    <button
                      onClick={() => handleVerify(d.id)}
                      disabled={verifying === d.id}
                      className="inline-flex items-center gap-1.5 text-[12px] font-medium text-zinc-700 bg-white hover:bg-zinc-50 border border-zinc-200 px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                    >
                      {verifying === d.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      Verificar
                    </button>
                    <button
                      onClick={() => handleRemove(d.id, d.domain)}
                      disabled={removing === d.id}
                      className="inline-flex items-center justify-center w-8 h-8 text-zinc-400 hover:text-red-600 hover:bg-red-50 border border-zinc-200 hover:border-red-200 rounded-lg disabled:opacity-50 transition-colors"
                      title="Remover domínio"
                    >
                      {removing === d.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* DNS records */}
                {records.length === 0 ? (
                  <div className="px-6 py-5 text-sm text-zinc-500">
                    Nenhum registro DNS disponível. Clique em "Verificar" para atualizar.
                  </div>
                ) : (
                  <div className="px-6 py-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold text-zinc-700 uppercase tracking-wide">Registros DNS</p>
                      <p className="text-xs text-zinc-400">Adicione no seu provedor (Cloudflare, Registro.br, etc.)</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-[11px] uppercase tracking-wide text-zinc-400 border-b border-zinc-100">
                            <th className="text-left py-2 pr-4 font-semibold">Tipo</th>
                            <th className="text-left py-2 pr-4 font-semibold">Nome / Host</th>
                            <th className="text-left py-2 pr-4 font-semibold">Valor</th>
                            <th className="py-2"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {records.map((r: any, idx: number) => {
                            const type = (r.type || r.record || '').toUpperCase()
                            const name = r.name || '-'
                            const value = r.value || ''
                            const key = `${d.id}-${idx}`
                            return (
                              <tr key={idx} className="align-top">
                                <td className="py-3 pr-4">
                                  <span className="inline-flex items-center text-[11px] font-semibold text-zinc-700 bg-zinc-100 px-2 py-0.5 rounded">
                                    {type || '—'}
                                  </span>
                                </td>
                                <td className="py-3 pr-4 font-mono text-[12.5px] text-zinc-900 break-all">{name}</td>
                                <td className="py-3 pr-4 font-mono text-[12.5px] text-zinc-900 break-all max-w-[320px]">
                                  {value}
                                </td>
                                <td className="py-3 text-right whitespace-nowrap">
                                  <button
                                    onClick={() => handleCopy(value, key)}
                                    className="inline-flex items-center gap-1 text-[11.5px] text-zinc-600 hover:text-zinc-900 transition-colors"
                                    title="Copiar valor"
                                  >
                                    <Copy className="w-3 h-3" />
                                    {copied === key ? 'Copiado' : 'Copiar'}
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Webhook Resend */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#FF6A2B]" />
            <h2 className="text-base font-semibold text-gray-900">Webhook de Tracking</h2>
          </div>
          <p className="text-sm text-gray-500 mt-1 leading-relaxed">
            Registre o webhook do Resend para receber eventos de bounce, abertura, clique e reclamação automaticamente.
          </p>
        </div>
        <div className="p-6">
          <WebhookResendButton />
        </div>
      </div>
    </div>
  )
}

function WebhookResendButton() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const handleRegister = async () => {
    setStatus('loading')
    try {
      const res = await fetch('/api/email/webhooks/register', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setStatus('error')
        setMessage(data.error || 'Erro')
      } else {
        setStatus('done')
        setMessage(data.message || 'Webhook registrado com sucesso')
      }
    } catch {
      setStatus('error')
      setMessage('Erro de conexão')
    }
  }

  return (
    <div className="flex items-center gap-4">
      <button
        onClick={handleRegister}
        disabled={status === 'loading'}
        className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#FF6A2B] text-white text-sm font-medium rounded-lg hover:bg-[#E85D1F] disabled:opacity-50 transition-colors"
      >
        {status === 'loading' ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : status === 'done' ? (
          <CheckCircle className="w-4 h-4" />
        ) : (
          <Zap className="w-4 h-4" />
        )}
        {status === 'done' ? 'Registrado' : 'Registrar Webhook'}
      </button>
      {message && (
        <span className={`text-sm ${status === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>
          {message}
        </span>
      )}
    </div>
  )
}
