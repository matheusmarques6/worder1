'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { GitBranch, RotateCcw, Loader2, Check, FileText } from 'lucide-react'
import { AgentSubPageShell } from '@/components/ai/AgentSubPageShell'

interface VersionRow {
  id: string
  version_number: number
  deploy_notes: string | null
  created_at: string
  is_current: boolean
}

export default function AgentVersionsPage() {
  const params = useParams<{ id: string }>()
  const agentId = params.id

  const [versions, setVersions] = useState<VersionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingVersion, setSavingVersion] = useState(false)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [showSnapshotModal, setShowSnapshotModal] = useState(false)
  const [deployNotes, setDeployNotes] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/versions`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Falha ao carregar')
      setVersions(j.versions ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado')
    } finally {
      setLoading(false)
    }
  }, [agentId])

  useEffect(() => {
    load()
  }, [load])

  async function createSnapshot() {
    setSavingVersion(true)
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deploy_notes: deployNotes.trim() || null }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Falha ao versionar')
      setShowSnapshotModal(false)
      setDeployNotes('')
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro')
    } finally {
      setSavingVersion(false)
    }
  }

  async function restoreVersion(versionId: string, n: number) {
    if (!confirm(`Restaurar a versão #${n}? O estado atual será sobrescrito.`)) return
    setRestoringId(versionId)
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/versions/${versionId}/restore`, {
        method: 'POST',
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Falha ao restaurar')
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro')
    } finally {
      setRestoringId(null)
    }
  }

  return (
    <AgentSubPageShell
      agentId={agentId}
      pageTitle="Versões"
      pageDescription="Cada publicação cria um snapshot. Você pode reverter a qualquer momento."
      actions={
        <button
          onClick={() => setShowSnapshotModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm
                     font-medium rounded-md hover:bg-orange-600 transition-colors"
        >
          <GitBranch className="w-4 h-4" strokeWidth={1.75} />
          Nova versão
        </button>
      }
    >
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-3 py-2 mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" strokeWidth={1.75} />
        </div>
      ) : versions.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-xl p-12 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-orange-50 mb-3">
            <GitBranch className="w-6 h-6 text-orange-600" strokeWidth={1.75} />
          </div>
          <h3 className="text-base font-semibold text-zinc-900 mb-1">
            Nenhuma versão ainda
          </h3>
          <p className="text-sm text-zinc-500">
            Versões são criadas automaticamente quando você publica o agente.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-zinc-200 rounded-xl divide-y divide-zinc-100">
          {versions.map((v) => (
            <div key={v.id} className="flex items-center gap-4 p-4">
              <div className="inline-flex items-center justify-center w-9 h-9 rounded-md bg-zinc-50 border border-zinc-200">
                <FileText className="w-4 h-4 text-zinc-500" strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-zinc-900">
                    Versão #{v.version_number}
                  </span>
                  {v.is_current && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200">
                      <Check className="w-3 h-3" strokeWidth={1.75} />
                      Atual
                    </span>
                  )}
                </div>
                {v.deploy_notes && (
                  <p className="text-xs text-zinc-500 mt-0.5 truncate">{v.deploy_notes}</p>
                )}
                <p className="text-xs text-zinc-400 mt-0.5">
                  {new Date(v.created_at).toLocaleString('pt-BR')}
                </p>
              </div>
              {!v.is_current && (
                <button
                  onClick={() => restoreVersion(v.id, v.version_number)}
                  disabled={restoringId === v.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                             text-zinc-700 bg-white border border-zinc-200 rounded-md
                             hover:bg-zinc-50 disabled:opacity-50 transition-colors"
                >
                  {restoringId === v.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} />
                  ) : (
                    <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.75} />
                  )}
                  Restaurar
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {showSnapshotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4">
          <div className="bg-white rounded-xl border border-zinc-200 w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-zinc-900 mb-1">Nova versão</h3>
            <p className="text-sm text-zinc-500 mb-4">
              Cria um snapshot do estado atual do agente. Use uma nota curta para descrever o que mudou.
            </p>
            <textarea
              value={deployNotes}
              onChange={(e) => setDeployNotes(e.target.value)}
              placeholder='Ex.: "ajustei tom mais formal"'
              rows={3}
              className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-md text-sm
                         focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowSnapshotModal(false)}
                disabled={savingVersion}
                className="px-3 py-2 text-sm font-medium text-zinc-700 bg-white border border-zinc-200
                           rounded-md hover:bg-zinc-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={createSnapshot}
                disabled={savingVersion}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white
                           bg-orange-500 rounded-md hover:bg-orange-600 disabled:opacity-50"
              >
                {savingVersion && (
                  <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />
                )}
                Criar versão
              </button>
            </div>
          </div>
        </div>
      )}
    </AgentSubPageShell>
  )
}
