'use client'

import { useEffect, useState } from 'react'
import { Check, Plus, Power, ShieldCheck, X } from 'lucide-react'
import KnowledgeBasePanel from '@/components/agents/KnowledgeBasePanel'
import ApiKeysManager from '@/components/whatsapp/ApiKeysManager'
import CustomToolsSection from './CustomToolsSection'
import {
  type CustomJudge,
  type HubAreaId,
  type HubState,
} from '@/lib/ai/agent-hub'
import { TOOL_CATALOG } from '@/lib/ai/tools/catalog'
import MissionEditorModal from '@/components/flow-builder/panels/MissionEditorModal'
import { describeConcession, type Mission } from '@/lib/ai/missions'

/**
 * Os campos de cada área da órbita (10.2) — os MESMOS campos na radial (drawer)
 * e na clássica (um dado, N portas). Tudo aqui escreve no HubState; quem
 * persiste é o AgentTab (PATCH do agente + versão nova da missão descoberta).
 */

const VOICES = [
  { v: 'casual', t: 'Casual' },
  { v: 'friendly', t: 'Amigável' },
  { v: 'professional', t: 'Profissional' },
  { v: 'luxury', t: 'Luxo' },
] as const

const PRESENTATIONS = [
  { v: 'transparente', t: 'Transparente', d: '"Sou a assistente virtual da loja" — deixa claro que é IA' },
  { v: 'nome_funcao', t: 'Nome + função', d: '"Oi, aqui é a Duda, do time" — sem citar IA espontaneamente' },
  { v: 'discreta', t: 'Discreta', d: 'Só responde; se apresenta apenas se perguntarem' },
] as const

const ADAPT_TOGGLES: Array<{ k: keyof HubState['adapt']; t: string; d: string }> = [
  { k: 'mirror_tone', t: 'Espelhar o tom do cliente', d: 'Formal com quem é formal, leve com quem é leve' },
  { k: 'mirror_length', t: 'Adaptar o tamanho das respostas', d: 'Mensagens curtas para quem escreve pouco' },
  { k: 'emoji_if_client', t: 'Usar emoji se o cliente usa', d: 'Nunca inicia com emoji por conta própria' },
  { k: 'insist_less_after_complaint', t: 'Insistir menos com quem já reclamou', d: 'Reclamação recente baixa a pressão comercial' },
  { k: 'distinct_greeting_repeat_buyer', t: 'Saudação distinta para quem já comprou', d: 'Comprador recorrente não é tratado como primeira compra' },
]

const BASE_LENGTHS = [
  { v: 'short', t: 'Curto' },
  { v: 'medium', t: 'Médio' },
  { v: 'long', t: 'Longo' },
] as const

const SUGGESTED_BLOCKED = ['Concorrentes', 'Política / religião', 'Diagnósticos de saúde', 'Promessas de prazo']

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 7 }}>
      {children}
    </label>
  )
}

function ChipListEditor({
  value, onChange, red, suggestions, placeholder,
}: {
  value: string[]
  onChange: (next: string[]) => void
  red?: boolean
  suggestions?: string[]
  placeholder: string
}) {
  const [draft, setDraft] = useState('')
  const add = (item: string) => {
    const clean = item.trim()
    if (clean && !value.includes(clean)) onChange([...value, clean])
    setDraft('')
  }
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {value.map((item) => (
          <button key={item} type="button" className={`pickchip${red ? ' red' : ''} on`} onClick={() => onChange(value.filter((x) => x !== item))}>
            <X size={12} />{item}
          </button>
        ))}
        {(suggestions ?? []).filter((s) => !value.includes(s)).map((s) => (
          <button key={s} type="button" className="pickchip" onClick={() => add(s)}>
            <Plus size={12} />{s}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 9 }}>
        <input
          className="field"
          style={{ height: 34, fontSize: 12.5, flex: 1 }}
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(draft) } }}
        />
        <button type="button" className="btn btn-soft btn-sm" onClick={() => add(draft)} disabled={!draft.trim()}>
          <Plus size={14} />Adicionar
        </button>
      </div>
    </div>
  )
}

export interface AreaFieldsProps {
  area: HubAreaId
  hub: HubState
  onChange: (next: HubState) => void
  organizationId: string
  agentId: string | null
}

export default function AreaFields({ area, hub, onChange, organizationId, agentId }: AreaFieldsProps) {
  // keyof HubState (não HubAreaId): "delivery" é dado do hub sem nó próprio
  // na órbita — mora dentro da área Adaptação (Pacote B 17/08).
  const patch = <K extends keyof HubState>(key: K, value: HubState[K]) =>
    onChange({ ...hub, [key]: value })

  if (area === 'identity') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <Label>Nome do agente</Label>
          <input className="field" value={hub.identity.name} placeholder="ex.: Duda"
            onChange={(e) => patch('identity', { ...hub.identity, name: e.target.value })} />
        </div>
        <div>
          <Label>Voz</Label>
          <div className="seg-ctl" style={{ flexWrap: 'wrap' }}>
            {VOICES.map((o) => (
              <button key={o.v} type="button" className={hub.identity.voice === o.v ? 'on' : ''}
                onClick={() => patch('identity', { ...hub.identity, voice: o.v })}>{o.t}</button>
            ))}
          </div>
        </div>
        <div>
          <Label>Apresentação</Label>
          <div className="optrow">
            {PRESENTATIONS.map((o) => (
              <button key={o.v} type="button" className={`hub-opt${hub.identity.presentation === o.v ? ' on' : ''}`}
                onClick={() => patch('identity', { ...hub.identity, presentation: o.v })}>
                <div><div>{o.t}</div><div className="od">{o.d}</div></div>
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 9, display: 'flex', gap: 6, alignItems: 'center' }}>
            <ShieldCheck size={13} style={{ color: 'var(--green)' }} />
            Em qualquer modo, se perguntarem, o agente nunca nega ser IA — linha fixa do compilador, fora do alcance da configuração.
          </div>
        </div>
      </div>
    )
  }

  if (area === 'discovery') {
    // Correção 13/08: missão é a ESPECIFICAÇÃO do evento — aqui o evento é
    // "o cliente chamou a loja direto no WhatsApp", e o que se edita é o
    // playbook completo dele, não um seletor de persona.
    return <DiscoveryMissionArea />
  }

  if (area === 'adapt') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {ADAPT_TOGGLES.map((t) => (
          <div key={t.k} className={`act-row${hub.adapt[t.k] ? ' on' : ''}`}>
            <div style={{ flex: 1 }}>
              <div className="act-t">{t.t}</div>
              <div className="act-d">{t.d}</div>
            </div>
            <button type="button" className={`tog${hub.adapt[t.k] ? ' on' : ''}`}
              onClick={() => patch('adapt', { ...hub.adapt, [t.k]: !hub.adapt[t.k] })} />
          </div>
        ))}
        <div>
          <Label>Tamanho padrão da resposta</Label>
          <div className="seg-ctl">
            {BASE_LENGTHS.map((o) => (
              <button key={o.v} type="button" className={hub.adapt.base_length === o.v ? 'on' : ''}
                onClick={() => patch('adapt', { ...hub.adapt, base_length: o.v })}>{o.t}</button>
            ))}
          </div>
        </div>
        {/* Entrega (Pacote B 17/08): COMO a resposta chega — agrupamento de
            rajada e humanização, por loja (settings.delivery). */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <Label>Entrega</Label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
            <div className="act-row on" style={{ alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div className="act-t">Esperar para agrupar mensagens</div>
                <div className="act-d">
                  Rajada do cliente vira UMA resposta com contexto — segundos de espera.
                </div>
              </div>
              <input
                className="field"
                type="number"
                min={3}
                max={60}
                style={{ width: 76, textAlign: 'center' }}
                value={hub.delivery.debounce_seconds}
                onChange={(e) =>
                  patch('delivery', {
                    ...hub.delivery,
                    debounce_seconds: Number(e.target.value),
                  })
                }
              />
            </div>
            <div className={`act-row${hub.delivery.split_bubbles ? ' on' : ''}`}>
              <div style={{ flex: 1 }}>
                <div className="act-t">Dividir respostas em bolhas</div>
                <div className="act-d">Parágrafos viram mensagens separadas (até 4).</div>
              </div>
              <button type="button" className={`tog${hub.delivery.split_bubbles ? ' on' : ''}`}
                onClick={() => patch('delivery', { ...hub.delivery, split_bubbles: !hub.delivery.split_bubbles })} />
            </div>
            <div className={`act-row${hub.delivery.typing_rhythm ? ' on' : ''}`}>
              <div style={{ flex: 1 }}>
                <div className="act-t">Ritmo de digitação humano</div>
                <div className="act-d">Pausa proporcional ao tamanho entre uma bolha e outra.</div>
              </div>
              <button type="button" className={`tog${hub.delivery.typing_rhythm ? ' on' : ''}`}
                onClick={() => patch('delivery', { ...hub.delivery, typing_rhythm: !hub.delivery.typing_rhythm })} />
            </div>
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
          Adaptação muda o <b>estilo</b>, nunca o dinheiro — desconto e benefício vivem nas missões.
        </div>
      </div>
    )
  }

  if (area === 'knowledge') {
    // Punch 8: o nó da órbita abre o MESMO componente da tela de Conhecimento
    // (um dado, N portas) — nada reimplementado.
    return <KnowledgeBasePanel organizationId={organizationId} />
  }

  if (area === 'tools') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {TOOL_CATALOG.map((tool) => {
          const on = hub.tools.enabled.includes(tool.name)
          return (
            <div key={tool.name} className={`act-row${on ? ' on' : ''}`}>
              <div style={{ flex: 1 }}>
                <div className="act-t">{tool.label}</div>
                <div className="act-d">{tool.description}</div>
              </div>
              <button type="button" className={`tog${on ? ' on' : ''}`}
                onClick={() => patch('tools', {
                  enabled: on
                    ? hub.tools.enabled.filter((n) => n !== tool.name)
                    : [...hub.tools.enabled, tool.name],
                })} />
            </div>
          )
        })}
        <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
          No runtime novo, create_coupon só chega ao modelo se a missão do turno também a permitir (interseção missão∩agente).
        </div>
        {/* 10.7 — as tools custom, no mesmo drawer */}
        <CustomToolsSection />
      </div>
    )
  }

  if (area === 'limits') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <Label>Tópicos bloqueados</Label>
          <ChipListEditor red value={hub.limits.blocked} suggestions={SUGGESTED_BLOCKED}
            placeholder="ex.: uso medicinal"
            onChange={(blocked) => patch('limits', { ...hub.limits, blocked })} />
        </div>
        <div>
          <Label>Invariantes do lojista</Label>
          <ChipListEditor value={hub.limits.invariants}
            placeholder="ex.: Nunca prometer prazo menor que o dos Correios"
            onChange={(invariants) => patch('limits', { ...hub.limits, invariants })} />
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 8 }}>
            Cada invariante vira uma linha do prompt (guidelines). Limites de dinheiro moram nas missões.
          </div>
        </div>
        {/* Corte 13/08: a aba Limites morreu — o interruptor mora aqui agora. */}
        <AgentPowerSwitch />
      </div>
    )
  }

  if (area === 'handoff') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <Label>Palavras que transferem para humano</Label>
          <ChipListEditor value={hub.handoff.keywords}
            placeholder="ex.: falar com atendente"
            onChange={(keywords) => patch('handoff', { ...hub.handoff, keywords })} />
        </div>
        <div>
          <Label>Mensagem de transição (opcional)</Label>
          <input className="field" value={hub.handoff.message}
            placeholder="ex.: Vou te passar para alguém do time, um instante!"
            onChange={(e) => patch('handoff', { ...hub.handoff, message: e.target.value })} />
        </div>
      </div>
    )
  }

  if (area === 'judges') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="act-row on">
          <div style={{ flex: 1 }}>
            <div className="act-t" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              Judge 1 — pré-envio <span className="chip" style={{ height: 20, fontSize: 10.5, padding: '0 8px' }}>obrigatório</span>
            </div>
            <div className="act-d">
              Avalia 100% das respostas antes do envio, com até 2 regenerações. Reprovou, nada sai — o silêncio vira alerta.
            </div>
          </div>
          <Check size={16} style={{ color: 'var(--green)' }} />
        </div>

        <MerchantJudges
          judges={hub.judges.custom}
          onChange={(custom) => patch('judges', { custom })}
        />

        <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
          Seu juiz entra no MESMO portão pré-envio: reprovou, o agente reescreve
          (até 2x) sabendo qual critério falhou. Ele nunca silencia o agente — o
          veto de segurança é só da plataforma. Vale após Salvar.
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <Label>Modelo</Label>
        <input className="field" value={hub.budget.model}
          onChange={(e) => patch('budget', { ...hub.budget, model: e.target.value })} />
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 7 }}>
          Provedor: <b>{hub.budget.provider}</b> — sem chave da organização (BYO), o agente não ativa no runtime novo.
        </div>
      </div>
      {/* 10.3: API Keys absorvida pela área Motor — o gerenciador real, aqui. */}
      <ApiKeysManager />
    </div>
  )
}

// A missão do evento "cliente chamou a loja direto no WhatsApp"
// (whatsapp.received). Correção 13/08: missão é especificação POR EVENTO —
// esta área mostra a especificação vigente e abre o MESMO editor completo do
// nó de fluxo (MissionEditorModal). Salvar cria rascunho; ativar é explícito
// e arquiva a anterior. Sem ativa, o agente não responde inbound.
export function DiscoveryMissionArea() {
  const FAMILY = 'whatsapp.received'
  const [missions, setMissions] = useState<Mission[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState<{ mission: Mission | null } | null>(null)

  const load = async () => {
    try {
      const res = await fetch('/api/ai/missions')
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Falha ao carregar a missão')
      setMissions(
        (body.missions ?? []).filter((m: Mission) => m.event_type === FAMILY)
      )
      setError(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const active = missions.find((m) => m.status === 'active') ?? null
  const latestDraft = missions.find((m) => m.status === 'draft') ?? null

  const activate = async (missionId: string) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/ai/missions/${missionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || 'Falha ao ativar')
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <Loader2AreaSpinner />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
        A especificação deste <b>evento</b>: o cliente chamou a loja direto no
        WhatsApp. É ela que dirige a resposta — objetivo, critérios, o que
        nunca fazer, concessão, insistência.
      </div>

      {active ? (
        <div className="act-row on" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="act-t">{active.display_name || 'Missão ativa'}</div>
            <div className="act-d" style={{ marginTop: 2 }}>{active.objective}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
              {describeConcession(active.concession)} · até {active.max_turns} turnos ·{' '}
              {active.topic_change_policy}
              {(active.forbidden ?? []).length > 0 &&
                ` · ${(active.forbidden ?? []).length} proibição(ões)`}
            </div>
          </div>
          <Check size={16} style={{ color: 'var(--green)', flexShrink: 0 }} />
        </div>
      ) : (
        <div className="callout red" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
          <p style={{ fontWeight: 700 }}>Sem missão ativa para este evento</p>
          <p>O agente NÃO responde quem chama a loja — de propósito: sem especificação, silêncio e alerta, nunca improviso.</p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {active && (
          <button type="button" className="btn btn-soft btn-sm" disabled={busy}
            onClick={() => setEditorOpen({ mission: active })}>
            Editar especificação (nova versão)
          </button>
        )}
        {!active && !latestDraft && (
          <button type="button" className="btn btn-primary btn-sm" disabled={busy}
            onClick={() => setEditorOpen({ mission: null })}>
            <Plus size={14} />Criar a missão deste evento
          </button>
        )}
      </div>

      {latestDraft && (
        <div className="act-row" style={{ borderColor: 'var(--amber, #E0930B)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="act-t">Rascunho aguardando</div>
            <div className="act-d">{latestDraft.objective}</div>
          </div>
          <button type="button" className="btn btn-soft btn-sm" disabled={busy}
            onClick={() => setEditorOpen({ mission: latestDraft })}>
            Editar
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={busy}
            onClick={() => void activate(latestDraft.id)}>
            {busy ? 'Ativando…' : 'Ativar'}
          </button>
        </div>
      )}

      {error && <p style={{ fontSize: 12, color: 'var(--red)' }}>{error}</p>}

      <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
        Mesma lei das missões dos fluxos: editar cria uma versão rascunho;
        ativar arquiva a anterior. Toques disparados por fluxo têm cada um a
        SUA missão, no próprio nó.
      </div>

      {editorOpen && (
        <MissionEditorModal
          family={FAMILY}
          mission={editorOpen.mission}
          onClose={() => setEditorOpen(null)}
          onSaved={async () => {
            setEditorOpen(null)
            await load()
          }}
        />
      )}
    </div>
  )
}

function Loader2AreaSpinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '22px 0' }}>
      <span className="animate-spin" style={{ width: 20, height: 20, border: '2px solid var(--border-strong)', borderTopColor: 'var(--brand)', borderRadius: '50%' }} />
    </div>
  )
}

// O interruptor do agente inteiro (ai_agents.is_active) — morava na aba
// Limites, que morreu no corte 13/08. Kill-switch não espera Salvar: o PATCH
// é imediato, como era lá.
export function AgentPowerSwitch() {
  const [agentId, setAgentId] = useState<string | null>(null)
  const [active, setActive] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/ai/agents/canonical')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        setAgentId(data.canonical?.id ?? null)
        setActive(data.canonical ? data.canonical.is_active !== false : null)
      })
      .catch(() => { if (!cancelled) setActive(null) })
    return () => { cancelled = true }
  }, [])

  if (agentId === null || active === null) return null

  const toggle = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/ai/agents/${agentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !active }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || 'Falha ao mudar o estado do agente')
      setActive(!active)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`act-row${active ? ' on' : ''}`}>
      <Power size={17} style={{ color: active ? 'var(--green)' : 'var(--red)' }} />
      <div style={{ flex: 1 }}>
        <div className="act-t">{active ? 'Agente ligado' : 'Agente desligado'}</div>
        <div className="act-d">
          {error ?? 'Desligado, nenhuma missão responde — toque pedido vira alerta, nada sai.'}
        </div>
      </div>
      <button type="button" className={`tog${active ? ' on' : ''}`} disabled={busy}
        onClick={() => void toggle()} />
    </div>
  )
}

// Os juízes do lojista (settings.judges.custom). Cada um vira critério REAL
// do Judge 1 no runtime — severidade sempre standard: reprova e regenera,
// nunca silencia (o veto crítico é da plataforma, D1).
function MerchantJudges({
  judges, onChange,
}: {
  judges: CustomJudge[]
  onChange: (next: CustomJudge[]) => void
}) {
  const [draft, setDraft] = useState<{ name: string; criterion: string } | null>(null)

  const create = () => {
    if (!draft || !draft.criterion.trim()) return
    onChange([
      ...judges,
      {
        id: `judge-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
        name: draft.name.trim(),
        criterion: draft.criterion.trim(),
        active: true,
      },
    ])
    setDraft(null)
  }

  return (
    <div>
      <Label>Seus juízes</Label>
      {judges.length === 0 && !draft && (
        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 9px' }}>
          Nenhum ainda. Crie um critério que toda resposta deve cumprir — ex.: nunca usar gíria.
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {judges.map((judge) => (
          <div key={judge.id} className={`act-row${judge.active ? ' on' : ''}`}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="act-t">{judge.name || 'Juiz sem nome'}</div>
              <div className="act-d">{judge.criterion}</div>
            </div>
            <button
              type="button"
              className={`tog${judge.active ? ' on' : ''}`}
              title={judge.active ? 'Pausar este juiz' : 'Reativar este juiz'}
              onClick={() =>
                onChange(judges.map((j) => (j.id === judge.id ? { ...j, active: !j.active } : j)))
              }
            />
            <button
              type="button"
              className="btn btn-soft btn-icon btn-sm"
              title="Excluir este juiz"
              onClick={() => onChange(judges.filter((j) => j.id !== judge.id))}
            >
              <X size={14} />
            </button>
          </div>
        ))}

        {draft ? (
          <div className="card" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              className="field"
              style={{ height: 34, fontSize: 12.5 }}
              autoFocus
              placeholder="Nome (ex.: Tom formal)"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <textarea
              className="field"
              rows={3}
              style={{ fontSize: 12.5, resize: 'vertical', height: 'auto', paddingTop: 9 }}
              placeholder="O critério que toda resposta deve cumprir — ex.: Nunca usar gíria; tratar o cliente por você."
              value={draft.criterion}
              onChange={(e) => setDraft({ ...draft, criterion: e.target.value })}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-soft btn-sm" onClick={() => setDraft(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!draft.criterion.trim()}
                onClick={create}
              >
                <Plus size={14} />Criar juiz
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-soft btn-sm"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => setDraft({ name: '', criterion: '' })}
          >
            <Plus size={14} />Criar juiz
          </button>
        )}
      </div>
    </div>
  )
}
