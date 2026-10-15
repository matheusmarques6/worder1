'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bot, Orbit } from 'lucide-react'
import { useAuthStore } from '@/stores'
import { AgentsTheme } from '@/components/agents/ui/AgentsTheme'
import { Card } from '@/components/agents/ui/primitives'

/**
 * WhatsApp → Agente IA. Plano IA M2 passo 16: com vários agentes por loja
 * esta página deixa de editar "a" missão e vira a porta para os agentes que
 * atuam no WhatsApp — a lista com quem atende cada número e o link para a
 * configuração completa de cada um.
 */
export default function WhatsappAgentePage() {
  const { user } = useAuthStore()
  const organizationId = user?.organization_id as string | undefined
  const [agents, setAgents] = useState<Array<{ id: string; name: string | null; role: string | null; status: string; entries: Array<{ kind: string; label: string }> }>>([])

  useEffect(() => {
    if (!organizationId) return
    fetch(`/api/ai/agents?organization_id=${encodeURIComponent(organizationId)}`)
      .then((r) => (r.ok ? r.json() : { agents: [] }))
      .then((d) => setAgents(d.agents ?? []))
      .catch(() => {})
  }, [organizationId])

  const onWhatsApp = agents.filter((a) => a.entries.some((e) => e.kind === 'whatsapp_account'))

  return (
    <AgentsTheme>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.01em' }}>Agentes no WhatsApp</h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 2 }}>
            Quem responde cada número é o agente ligado a ele. A configuração mora em IA › Agentes.
          </p>
        </div>

        <Card style={{ padding: 16, display: 'grid', gap: 8 }}>
          {onWhatsApp.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>
              Nenhum agente ligado a um número ainda{agents.length > 0 ? ' — abra um agente e use "Definir onde atua".' : '.'}
            </p>
          ) : onWhatsApp.map((a) => (
            <Link key={a.id} href={`/ai/construtor/${a.id}`} className="act-row" style={{ textDecoration: 'none' }}>
              <Bot size={16} style={{ color: 'var(--text-3)' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="act-t">{a.name || 'Sem nome'}{a.status !== 'active' && ' · pausado'}</div>
                <div className="act-d">{a.entries.filter((e) => e.kind === 'whatsapp_account').map((e) => e.label).join(' · ')}</div>
              </div>
            </Link>
          ))}
        </Card>

        <Link href="/ai/agentes" className="btn btn-soft btn-sm" style={{ alignSelf: 'flex-start' }}>
          <Orbit size={14} />
          Todos os agentes
        </Link>
      </div>
    </AgentsTheme>
  )
}
