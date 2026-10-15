'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Hammer, Loader2 } from 'lucide-react'
import { useAiOrganizationId } from '@/components/ai-hub/AiShell'

// Plano IA M6 passo 32: escolha qual agente abrir no Construtor (com um só,
// abre direto).
export default function BuilderIndexPage() {
  const organizationId = useAiOrganizationId()
  const router = useRouter()
  const [agents, setAgents] = useState<Array<{ id: string; name: string | null; role: string | null }> | null>(null)
  useEffect(() => {
    fetch(`/api/ai/agents?organization_id=${encodeURIComponent(organizationId)}`)
      .then((r) => (r.ok ? r.json() : { agents: [] }))
      .then((d) => {
        const list = d.agents ?? []
        if (list.length === 1) router.replace(`/ai/construtor/${list[0].id}`)
        else setAgents(list)
      })
      .catch(() => setAgents([]))
  }, [organizationId, router])
  if (agents === null) return <div style={{ padding: 24 }}><Loader2 size={18} className="animate-spin" /></div>
  return (
    <div style={{ padding: 22, maxWidth: 720, margin: '0 auto', width: '100%', display: 'grid', gap: 10 }}>
      <div style={{ fontSize: 18, fontWeight: 800, display: 'flex', gap: 8, alignItems: 'center' }}><Hammer size={18} />Construtor</div>
      {agents.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Nenhum agente ainda. <Link href="/ai/agentes/novo" style={{ color: 'var(--brand)' }}>Criar o primeiro</Link>.</p>
      ) : agents.map((a) => (
        <Link key={a.id} href={`/ai/construtor/${a.id}`} className="act-row" style={{ textDecoration: 'none' }}>
          <div style={{ flex: 1 }}><div className="act-t">{a.name || 'Sem nome'}</div><div className="act-d">{a.role || 'Sem função definida'}</div></div>
        </Link>
      ))}
    </div>
  )
}
