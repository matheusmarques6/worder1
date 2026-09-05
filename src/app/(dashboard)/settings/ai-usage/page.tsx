'use client'

// Configurações → Uso de IA: chamadas, tokens e custo dos agentes de IA.

import { useState } from 'react'
import { Card, Title, LoadingCard, Meter, Tabs } from '@/components/settings/ui'
import { nf, money } from '@/components/settings/format'
import { useApi } from '@/components/settings/hooks'

interface Resp {
  period: string
  totals: { calls: number; successful: number; failed: number; promptTokens: number; completionTokens: number; totalTokens: number; costUsd: number; avgDurationMs: number }
  grouped: Array<{ key: string; calls: number; tokens: number; costUsd: number }>
  budget: { allowed: boolean; budgetUsd: number | null; spentUsd: number; usedPct?: number } | null
}
type Period = '24h' | '7d' | '30d' | '90d'
type Group = 'day' | 'model' | 'feature'

export default function AiUsageSettingsPage() {
  const [period, setPeriod] = useState<Period>('30d')
  const [group, setGroup] = useState<Group>('feature')
  const { data, loading, error, reload } = useApi<Resp>(`/api/ai/usage?period=${period}&group_by=${group}`, [period, group])
  const usd = (v: number) => money(v, 'USD', v < 1 ? 4 : 2)

  return (
    <>
      <Title h="Uso de IA" p="Chamadas, tokens e custo dos agentes de IA e recursos inteligentes." right={<Tabs value={period} onChange={setPeriod} options={[['24h', '24 h'], ['7d', '7 dias'], ['30d', '30 dias'], ['90d', '90 dias']]} />} />
      {loading && !data ? <><LoadingCard rows={2} /><LoadingCard rows={4} /></> : error || !data ? (
        <Card><div className="empty2"><b>Não foi possível carregar</b>{error}<div><button className="btn" onClick={() => reload()}>Tentar de novo</button></div></div></Card>
      ) : (
        <>
          <Card flush>
            <div className="use">
              <Meter label="Chamadas" right={data.totals.failed ? `${nf(data.totals.failed)} com erro` : undefined} value={nf(data.totals.calls)} suffix={data.totals.calls ? `${Math.round((data.totals.successful / data.totals.calls) * 100)}% ok` : undefined} pct={data.totals.calls ? Math.round((data.totals.successful / data.totals.calls) * 100) : 0} tone="good" />
              <Meter label="Tokens" right={`${nf(data.totals.promptTokens)} entrada · ${nf(data.totals.completionTokens)} saída`} value={nf(data.totals.totalTokens)} pct={data.totals.totalTokens ? Math.round((data.totals.completionTokens / data.totals.totalTokens) * 100) : 0} />
              <Meter label="Custo" right={data.budget?.budgetUsd ? `orçamento ${usd(data.budget.budgetUsd)}` : 'sem orçamento definido'} value={usd(data.totals.costUsd)} suffix={data.totals.avgDurationMs ? `${nf(data.totals.avgDurationMs)} ms média` : undefined} pct={data.budget?.budgetUsd ? Math.min(100, Math.round((data.budget.spentUsd / data.budget.budgetUsd) * 100)) : 0} tone={data.budget && data.budget.budgetUsd && data.budget.spentUsd > data.budget.budgetUsd ? 'over' : undefined} />
            </div>
            {data.budget && !data.budget.allowed && <div className="sc-f"><span className="hint err">Orçamento de IA esgotado — os agentes pausam até o próximo ciclo ou até o limite ser aumentado.</span></div>}
          </Card>
          <Card title="Detalhamento" desc="Custo por recurso, modelo ou dia." right={<Tabs value={group} onChange={setGroup} options={[['feature', 'Recurso'], ['model', 'Modelo'], ['day', 'Dia']]} />} flush>
            {data.grouped.length === 0 ? <div className="empty2"><b>Sem uso de IA no período</b>Ative um agente de IA ou use a geração de conteúdo para ver os custos aqui.</div> : (
              <div className="tw"><table className="stbl">
                <thead><tr><th>{group === 'day' ? 'Dia' : group === 'model' ? 'Modelo' : 'Recurso'}</th><th className="r">Chamadas</th><th className="r hm">Tokens</th><th className="r">Custo</th><th style={{ width: 200 }} className="hm"></th></tr></thead>
                <tbody>
                  {data.grouped.map((g) => {
                    const max = Math.max(...data.grouped.map((x) => x.costUsd), 0.000001)
                    return (
                      <tr key={g.key}>
                        <td className="fx"><span className="nm">{group === 'day' ? new Date(g.key).toLocaleDateString('pt-BR') : g.key}</span></td>
                        <td className="r">{nf(g.calls)}</td>
                        <td className="r hm">{nf(g.tokens)}</td>
                        <td className="r">{usd(g.costUsd)}</td>
                        <td className="hm"><div className="bar" style={{ height: 6, borderRadius: 3, background: 'var(--surface-3)', overflow: 'hidden' }}><i style={{ display: 'block', height: '100%', width: `${Math.round((g.costUsd / max) * 100)}%`, background: 'var(--acc)' }} /></div></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table></div>
            )}
          </Card>
        </>
      )}
    </>
  )
}
