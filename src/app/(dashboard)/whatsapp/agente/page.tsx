'use client'

import Link from 'next/link'
import { Orbit } from 'lucide-react'
import { AgentsTheme } from '@/components/agents/ui/AgentsTheme'
import { Card } from '@/components/agents/ui/primitives'
import { AgentPowerSwitch, DiscoveryMissionArea } from '@/components/ai-hub/AreaFields'

/**
 * WhatsApp → Agente IA (pedido 17/08): a missão do WhatsApp direto se
 * configura DENTRO da aba WhatsApp. Mesma fonte de dados da órbita — um dado,
 * N portas: os componentes são os MESMOS da área "Missão · WhatsApp direto"
 * do IA Hub, então editar aqui ou lá edita a mesma especificação.
 */
export default function WhatsappAgentePage() {
  return (
    <AgentsTheme>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.01em' }}>
            Agente no WhatsApp
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 2 }}>
            Quando um cliente chama a loja direto no WhatsApp, o agente responde
            seguindo a missão deste evento — configure-a aqui.
          </p>
        </div>

        <Card style={{ padding: 16 }}>
          <AgentPowerSwitch />
        </Card>

        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 10 }}>
            Missão · WhatsApp direto
          </div>
          <DiscoveryMissionArea />
        </Card>

        <Link href="/ai" className="btn btn-soft btn-sm" style={{ alignSelf: 'flex-start' }}>
          <Orbit size={14} />
          Configuração completa do agente (órbita)
        </Link>
      </div>
    </AgentsTheme>
  )
}
