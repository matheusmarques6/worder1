'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase'
import { FlowBuilder, getFlowDataForSave } from '@/components/flow-builder'

export default function AutomationBuilderPage() {
  const router = useRouter()
  const params = useParams()
  const [automation, setAutomation] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const fetchAutomation = useCallback(async () => {
    if (!params.id) return
    try {
      setLoading(true)
      const supabase = createBrowserClient()
      const { data, error } = await supabase
        .from('automations')
        .select('*')
        .eq('id', params.id)
        .single()

      if (error) {
        console.error('Error fetching automation:', error.message)
        router.push('/automations')
        return
      }
      setAutomation(data)
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
      <FlowBuilder
        automationId={automation.id}
        automationName={automation.name}
        automationStatus={automation.status}
        initialNodes={automation.nodes || []}
        initialEdges={automation.edges || []}
        onSave={handleSave}
        onBack={handleBack}
      />
    </div>
  )
}
