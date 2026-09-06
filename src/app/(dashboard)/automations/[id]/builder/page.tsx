'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { FlowBuilder, getFlowDataForSave } from '@/components/flow-builder'
import MomentBanner from '@/components/ai-hub/MomentBanner'

export default function AutomationBuilderPage() {
  const router = useRouter()
  const params = useParams()
  const [automation, setAutomation] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const fetchAutomation = useCallback(async () => {
    if (!params.id) return
    try {
      setLoading(true)
      // Pela API, que tem a sessão e cerca por organização.
      const res = await fetch(`/api/automations/${params.id}`)
      if (!res.ok) {
        console.error('Error fetching automation:', res.status)
        router.push('/automations')
        return
      }
      const data = await res.json()
      setAutomation(data.automation ?? data)
    } catch (err) {
      console.error('Failed to fetch automation:', err)
      router.push('/automations')
    } finally {
      setLoading(false)
    }
  }, [params.id, router])

  useEffect(() => {
    fetchAutomation()
  }, [fetchAutomation])

  const handleSave = async (): Promise<string | undefined> => {
    if (!automation) return undefined
    const flowData = getFlowDataForSave()

    const triggerNode = flowData.nodes.find((n: any) => n.type?.startsWith('trigger_'))
    const payload = {
      id: automation.id,
      name: flowData.name,
      description: automation.description,
      trigger_type: flowData.trigger_type,
      trigger_config: triggerNode?.data?.config || {},
      trigger_filters: flowData.trigger_filters,
      audience_filters: flowData.audience_filters,
      exit_conditions: flowData.exit_conditions,
      frequency_config: flowData.frequency_config,
      nodes: flowData.nodes,
      edges: flowData.edges,
      status: flowData.status,
    }

    try {
      const res = await fetch('/api/automations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (res.ok && data.automation) {
        setAutomation(data.automation)
        return data.automation.id
      } else {
        console.error('Error saving automation:', data.error)
        return undefined
      }
    } catch (err) {
      console.error('Error saving automation:', err)
      return undefined
    }
  }

  const handleBack = () => {
    router.push(`/automations/${params.id}`)
  }

  if (loading || !automation) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-white">
      {/* 10.8 — momento ativo visível onde o fluxo é editado (leitura) */}
      <div style={{ position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)', zIndex: 50, width: 'min(560px, 90%)', pointerEvents: 'none' }}>
        <MomentBanner />
      </div>
      <FlowBuilder
        automationId={automation.id}
        automationName={automation.name}
        automationStatus={automation.status}
        automationStoreId={automation.store_id || undefined}
        initialNodes={automation.nodes || []}
        initialEdges={automation.edges || []}
        onSave={handleSave}
        onBack={handleBack}
        // Sem organizationId os selects dependentes de org (lojas,
        // listas, pipelines, popups) ficavam vazios nesta rota — o
        // overlay de /automations sempre passou; aqui faltava.
        organizationId={automation.organization_id || undefined}
      />
    </div>
  )
}
