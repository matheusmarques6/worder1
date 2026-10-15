'use client'

// IA › Construtor na sidebar: abre o Construtor do primeiro agente (no
// protótipo o Construtor sempre abre com um agente e troca pelo seletor
// AGENTE da paleta). Sem agente, vai para a criação.

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useAiOrganizationId } from '@/components/ai-hub/ai-context'

export default function BuilderIndexPage() {
  const organizationId = useAiOrganizationId()
  const router = useRouter()
  useEffect(() => {
    fetch(`/api/ai/agents?organization_id=${encodeURIComponent(organizationId)}`)
      .then((r) => (r.ok ? r.json() : { agents: [] }))
      .then((d) => {
        const first = (d.agents ?? [])[0]
        router.replace(first ? `/ai/construtor/${first.id}` : '/ai/agentes/novo')
      })
      .catch(() => router.replace('/ai/agentes'))
  }, [organizationId, router])
  return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Loader2 size={22} className="animate-spin" /></div>
}
