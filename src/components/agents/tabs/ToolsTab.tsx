'use client'

import { Wrench, Info, AlertTriangle } from 'lucide-react'
import { AIAgent, DEFAULT_SETTINGS } from '@/lib/ai/types'
import { TOOL_CATALOG } from '@/lib/ai/tools/catalog'
import { useStoreStore } from '@/stores'

interface ToolsTabProps {
  agent: AIAgent
  onUpdate: (updates: Partial<AIAgent>) => void
}

export default function ToolsTab({ agent, onUpdate }: ToolsTabProps) {
  // Mesmo padrão do SettingsTab: currentStore presente = loja Shopify conectada.
  const { currentStore } = useStoreStore()
  const hasStore = !!currentStore

  const settings = agent.settings || DEFAULT_SETTINGS
  const enabled = settings.tools?.enabled ?? []

  const toggleTool = (name: string) => {
    const next = enabled.includes(name)
      ? enabled.filter((n) => n !== name)
      : [...enabled, name]
    onUpdate({
      settings: { ...settings, tools: { enabled: next } },
    })
  }

  return (
    <div className="editor-content-inner space-y-6">
      {/* Header */}
      <div className="sec-head">
        <div className="sec-ico">
          <Wrench />
        </div>
        <div>
          <h3 className="sec-t">Ferramentas</h3>
          <p className="sec-s">Ações que a IA pode executar durante a conversa</p>
        </div>
      </div>

      <div className="callout">
        <Info className="w-4 h-4 flex-shrink-0" />
        <p>
          Ferramentas permitem que o agente aja de verdade: consultar pedidos, buscar
          produtos, transferir para um humano. Habilite apenas o que este agente
          precisa — menos ferramentas deixam as respostas mais rápidas e previsíveis.
          As mudanças valem após clicar em <strong>Salvar</strong>.
        </p>
      </div>

      {/* Lista de tools */}
      <div className="space-y-3">
        {TOOL_CATALOG.map((tool) => {
          const isOn = enabled.includes(tool.name)
          const missingStore = tool.requiresStore && !hasStore
          return (
            <div key={tool.name} className="rule-card">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm" style={{ color: 'var(--text)' }}>
                      {tool.label}
                    </span>
                    <code className="text-xs" style={{ color: 'var(--text-3)' }}>
                      {tool.name}
                    </code>
                    {tool.requiresStore && <span className="chip">Requer Shopify</span>}
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
                    {tool.description}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isOn}
                  aria-label={`Ativar ${tool.label}`}
                  onClick={() => toggleTool(tool.name)}
                  className={`tog ${isOn ? 'on' : ''}`}
                />
              </div>
              {isOn && missingStore && (
                <div className="callout red" style={{ marginTop: 10 }}>
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <p>
                    Nenhuma loja Shopify conectada nesta organização. A ferramenta fica
                    salva, mas o agente NÃO vai usá-la até uma loja ser conectada
                    (o sistema a omite automaticamente sem loja).
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="hint">
        {enabled.length === 0
          ? 'Nenhuma ferramenta habilitada — o agente apenas conversa, sem executar ações.'
          : `${enabled.length} ferramenta(s) habilitada(s).`}
      </p>
    </div>
  )
}
