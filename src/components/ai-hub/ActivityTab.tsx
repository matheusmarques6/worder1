'use client'

import { useState } from 'react'
import { BarChart3, ClipboardCheck } from 'lucide-react'
import { AgentsTheme } from '@/components/agents/ui/AgentsTheme'
import ReportsView from '@/components/agents/reports/ReportsView'
import EvalView from '@/components/agents/eval/EvalView'

/**
 * 10.3 — Avaliação e Atividade fundidas em "Atividade": Reports e Eval como
 * sub-views do mesmo lugar, um universo só (a seção "Conversas do runtime"
 * do 9.4 já vive dentro do ReportsView).
 */

export default function ActivityTab({ organizationId }: { organizationId: string }) {
  const [sub, setSub] = useState<'reports' | 'eval'>('reports')

  return (
    <AgentsTheme className="h-full flex flex-col" style={{ background: 'var(--bg)' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 22px',
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
      }}>
        <div className="seg-ctl">
          <button type="button" className={sub === 'reports' ? 'on' : ''} onClick={() => setSub('reports')}>
            <BarChart3 size={14} />Conversas & relatórios
          </button>
          <button type="button" className={sub === 'eval' ? 'on' : ''} onClick={() => setSub('eval')}>
            <ClipboardCheck size={14} />Avaliação
          </button>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {sub === 'reports'
          ? <ReportsView organizationId={organizationId} />
          : <EvalView organizationId={organizationId} />}
      </div>
    </AgentsTheme>
  )
}
