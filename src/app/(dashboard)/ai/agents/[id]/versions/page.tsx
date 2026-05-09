'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { GitBranch, RotateCcw, Check, FileText } from 'lucide-react'
import { AgentSubPageShell } from '@/components/ai/AgentSubPageShell'
import {
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  Badge,
  Spinner,
  Textarea,
} from '@/components/ai/ui/primitives'

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
  const [modalOpen, setModalOpen] = useState(false)
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
      setModalOpen(false)
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
      pageDescription="Cada publicação cria um snapshot. Reverta a qualquer momento."
      actions={
        <Button
          onClick={() => setModalOpen(true)}
          leadingIcon={<GitBranch className="w-3.5 h-3.5" strokeWidth={1.75} />}
        >
          Nova versão
        </Button>
      }
    >
      {error && (
        <Card className="mb-4 border-red-200 bg-red-50">
          <p className="text-[13px] text-red-700">{error}</p>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner />
        </div>
      ) : versions.length === 0 ? (
        <EmptyState
          title="Nenhuma versão ainda"
          description="Versões são criadas automaticamente quando você publica o agente."
        />
      ) : (
        <Card className="!p-0">
          <ul className="divide-y divide-[#F4F4F5]">
            {versions.map((v) => (
              <li key={v.id} className="flex items-center gap-4 px-7 py-5">
                <div className="inline-flex items-center justify-center w-9 h-9 rounded-[10px] bg-[#FAFAFA] border border-[#E4E4E7]">
                  <FileText className="w-4 h-4 text-[#71717A]" strokeWidth={1.75} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-semibold text-[#18181B]">
                      Versão #{v.version_number}
                    </span>
                    {v.is_current && (
                      <Badge tone="success">
                        <Check className="w-3 h-3" strokeWidth={1.75} />
                        Atual
                      </Badge>
                    )}
                  </div>
                  {v.deploy_notes && (
                    <p className="text-[12px] text-[#71717A] mt-0.5 truncate">
                      {v.deploy_notes}
                    </p>
                  )}
                  <p className="text-[11px] text-[#A1A1AA] mt-1">
                    {new Date(v.created_at).toLocaleString('pt-BR')}
                  </p>
                </div>
                {!v.is_current && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => restoreVersion(v.id, v.version_number)}
                    loading={restoringId === v.id}
                    leadingIcon={<RotateCcw className="w-3 h-3" strokeWidth={1.75} />}
                  >
                    Restaurar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Nova versão"
        description="Cria um snapshot do estado atual do agente."
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={savingVersion}>
              Cancelar
            </Button>
            <Button onClick={createSnapshot} loading={savingVersion}>
              Criar versão
            </Button>
          </>
        }
      >
        <Field label="Notas de deploy" hint="Descreva brevemente o que mudou (opcional).">
          <Textarea
            value={deployNotes}
            onChange={(e) => setDeployNotes(e.target.value)}
            placeholder='Ex.: "ajustei tom mais formal"'
            rows={3}
          />
        </Field>
      </Modal>
    </AgentSubPageShell>
  )
}
