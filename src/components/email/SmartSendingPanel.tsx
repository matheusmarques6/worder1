'use client'

import { cn } from '@/lib/utils'
import { ShieldCheck, Clock, UserMinus, Flame } from 'lucide-react'

export interface SmartSendingConfig {
  smartSendingEnabled: boolean
  smartSendingHours: number
  skipUnengaged: boolean
  skipUnengagedDays: number
  sendTimeOptimization: boolean
}

interface SmartSendingPanelProps {
  config: SmartSendingConfig
  onChange: (cfg: SmartSendingConfig) => void
}

const HOURS_OPTIONS = [8, 12, 16, 24, 48]
const DAYS_OPTIONS = [60, 90, 120, 180]

export default function SmartSendingPanel({ config, onChange }: SmartSendingPanelProps) {
  const update = (patch: Partial<SmartSendingConfig>) => onChange({ ...config, ...patch })

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-emerald-50">
            <ShieldCheck size={16} className="text-emerald-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Proteção de Entregabilidade</h3>
            <p className="text-xs text-gray-500 mt-0.5">Controles de envio como Klaviyo Smart Sending</p>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100 divide-y divide-gray-100">
        {/* Smart Sending */}
        <div className="px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <Clock size={16} className="text-gray-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-900">Smart Sending</p>
              <p className="text-xs text-gray-500">
                Pula contatos que receberam email nas últimas {config.smartSendingHours}h
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {config.smartSendingEnabled && (
              <select
                value={config.smartSendingHours}
                onChange={(e) => update({ smartSendingHours: Number(e.target.value) })}
                className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white"
              >
                {HOURS_OPTIONS.map(h => (
                  <option key={h} value={h}>{h}h</option>
                ))}
              </select>
            )}
            <button
              onClick={() => update({ smartSendingEnabled: !config.smartSendingEnabled })}
              className={cn(
                'relative w-10 h-6 rounded-full transition-colors',
                config.smartSendingEnabled ? 'bg-emerald-500' : 'bg-gray-200'
              )}
            >
              <span className={cn(
                'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm',
                config.smartSendingEnabled && 'translate-x-4'
              )} />
            </button>
          </div>
        </div>

        {/* Skip Unengaged */}
        <div className="px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <UserMinus size={16} className="text-gray-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-900">Pular Inativos</p>
              <p className="text-xs text-gray-500">
                Ignora contatos sem abertura nos últimos {config.skipUnengagedDays} dias
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {config.skipUnengaged && (
              <select
                value={config.skipUnengagedDays}
                onChange={(e) => update({ skipUnengagedDays: Number(e.target.value) })}
                className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white"
              >
                {DAYS_OPTIONS.map(d => (
                  <option key={d} value={d}>{d} dias</option>
                ))}
              </select>
            )}
            <button
              onClick={() => update({ skipUnengaged: !config.skipUnengaged })}
              className={cn(
                'relative w-10 h-6 rounded-full transition-colors',
                config.skipUnengaged ? 'bg-emerald-500' : 'bg-gray-200'
              )}
            >
              <span className={cn(
                'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm',
                config.skipUnengaged && 'translate-x-4'
              )} />
            </button>
          </div>
        </div>

        {/* Send Time Optimization */}
        <div className="px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <Flame size={16} className="text-gray-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-900">Otimização de Horário</p>
              <p className="text-xs text-gray-500">
                Envia no melhor horário de cada contato (baseado em aberturas)
              </p>
            </div>
          </div>
          <button
            onClick={() => update({ sendTimeOptimization: !config.sendTimeOptimization })}
            className={cn(
              'relative w-10 h-6 rounded-full transition-colors',
              config.sendTimeOptimization ? 'bg-emerald-500' : 'bg-gray-200'
            )}
          >
            <span className={cn(
              'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm',
              config.sendTimeOptimization && 'translate-x-4'
            )} />
          </button>
        </div>
      </div>
    </div>
  )
}
