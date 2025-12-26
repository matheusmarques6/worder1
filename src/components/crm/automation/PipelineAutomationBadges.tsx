'use client'

// =============================================
// Pipeline Automation Badges
// src/components/crm/automation/PipelineAutomationBadges.tsx
//
// Mostra badges indicando quais integrações alimentam a pipeline
// =============================================

import { ShoppingCart, MessageCircle, FileText, Link, Flame, ShoppingBag } from 'lucide-react'

interface AutomationRule {
  id: string
  source_type: string
  trigger_event: string
  is_enabled: boolean
}

interface PipelineAutomationBadgesProps {
  rules: AutomationRule[]
  compact?: boolean
}

const INTEGRATION_CONFIG: Record<string, { icon: any; color: string; bgColor: string; name: string }> = {
  shopify: {
    icon: ShoppingCart,
    color: 'text-green-400',
    bgColor: 'bg-green-500/20',
    name: 'Shopify'
  },
  whatsapp: {
    icon: MessageCircle,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/20',
    name: 'WhatsApp'
  },
  hotmart: {
    icon: Flame,
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/20',
    name: 'Hotmart'
  },
  woocommerce: {
    icon: ShoppingBag,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/20',
    name: 'WooCommerce'
  },
  form: {
    icon: FileText,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
    name: 'Formulário'
  },
  webhook: {
    icon: Link,
    color: 'text-gray-400',
    bgColor: 'bg-gray-500/20',
    name: 'Webhook'
  },
}

export function PipelineAutomationBadges({ rules, compact = false }: PipelineAutomationBadgesProps) {
  if (!rules || rules.length === 0) {
    return (
      <span className="text-dark-600 text-xs">
        Sem automações
      </span>
    )
  }

  // Agrupar regras ativas por fonte
  const activeRules = rules.filter(r => r.is_enabled)
  const rulesBySource = activeRules.reduce((acc, rule) => {
    if (!acc[rule.source_type]) {
      acc[rule.source_type] = []
    }
    acc[rule.source_type].push(rule)
    return acc
  }, {} as Record<string, AutomationRule[]>)

  if (Object.keys(rulesBySource).length === 0) {
    return (
      <span className="text-dark-600 text-xs">
        Automações inativas
      </span>
    )
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {Object.entries(rulesBySource).map(([sourceType, sourceRules]) => {
        const config = INTEGRATION_CONFIG[sourceType]
        if (!config) return null

        const Icon = config.icon

        return (
          <div
            key={sourceType}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${config.bgColor} ${config.color} text-xs`}
            title={`${sourceRules.length} regra(s) de ${config.name}`}
          >
            <Icon className="w-3 h-3" />
            {!compact && (
              <>
                <span>{config.name}</span>
                {sourceRules.length > 1 && (
                  <span className="opacity-60">({sourceRules.length})</span>
                )}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default PipelineAutomationBadges
