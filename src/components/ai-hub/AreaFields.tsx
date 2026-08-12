'use client'

import { useState } from 'react'
import { Check, Plus, ShieldCheck, X } from 'lucide-react'
import KnowledgeBasePanel from '@/components/agents/KnowledgeBasePanel'
import ApiKeysManager from '@/components/whatsapp/ApiKeysManager'
import CustomToolsSection from './CustomToolsSection'
import {
  DISCOVERY_OBJECTIVES,
  type DiscoveryBias,
  type HubAreaId,
  type HubState,
} from '@/lib/ai/agent-hub'
import { TOOL_CATALOG } from '@/lib/ai/tools/catalog'

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

const BIASES: Array<{ v: DiscoveryBias; t: string; d: string }> = [
  { v: 'vendedor', t: 'Vendedor', d: DISCOVERY_OBJECTIVES.vendedor },
  { v: 'suporte', t: 'Suporte', d: DISCOVERY_OBJECTIVES.suporte },
  { v: 'hibrido', t: 'Híbrido', d: DISCOVERY_OBJECTIVES.hibrido },
]

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
  const patch = <K extends HubAreaId>(key: K, value: HubState[K]) =>
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
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <Label>Viés do inbound espontâneo</Label>
          <div className="optrow">
            {BIASES.map((o) => (
              <button key={o.v} type="button" className={`hub-opt${hub.discovery.bias === o.v ? ' on' : ''}`}
                onClick={() => patch('discovery', { ...hub.discovery, bias: o.v })}>
                <div><div>{o.t}</div><div className="od">{o.d}</div></div>
              </button>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
          Este campo edita o <b>objetivo da missão whatsapp.received</b> — o mesmo
          dado da família &quot;Descoberta&quot; na aba Missões (salvar cria uma
          versão nova e ativa). Nada aqui vira um &quot;papel global&quot; do agente.
        </div>
        {!hub.discovery.has_mission && hub.discovery.bias === null && (
          <div style={{ fontSize: 11.5, color: 'var(--red, #E5484D)', lineHeight: 1.5 }}>
            Esta loja ainda <b>não tem missão de descoberta ativa</b> — sem ela, o
            agente não responde mensagens recebidas. Escolher um viés acima e salvar
            cria e ativa a primeira versão.
          </div>
        )}
        {hub.discovery.has_mission && hub.discovery.bias === null && (
          <div style={{ fontSize: 11.5, color: 'var(--amber, #E0930B)' }}>
            A missão ativa tem um objetivo personalizado (editado na aba Missões) —
            escolher um viés acima o substitui por um dos três padrões.
          </div>
        )}
      </div>
    )
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
        <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
          Juízes adicionais (pós-hoc, por amostra) chegam com o executor deles — aqui só entra o que roda de verdade.
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
