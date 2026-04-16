'use client'

// =============================================
// WORDER: LGPD Settings page
// /settings/lgpd — conecta com /api/lgpd/* endpoints
// =============================================

import { useEffect, useState } from 'react'
import {
  ShieldCheck,
  FileText,
  Download,
  Trash2,
  Edit3,
  Loader2,
  Plus,
  X,
  XCircle,
  AlertCircle,
  Mail,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface DataRequest {
  id: string
  requester_email: string
  request_type: 'export' | 'delete' | 'rectification' | 'portability' | 'object' | 'restrict'
  status: 'pending' | 'processing' | 'completed' | 'rejected' | 'cancelled'
  verified_at: string | null
  processed_at: string | null
  created_at: string
  reason: string | null
}

const REQUEST_TYPE_LABELS: Record<string, { label: string; icon: any }> = {
  export: { label: 'Exportar dados', icon: Download },
  portability: { label: 'Portabilidade', icon: Download },
  delete: { label: 'Excluir dados', icon: Trash2 },
  rectification: { label: 'Retificar', icon: Edit3 },
  object: { label: 'Objeção', icon: XCircle },
  restrict: { label: 'Restringir', icon: AlertCircle },
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  pending: { label: 'Aguardando verificação', className: 'bg-gray-100 text-gray-700' },
  processing: { label: 'Processando', className: 'bg-blue-50 text-blue-700 border border-blue-200' },
  completed: { label: 'Concluído', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  rejected: { label: 'Rejeitado', className: 'bg-red-50 text-red-700 border border-red-200' },
  cancelled: { label: 'Cancelado', className: 'bg-gray-100 text-gray-500' },
}

const RESOURCES = [
  { value: 'contact_events', label: 'Eventos de contato', description: 'Histórico de comportamento (viewed, clicked, etc)' },
  { value: 'email_sends', label: 'Emails enviados', description: 'Registros de opens/clicks de campanhas' },
  { value: 'contacts_inactive', label: 'Contatos inativos', description: 'Contatos sem atividade e sem compras' },
]

export default function LgpdSettingsPage() {
  const [tab, setTab] = useState<'requests' | 'retention' | 'consents'>('requests')
  const [requests, setRequests] = useState<DataRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewRequest, setShowNewRequest] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2500)
  }

  const load = async () => {
    try {
      const res = await fetch('/api/lgpd/data-requests')
      if (res.ok) {
        const d = await res.json()
        setRequests(d.requests || [])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="p-8 max-w-5xl">
      {toast && (
        <div
          className={cn(
            'fixed top-20 right-6 z-50 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium',
            toast.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          )}
        >{toast.msg}</div>
      )}

      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">LGPD & Privacidade</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Gerencie pedidos de dados, consentimentos e políticas de retenção.
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {[
          { key: 'requests', label: 'Pedidos de dados' },
          { key: 'retention', label: 'Retenção' },
          { key: 'consents', label: 'Consentimentos' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
              tab === t.key
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'requests' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Pedidos de exclusão, exportação e retificação dos seus contatos.
            </p>
            <button
              onClick={() => setShowNewRequest(true)}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 text-white rounded-lg"
            >
              <Plus size={14} /> Novo pedido
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : requests.length === 0 ? (
            <div className="bg-white border border-dashed border-gray-200 rounded-xl p-12 text-center">
              <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Nenhum pedido recebido ainda.</p>
              <p className="text-xs text-gray-400 mt-1">
                Seus contatos podem solicitar via <code className="font-mono bg-gray-50 px-1.5 py-0.5 rounded">POST /api/lgpd/data-requests</code>
              </p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Tipo</th>
                    <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Solicitante</th>
                    <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Status</th>
                    <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {requests.map((r) => {
                    const meta = REQUEST_TYPE_LABELS[r.request_type] || REQUEST_TYPE_LABELS.export
                    const sts = STATUS_LABELS[r.status] || STATUS_LABELS.pending
                    const Icon = meta.icon
                    return (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Icon size={14} className="text-gray-400" />
                            <span className="text-sm font-medium text-gray-900">{meta.label}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 font-mono text-xs">{r.requester_email}</td>
                        <td className="px-4 py-3">
                          <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', sts.className)}>
                            {sts.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {new Date(r.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'retention' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-900">
              Políticas de retenção rodam automaticamente todo dia às 3h. Dados acima do prazo são anonimizados ou excluídos.
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">Recursos disponíveis para retenção</h3>
            </div>
            <div className="divide-y divide-gray-100">
              {RESOURCES.map((r) => (
                <div key={r.value} className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{r.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{r.description}</p>
                  </div>
                  <code className="text-[10px] font-mono text-gray-400 bg-gray-50 px-2 py-1 rounded">
                    {r.value}
                  </code>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'consents' && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-2">Consentimentos coletados</h3>
          <p className="text-sm text-gray-500 mb-4">
            Cada consentimento é registrado com IP + User Agent para auditoria.
          </p>
          <div className="text-xs text-gray-500 font-mono bg-gray-50 p-4 rounded-lg border border-gray-100 space-y-2">
            <div>
              <strong>Endpoint público:</strong> <code>POST /api/lgpd/consents</code>
            </div>
            <div>
              <strong>Body:</strong>
              <pre className="mt-1 text-[11px] overflow-x-auto">{JSON.stringify({
                organization_id: 'uuid',
                contact_id: 'uuid (opcional)',
                visitor_id: 'string (opcional)',
                consents: { marketing: true, tracking: false, analytics: true },
                source: 'banner',
              }, null, 2)}</pre>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-4">
            Tipos válidos: <code className="font-mono">marketing</code>, <code className="font-mono">analytics</code>, <code className="font-mono">tracking</code>, <code className="font-mono">profiling</code>, <code className="font-mono">data_sharing</code>, <code className="font-mono">cookies</code>.
          </p>
        </div>
      )}

      {showNewRequest && (
        <NewRequestModal
          onClose={() => setShowNewRequest(false)}
          onCreated={() => {
            showToast('Pedido criado. Email de verificação enviado.')
            load()
          }}
        />
      )}
    </div>
  )
}

function NewRequestModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState('')
  const [type, setType] = useState<DataRequest['request_type']>('export')
  const [saving, setSaving] = useState(false)
  const [orgId, setOrgId] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/settings/organization').then((r) => r.json()).then((d) => {
      if (d?.organization?.id) setOrgId(d.organization.id)
    })
  }, [])

  const submit = async () => {
    if (!email.trim() || !orgId) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/lgpd/data-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: orgId,
          requester_email: email.trim(),
          request_type: type,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Erro ao criar pedido')
        return
      }
      onCreated()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">Novo pedido LGPD</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X size={18} className="text-gray-500" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Email do solicitante</label>
            <div className="relative mt-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="cliente@exemplo.com"
                className="w-full bg-white border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tipo</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {(['export', 'delete', 'rectification', 'restrict'] as const).map((t) => {
                const meta = REQUEST_TYPE_LABELS[t]
                const Icon = meta.icon
                return (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={cn(
                      'p-3 text-sm border rounded-lg text-left inline-flex items-center gap-2 transition-colors',
                      type === t ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    )}
                  >
                    <Icon size={14} />
                    {meta.label}
                  </button>
                )
              })}
            </div>
          </div>
          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">{error}</div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg">Cancelar</button>
          <button
            onClick={submit}
            disabled={!email.trim() || saving}
            className="px-4 py-2 text-sm font-semibold bg-orange-500 hover:bg-orange-600 text-white rounded-lg disabled:opacity-50 inline-flex items-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Criar pedido
          </button>
        </div>
      </div>
    </div>
  )
}
