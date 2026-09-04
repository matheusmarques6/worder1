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
import { useStoreStore } from '@/stores'
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
  Mail,
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
  warmup_enabled?: boolean
  warmup_day?: number
  warmup_daily_limit?: number
  /** worder.email — domínio compartilhado da Worder, verificado para todos. */
  is_system?: boolean
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
  const { currentStore } = useStoreStore()
  const hasHydrated = useStoreStore((s) => s._hasHydrated)
  const storeId = currentStore?.id
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
    // Wait for zustand to hydrate so the storeId param is real and
    // we don't briefly fetch all-org domains before re-fetching the
    // store-scoped list (would flash a sibling store's custom domain).
    if (!hasHydrated) return
    try {
      const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : ''
      const res = await fetch(`/api/email/domains${qs}`, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setDomains(data.domains || [])
      }
    } catch { /* silent */ }
    setLoading(false)
  }

  useEffect(() => { loadDomains() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [storeId, hasHydrated])

  const handleAdd = async () => {
    const d = newDomain.trim().toLowerCase()
    if (!d) return
    setAdding(true)
    try {
      const res = await fetch('/api/email/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Custom domains belong to a specific store so a multi-store
        // merchant doesn't see the sibling shop's domain in settings.
        body: JSON.stringify({ domain: d, storeId: storeId || null }),
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
        const status = data.domain?.status || data.resend?.status || 'pending'
        if (status === 'verified') {
          showToast('Domínio verificado com sucesso!')
        } else if (status === 'failed') {
          showToast('Verificação falhou. Confira os registros DNS.', 'error')
        } else {
          showToast('Verificação iniciada. Aguarde alguns minutos e tente novamente.')
        }
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

                {/* Warm-up control */}
                {d.status === 'verified' && (
                  <div className="px-6 py-4 border-t border-zinc-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-zinc-900">🔥 Warm-up de IP</p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {d.warmup_enabled
                            ? `Dia ${d.warmup_day || 0} · Limite: ${(d.warmup_daily_limit || 200).toLocaleString('pt-BR')} emails/dia`
                            : 'Aumente volume gradualmente para proteger reputação (recomendado para domínios novos)'}
                        </p>
                      </div>
                      <button
                        onClick={async () => {
                          const newVal = !d.warmup_enabled
                          try {
                            const res = await fetch('/api/email/domains/warmup', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ domain_id: d.id, enabled: newVal }),
                            })
                            if (res.ok) {
                              setDomains(prev => prev.map(dom =>
                                dom.id === d.id ? { ...dom, warmup_enabled: newVal, warmup_day: newVal ? 1 : 0, warmup_daily_limit: 200 } : dom
                              ))
                              showToast(newVal ? 'Warm-up ativado' : 'Warm-up desativado', 'success')
                            } else {
                              showToast('Não foi possível atualizar o warm-up. Tente novamente.', 'error')
                            }
                          } catch {
                            showToast('Não foi possível atualizar o warm-up. Tente novamente.', 'error')
                          }
                        }}
                        className={`relative w-10 h-6 rounded-full transition-colors ${d.warmup_enabled ? 'bg-amber-500' : 'bg-gray-200'}`}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm ${d.warmup_enabled ? 'translate-x-4' : ''}`} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Configuração do Remetente (per-store).
          key={storeId} remounts the component when the active store
          switches — without that, the internal senderName / replyTo
          state carries over from the previous store and the merchant
          briefly sees the wrong sender while the fetch resolves. */}
      <SenderConfig
        key={storeId || 'no-store'}
        verifiedDomains={domains.filter(d => d.status === 'verified')}
        storeId={storeId || null}
        storeName={currentStore?.name || null}
      />

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

function SenderConfig({
  verifiedDomains,
  storeId,
  storeName,
}: {
  verifiedDomains: Domain[]
  storeId: string | null
  storeName: string | null
}) {
  const [senderName, setSenderName] = useState('')
  const [senderLocal, setSenderLocal] = useState('') // parte antes do @
  const [selectedDomain, setSelectedDomain] = useState('')
  const [replyTo, setReplyTo] = useState('')
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [toast, setToast] = useState('')
  const [saveError, setSaveError] = useState<{ message: string; suggestion?: string } | null>(null)
  // Domínio compartilhado da Worder (worder.email): verificado para todas
  // as lojas; o nome antes do @ é único em toda a plataforma.
  const [sharedDomain, setSharedDomain] = useState('worder.email')
  const [suggestedLocal, setSuggestedLocal] = useState('')
  const [availability, setAvailability] = useState<{ state: 'idle' | 'checking' | 'available' | 'taken' | 'invalid'; suggestion?: string }>({ state: 'idle' })
  // Domínio dos links de tracking (opcional, por loja).
  const [trackingDomain, setTrackingDomain] = useState('')
  const [originalTrackingDomain, setOriginalTrackingDomain] = useState('')
  const [appHost, setAppHost] = useState('app.worder.com.br')
  // Originals to detect changes after save
  const [originalSenderName, setOriginalSenderName] = useState('')
  const [originalSenderEmail, setOriginalSenderEmail] = useState('')
  const [originalReplyTo, setOriginalReplyTo] = useState('')
  // "Apply to all" modal state
  const [pendingSync, setPendingSync] = useState<{
    senderName?: string
    senderEmail?: string
    replyTo?: string
    previousEmail?: string
  } | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<any>(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location?.host) setAppHost(window.location.host)
  }, [])

  useEffect(() => {
    // Per-store config: ignore the previous org-scoped endpoint and
    // pull this store's sender. Skip the fetch until we know which
    // store is active — otherwise the first render lands on the org's
    // legacy values and we'd flash the sibling store's sender.
    // Loja ainda sem remetente recebe o dela (<nome>@worder.email) no
    // próprio GET — a resposta avisa com `allocated`.
    if (!storeId) { setLoaded(true); return }
    fetch(`/api/settings/store-email?storeId=${encodeURIComponent(storeId)}`)
      .then(r => r.json())
      .then(d => {
        const s = d?.email_settings || {}
        const name = s.default_sender_name || ''
        const reply = s.default_reply_to || ''
        const email = s.default_sender_email || ''
        const shared = d?.shared_domain || 'worder.email'
        setSharedDomain(shared)
        setSuggestedLocal(d?.suggested_local_part || '')
        setSenderName(name)
        setReplyTo(reply)
        if (email.includes('@')) {
          setSenderLocal(email.split('@')[0])
          setSelectedDomain(email.split('@')[1])
        } else {
          setSenderLocal(d?.suggested_local_part || '')
          setSelectedDomain(shared)
        }
        setTrackingDomain(s.tracking_domain || '')
        setOriginalTrackingDomain(s.tracking_domain || '')
        setOriginalSenderName(name)
        setOriginalSenderEmail(email)
        setOriginalReplyTo(reply)
        if (d?.allocated && email) {
          setToast(`Criamos o remetente desta loja: ${email}`)
          setTimeout(() => setToast(''), 4000)
        }
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [storeId])

  useEffect(() => {
    if (!selectedDomain) setSelectedDomain(sharedDomain)
  }, [sharedDomain, selectedDomain])

  const isShared = selectedDomain.toLowerCase() === sharedDomain.toLowerCase()
  const fullEmail = senderLocal && selectedDomain ? `${senderLocal}@${selectedDomain}` : ''

  // No domínio compartilhado, confere ao digitar se o nome está livre —
  // a mesma regra que o salvar aplica. Debounce para não bater na API a
  // cada tecla.
  useEffect(() => {
    if (!isShared || !senderLocal || !storeId) { setAvailability({ state: 'idle' }); return }
    const local = senderLocal.toLowerCase()
    if (local === originalSenderEmail.split('@')[0] && originalSenderEmail.endsWith(`@${sharedDomain}`)) {
      setAvailability({ state: 'available' }); return
    }
    if (!/^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/.test(local)) { setAvailability({ state: 'invalid' }); return }
    let cancelled = false
    setAvailability({ state: 'checking' })
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/email/shared-sender/check?local=${encodeURIComponent(local)}&storeId=${encodeURIComponent(storeId)}`)
        const d = await r.json()
        if (cancelled) return
        if (!r.ok) { setAvailability({ state: 'idle' }); return }
        setAvailability(d.available ? { state: 'available' } : { state: 'taken', suggestion: d.suggestion })
      } catch { if (!cancelled) setAvailability({ state: 'idle' }) }
    }, 400)
    return () => { cancelled = true; clearTimeout(t) }
  }, [isShared, senderLocal, storeId, sharedDomain, originalSenderEmail])

  const canSave = Boolean(storeId && fullEmail && senderName && !saving)
    && (!isShared || availability.state === 'available' || availability.state === 'idle')

  const save = async () => {
    if (!fullEmail) return
    if (!storeId) return
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/settings/store-email', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          email_settings: {
            default_sender_name: senderName,
            default_sender_email: fullEmail.toLowerCase(),
            default_reply_to: replyTo || fullEmail.toLowerCase(),
            tracking_domain: trackingDomain.trim(),
          },
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setSaveError({ message: data.error || `Falha ao salvar (${res.status})`, suggestion: data.suggestion })
        if (data.code === 'local_part_taken') setAvailability({ state: 'taken', suggestion: data.suggestion ? String(data.suggestion).split('@')[0] : undefined })
        return
      }
      if (res.ok) {
        setToast('Salvo com sucesso')
        setTimeout(() => setToast(''), 2000)
        setOriginalTrackingDomain(trackingDomain.trim())

        // Detect what changed and prompt to apply to all emails
        const finalReplyTo = replyTo || fullEmail
        const nameChanged = senderName && senderName !== originalSenderName
        const emailChanged = fullEmail && fullEmail !== originalSenderEmail
        const replyChanged = finalReplyTo && finalReplyTo !== originalReplyTo
        if (nameChanged || emailChanged || replyChanged) {
          setPendingSync({
            senderName: nameChanged ? senderName : undefined,
            senderEmail: emailChanged ? fullEmail : undefined,
            replyTo: replyChanged ? finalReplyTo : undefined,
            previousEmail: emailChanged ? originalSenderEmail : undefined,
          })
        }

        // Update originals so subsequent saves don't re-prompt
        setOriginalSenderName(senderName)
        setOriginalSenderEmail(fullEmail)
        setOriginalReplyTo(finalReplyTo)
      }
    } finally { setSaving(false) }
  }

  const applySync = async (scope: 'all' | 'empty') => {
    if (!pendingSync) return
    setSyncing(true)
    try {
      // Só as automações DESTA loja. Sem a loja a rota recusa — antes
      // varria a organização inteira e reescrevia o remetente das lojas
      // irmãs.
      const res = await fetch('/api/email/sync-defaults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...pendingSync,
          storeId,
          onlyEmpty: scope === 'empty',
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setSyncResult(data)
      }
    } finally {
      setSyncing(false)
    }
  }

  if (!loaded) return null

  return (
    <>
    {pendingSync && (
      <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50" onClick={syncing ? undefined : () => { setPendingSync(null); setSyncResult(null); }} />
        <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
          {syncResult ? (
            <div className="p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              </div>
              <h3 className="text-base font-semibold text-zinc-900 mb-1">Atualizado</h3>
              <p className="text-sm text-zinc-500 mb-4">
                {syncResult.nodesUpdated} email{syncResult.nodesUpdated !== 1 ? 's' : ''} em {syncResult.automationsUpdated} automaç{syncResult.automationsUpdated !== 1 ? 'ões' : 'ão'}
                {syncResult.templatesUpdated > 0 && ` · ${syncResult.templatesUpdated} template${syncResult.templatesUpdated !== 1 ? 's' : ''}`}
              </p>
              <button onClick={() => { setPendingSync(null); setSyncResult(null); }} className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium rounded-md">
                Fechar
              </button>
            </div>
          ) : (
            <>
              <div className="px-5 py-4 border-b border-zinc-100">
                <h3 className="text-base font-semibold text-zinc-900">Aplicar a emails existentes?</h3>
                <p className="text-xs text-zinc-500 mt-1">Você alterou as configurações de remetente. Aplicar nas automações e templates já criados?</p>
              </div>
              <div className="p-5 space-y-2 text-sm">
                {pendingSync.senderName && (
                  <div className="flex justify-between gap-3 text-zinc-700">
                    <span className="text-zinc-500">Nome:</span>
                    <span className="font-medium truncate">{pendingSync.senderName}</span>
                  </div>
                )}
                {pendingSync.senderEmail && (
                  <div className="flex justify-between gap-3 text-zinc-700">
                    <span className="text-zinc-500">Email:</span>
                    <span className="font-medium truncate">{pendingSync.senderEmail}</span>
                  </div>
                )}
                {pendingSync.replyTo && (
                  <div className="flex justify-between gap-3 text-zinc-700">
                    <span className="text-zinc-500">Reply-to:</span>
                    <span className="font-medium truncate">{pendingSync.replyTo}</span>
                  </div>
                )}
              </div>
              <div className="px-5 py-3 bg-zinc-50 border-t border-zinc-100 flex flex-col gap-2">
                <button
                  onClick={() => applySync('all')}
                  disabled={syncing}
                  className="w-full px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
                >
                  {syncing ? 'Atualizando...' : 'Atualizar em todos os emails'}
                </button>
                <button
                  onClick={() => applySync('empty')}
                  disabled={syncing}
                  className="w-full px-3 py-2 bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-700 text-sm font-medium rounded-md transition-colors disabled:opacity-50"
                >
                  Aplicar apenas onde está vazio
                </button>
                <button
                  onClick={() => setPendingSync(null)}
                  disabled={syncing}
                  className="w-full px-3 py-2 text-zinc-500 hover:text-zinc-700 text-sm rounded-md transition-colors disabled:opacity-50"
                >
                  Não atualizar emails existentes
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    )}
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="px-6 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-[#FF6A2B]" />
          <h2 className="text-base font-semibold text-gray-900">Remetente desta loja{storeName ? ` · ${storeName}` : ''}</h2>
        </div>
        <p className="text-sm text-gray-500 mt-1 leading-relaxed">
          Cada loja envia com o próprio nome e e-mail. O domínio <span className="font-mono text-[13px] text-gray-700">{sharedDomain}</span> já
          vem verificado para todas as lojas da Worder; para enviar da sua marca, adicione e verifique um domínio acima.
        </p>
      </div>
      <div className="p-6 space-y-5">
        {saveError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <p>{saveError.message}</p>
            {saveError.suggestion && (
              <button
                type="button"
                onClick={() => { setSenderLocal(String(saveError.suggestion).split('@')[0]); setSaveError(null) }}
                className="mt-1.5 text-xs font-medium text-red-800 underline"
              >
                Usar {saveError.suggestion}
              </button>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome do remetente</label>
          <input
            type="text"
            value={senderName}
            onChange={e => setSenderName(e.target.value)}
            placeholder={storeName || 'Minha Loja'}
            className="w-full px-4 py-2.5 border border-zinc-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FF6A2B]/20 focus:border-[#FF6A2B]"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">E-mail do remetente</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={senderLocal}
              onChange={e => setSenderLocal(e.target.value.toLowerCase().replace(/[^a-z0-9._\-]/g, ''))}
              placeholder={suggestedLocal || 'contato'}
              aria-label="Parte antes do @"
              className={`flex-1 px-4 py-2.5 border rounded-lg text-sm text-gray-900 font-mono placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FF6A2B]/20 focus:border-[#FF6A2B] ${
                isShared && availability.state === 'taken' ? 'border-red-300 bg-red-50/40' : isShared && availability.state === 'available' && senderLocal ? 'border-emerald-300' : 'border-zinc-200'
              }`}
            />
            <span className="flex items-center text-sm text-gray-400 font-mono">@</span>
            <select
              value={selectedDomain}
              onChange={e => setSelectedDomain(e.target.value)}
              aria-label="Domínio do remetente"
              className="flex-1 px-4 py-2.5 border border-zinc-200 rounded-lg text-sm text-gray-900 font-mono bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6A2B]/20 focus:border-[#FF6A2B]"
            >
              <option value={sharedDomain}>{sharedDomain} · compartilhado Worder (verificado)</option>
              {verifiedDomains.filter(d => d.domain.toLowerCase() !== sharedDomain.toLowerCase()).map(d => (
                <option key={d.id} value={d.domain}>{d.domain} · seu domínio</option>
              ))}
            </select>
          </div>

          {/* Estado do nome no domínio compartilhado */}
          {isShared && senderLocal && (
            <p className={`text-xs mt-1.5 flex items-center gap-1.5 ${
              availability.state === 'taken' || availability.state === 'invalid' ? 'text-red-600' : availability.state === 'available' ? 'text-emerald-600' : 'text-gray-500'
            }`}>
              {availability.state === 'checking' && <><Loader2 className="w-3 h-3 animate-spin" /> Verificando se está livre…</>}
              {availability.state === 'available' && <><CheckCircle className="w-3 h-3" /> {senderLocal}@{sharedDomain} é exclusivo desta loja em toda a Worder.</>}
              {availability.state === 'invalid' && <><AlertCircle className="w-3 h-3" /> Use letras minúsculas, números, ponto, hífen ou underscore.</>}
              {availability.state === 'taken' && (
                <>
                  <AlertCircle className="w-3 h-3" /> Já usado por outra loja.
                  {availability.suggestion && (
                    <button type="button" onClick={() => setSenderLocal(availability.suggestion!)} className="underline font-medium">
                      Usar {availability.suggestion}
                    </button>
                  )}
                </>
              )}
            </p>
          )}
          {isShared && !senderLocal && suggestedLocal && (
            <p className="text-xs text-gray-500 mt-1.5">
              Sugestão para esta loja: <button type="button" onClick={() => setSenderLocal(suggestedLocal)} className="font-mono text-gray-900 underline">{suggestedLocal}@{sharedDomain}</button>
            </p>
          )}
          {!isShared && verifiedDomains.filter(d => !d.is_system).length === 0 && (
            <p className="text-xs text-amber-700 mt-1.5">Nenhum domínio próprio verificado ainda. Adicione e verifique um domínio acima para usá-lo aqui.</p>
          )}
          {fullEmail && (
            <p className="text-xs text-gray-500 mt-1.5 font-mono">
              Envios de: <span className="text-gray-900 font-semibold">{senderName || storeName || 'Sua Loja'} &lt;{fullEmail}&gt;</span>
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Responder para (opcional)</label>
          <input
            type="email"
            value={replyTo}
            onChange={e => setReplyTo(e.target.value)}
            placeholder={fullEmail || 'contato@sualoja.com'}
            className="w-full px-4 py-2.5 border border-zinc-200 rounded-lg text-sm text-gray-900 font-mono placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FF6A2B]/20 focus:border-[#FF6A2B]"
          />
          <p className="text-xs text-gray-400 mt-1.5">Onde chegam as respostas dos clientes. Pode ser o e-mail da loja mesmo sem domínio verificado.</p>
        </div>

        <div className="pt-4 border-t border-gray-100">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Domínio dos links (opcional)</label>
          <input
            type="text"
            value={trackingDomain}
            onChange={e => setTrackingDomain(e.target.value.toLowerCase().replace(/^https?:\/\//, '').replace(/[^a-z0-9.-]/g, ''))}
            placeholder="links.sualoja.com.br"
            className="w-full px-4 py-2.5 border border-zinc-200 rounded-lg text-sm text-gray-900 font-mono placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FF6A2B]/20 focus:border-[#FF6A2B]"
          />
          <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
            Os links de clique, abertura e descadastro dos e-mails desta loja passam a usar este host, alinhado à sua marca.
            {trackingDomain && (
              <> Crie no seu DNS um registro <span className="font-mono text-gray-700">CNAME</span> de <span className="font-mono text-gray-700">{trackingDomain}</span> para <span className="font-mono text-gray-700">{appHost}</span>.</>
            )}
            {!trackingDomain && <> Vazio: usa o domínio da Worder.</>}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={!canSave}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#FF6A2B] text-white text-sm font-medium rounded-lg hover:bg-[#E85D1F] disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Salvar Configuração
          </button>
          {toast && <span className="text-sm text-emerald-600">{toast}</span>}
        </div>
      </div>
    </div>
    </>
  )
}

function WebhookResendButton() {
  // The Resend webhook is a SINGLE platform-wide endpoint
  // (https://app.worder.com.br/api/webhooks/resend) signed with our
  // RESEND_WEBHOOK_SECRET env var. Once it's registered against our
  // Resend account, it forwards events for every sender on the account
  // — there's nothing per-merchant to register. So this UI just shows
  // "ok, we're listening" most of the time. The merchant can re-run the
  // POST in case they nuked the webhook on the Resend dashboard.
  const [status, setStatus] = useState<'checking' | 'idle' | 'loading' | 'done' | 'error'>('checking')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch('/api/email/webhooks/register')
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        const list = d?.webhooks?.data || d?.webhooks || []
        const ourEndpoint = `/api/webhooks/resend`
        const found = Array.isArray(list)
          ? list.some((w: any) => typeof w?.url === 'string' && w.url.includes(ourEndpoint))
          : false
        if (found) {
          setStatus('done')
          setMessage('Já está recebendo eventos do Resend.')
        } else {
          setStatus('idle')
        }
      })
      .catch(() => { if (!cancelled) setStatus('idle') })
    return () => { cancelled = true }
  }, [])

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

  // Already registered (most common state) — show a confirmation
  // chip, not a CTA. Avoids the merchant clicking "Registrar" again
  // and again thinking nothing happened.
  if (status === 'done') {
    return (
      <div className="flex items-center gap-3 px-4 py-2.5 bg-emerald-50 border border-emerald-100 rounded-lg">
        <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-emerald-900">Webhook ativo</p>
          <p className="text-xs text-emerald-700/80">
            {message || 'A Worder já está recebendo eventos do Resend (open / click / bounce).'}
          </p>
        </div>
      </div>
    )
  }

  if (status === 'checking') {
    return (
      <div className="inline-flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        Verificando status do webhook...
      </div>
    )
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
        ) : (
          <Zap className="w-4 h-4" />
        )}
        Registrar Webhook
      </button>
      {message && (
        <span className={`text-sm ${status === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>
          {message}
        </span>
      )}
    </div>
  )
}
