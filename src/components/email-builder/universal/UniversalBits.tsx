'use client'

// ═══════════════════════════════════════════════════════════════════
// Peças do conteúdo universal.
//
// Universal é o conteúdo guardado uma vez e apontado por vários
// e-mails: mexer nele mexe em todos. A regra destas peças é uma só —
// nunca deixar a pessoa alterar um universal sem antes ver que é um,
// e em quantos e-mails ele está. Um rodapé aqui vale por vinte e três
// e-mails; o número tem de estar na tela antes do clique, não depois.
//
// Aqui só ficam as partes que não dependem do editor. O editor em si
// mora no modal, carregado sob demanda.
// ═══════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Layers, Package, Loader2, Mail, Workflow, Send, FileText, Globe, Unlink } from 'lucide-react'
import { BlockPreview } from '../blocks/BlockPreview'
import type { EmailBlock, EmailSection } from '../config/types'

export type UniversalKind = 'section' | 'block'

export interface UsageEmail {
  templateId: string
  templateName: string
  origin: { type: 'campaign' | 'automation'; id: string; name: string; status?: string | null } | null
}

export interface Usage {
  count: number
  emails: UsageEmail[]
  campaigns: number
  automations: number
  loose: number
}

export const EMPTY_USAGE: Usage = { count: 0, emails: [], campaigns: 0, automations: 0, loose: 0 }

// ── Ícone e nome do tipo ────────────────────────────────────────────

export function UniversalIcon({ kind, className = 'w-4 h-4' }: { kind: UniversalKind; className?: string }) {
  return kind === 'section'
    ? <Layers className={className} />
    : <Package className={className} />
}

export const kindLabel = (kind: UniversalKind) => (kind === 'section' ? 'Seção universal' : 'Bloco universal')
export const kindNoun = (kind: UniversalKind) => (kind === 'section' ? 'seção' : 'bloco')

// ── Quantos e-mails ─────────────────────────────────────────────────

/**
 * "usado em 23 e-mails" em vez de "23" solto: o número sozinho, num
 * selo, lê-se como qualquer outro contador.
 */
export function usageText(count: number): string {
  if (count === 0) return 'ainda não está em nenhum e-mail'
  if (count === 1) return 'usado em 1 e-mail'
  return `usado em ${count} e-mails`
}

export function UsageBadge({ count, loading, className = '' }: { count: number; loading?: boolean; className?: string }) {
  if (loading) {
    return (
      <span className={`inline-flex items-center gap-1 text-[10px] text-violet-500 ${className}`}>
        <Loader2 className="w-2.5 h-2.5 animate-spin" />
      </span>
    )
  }
  const none = count === 0
  return (
    <span
      title={usageText(count)}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
        none
          ? 'bg-gray-50 text-gray-500 border-gray-200'
          : 'bg-violet-50 text-violet-700 border-violet-200'
      } ${className}`}
    >
      <Mail className="w-2.5 h-2.5" />
      {none ? 'Nenhum e-mail' : `${count} e-mail${count === 1 ? '' : 's'}`}
    </span>
  )
}

// ── Carregar o uso ──────────────────────────────────────────────────

export function useUniversalUsage(savedId: string | null | undefined, enabled = true) {
  const [usage, setUsage] = useState<Usage>(EMPTY_USAGE)
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    if (!savedId) { setUsage(EMPTY_USAGE); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/email/saved-blocks/${savedId}/usage`)
      if (res.ok) setUsage((await res.json()) as Usage)
      else setUsage(EMPTY_USAGE)
    } catch {
      setUsage(EMPTY_USAGE)
    } finally {
      setLoading(false)
    }
  }, [savedId])

  useEffect(() => {
    if (!enabled || !savedId) return
    let cancelled = false
    setLoading(true)
    fetch(`/api/email/saved-blocks/${savedId}/usage`)
      .then((r) => (r.ok ? r.json() : EMPTY_USAGE))
      .then((d) => { if (!cancelled) setUsage(d as Usage) })
      .catch(() => { if (!cancelled) setUsage(EMPTY_USAGE) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [savedId, enabled])

  return { usage, loading, reload }
}

// ── Onde é usado ────────────────────────────────────────────────────

const ORIGIN_META = {
  campaign: { Icon: Send, label: 'Campanha' },
  automation: { Icon: Workflow, label: 'Automação' },
} as const

/**
 * A lista de e-mails que a alteração vai atingir. Campanha e automação
 * aparecem com nome porque é assim que a pessoa reconhece o e-mail —
 * "Boas-vindas 2" diz mais do que o nome do template.
 */
export function UniversalUsageList({ usage, loading, max = 8, className = '' }: {
  usage: Usage; loading?: boolean; max?: number; className?: string
}) {
  const [expanded, setExpanded] = useState(false)

  if (loading) {
    return (
      <div className={`flex items-center gap-2 py-3 text-[11px] text-gray-400 ${className}`}>
        <Loader2 className="w-3 h-3 animate-spin" /> Procurando onde é usado…
      </div>
    )
  }
  if (usage.count === 0) {
    return (
      <p className={`py-3 text-[11px] text-gray-500 ${className}`}>
        Este conteúdo ainda não está em nenhum e-mail. Alterar agora não muda nada que já foi montado.
      </p>
    )
  }

  const shown = expanded ? usage.emails : usage.emails.slice(0, max)
  const rest = usage.emails.length - shown.length

  return (
    <div className={className}>
      <ul className="space-y-0.5">
        {shown.map((e) => {
          const meta = e.origin ? ORIGIN_META[e.origin.type] : null
          const Icon = meta?.Icon || FileText
          return (
            <li key={e.templateId} className="flex items-center gap-2 py-1 px-1.5 rounded hover:bg-gray-50">
              <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${e.origin ? 'text-violet-500' : 'text-gray-300'}`} />
              <span className="flex-1 min-w-0">
                <span className="block text-[11px] text-gray-900 truncate">
                  {e.origin ? e.origin.name : e.templateName}
                </span>
                <span className="block text-[10px] text-gray-400 truncate">
                  {e.origin ? `${meta?.label} · ${e.templateName}` : 'E-mail sem campanha ou automação'}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
      {rest > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-1 text-[11px] font-medium text-violet-600 hover:text-violet-800 underline underline-offset-2"
        >
          e mais {rest} {rest === 1 ? 'e-mail' : 'e-mails'}
        </button>
      )}
    </div>
  )
}

/** Uma linha de resumo: "23 e-mails · 4 campanhas · 19 automações". */
export function usageSummary(usage: Usage): string {
  if (usage.count === 0) return 'nenhum e-mail'
  const parts = [`${usage.count} ${usage.count === 1 ? 'e-mail' : 'e-mails'}`]
  if (usage.campaigns) parts.push(`${usage.campaigns} ${usage.campaigns === 1 ? 'campanha' : 'campanhas'}`)
  if (usage.automations) parts.push(`${usage.automations} ${usage.automations === 1 ? 'automação' : 'automações'}`)
  return parts.join(' · ')
}

// ── A escolha, antes de editar ──────────────────────────────────────

/**
 * O que o painel direito mostra quando o selecionado é universal.
 *
 * Toma o lugar das propriedades de propósito. Antes o editor deixava
 * digitar e só então perguntava o que fazer com a alteração — quando a
 * pergunta chegava, a pessoa já tinha mexido, e "cancelar" não era mais
 * uma resposta honesta. Aqui a pergunta vem primeiro: ou você abre o
 * universal e muda em todos, ou solta este e-mail do universal e mexe
 * só nele. Não há terceira via, porque não existe.
 */
export function UniversalScopePanel({
  kind, name, usage, usageLoading, onEditAll, onEditHere,
}: {
  kind: UniversalKind
  name: string
  usage: Usage
  usageLoading?: boolean
  onEditAll: () => void
  onEditHere: () => void
}) {
  const [showUsage, setShowUsage] = useState(false)
  const others = Math.max(0, usage.count - 1)

  return (
    <div className="p-3 space-y-3">
      <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3">
        <div className="flex items-start gap-2">
          <div className="w-7 h-7 rounded-md bg-violet-600 text-white flex items-center justify-center flex-shrink-0">
            <UniversalIcon kind={kind} className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-violet-900 leading-tight truncate">{name}</p>
            <p className="text-[11px] text-violet-700/90 leading-snug mt-0.5">
              {kindLabel(kind)}
              {usageLoading
                ? ' · procurando onde é usado…'
                : usage.count > 1
                  ? ` · também está em outros ${others} ${others === 1 ? 'e-mail' : 'e-mails'}`
                  : usage.count === 1
                    ? ' · por enquanto só neste e-mail'
                    : ' · ainda não está em nenhum e-mail'}
            </p>
          </div>
        </div>
        {usage.count > 0 && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowUsage((v) => !v)}
              className="text-[11px] font-medium text-violet-700 hover:text-violet-900 underline underline-offset-2"
            >
              {showUsage ? 'Esconder' : 'Ver'} onde é usado
            </button>
            {showUsage && (
              <div className="mt-1.5 rounded-md bg-white border border-violet-100 px-1.5">
                <UniversalUsageList usage={usage} loading={usageLoading} max={10} className="py-1" />
              </div>
            )}
          </div>
        )}
      </div>

      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-0.5">
        Como quer editar?
      </p>

      <button
        type="button"
        onClick={onEditAll}
        className="w-full text-left p-3 rounded-lg border-2 border-violet-300 bg-white hover:border-violet-500 hover:bg-violet-50/50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-violet-600 flex-shrink-0" />
          <span className="text-[13px] font-semibold text-violet-900">Editar em todos os e-mails</span>
        </span>
        <span className="block text-[11px] text-violet-700/80 leading-snug mt-1 pl-6">
          Abre {kindNoun(kind) === 'seção' ? 'a seção' : 'o bloco'} sozinh{kind === 'section' ? 'a' : 'o'} e a alteração
          {usage.count > 1 ? ` chega nos ${usage.count} e-mails.` : ' vale para todo e-mail que usar daqui em diante.'}
        </span>
      </button>

      <button
        type="button"
        onClick={onEditHere}
        className="w-full text-left p-3 rounded-lg border-2 border-gray-200 bg-white hover:border-gray-400 hover:bg-gray-50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Unlink className="w-4 h-4 text-gray-500 flex-shrink-0" />
          <span className="text-[13px] font-semibold text-gray-900">Editar só neste e-mail</span>
        </span>
        <span className="block text-[11px] text-gray-500 leading-snug mt-1 pl-6">
          Solta este e-mail do universal. O conteúdo continua igual, mas
          para de acompanhar — e os outros e-mails seguem com a versão universal.
        </span>
      </button>
    </div>
  )
}

// ── Miniatura ───────────────────────────────────────────────────────

function blocksOf(content: any, kind: UniversalKind): EmailBlock[] {
  if (kind === 'block') return content ? [content as EmailBlock] : []
  const sec = content as EmailSection
  return (sec?.columns || []).flatMap((c) => c.blocks || [])
}

/**
 * Miniatura do conteúdo, renderizada com o mesmo componente do canvas
 * e reduzida por transform. Sem isto, a biblioteca é uma lista de
 * nomes — e com "Rodapé preto", "rodape preto", "RODAPE BRANCO" e
 * "RODAPÉ BRANCO" lado a lado, o nome não distingue nada.
 */
export function UniversalThumb({ content, kind, height = 64, width = 600 }: {
  content: any; kind: UniversalKind; height?: number; width?: number
}) {
  const blocks = useMemo(() => blocksOf(content, kind), [content, kind])
  const bg = kind === 'section'
    ? (content?.styles?.contentBackgroundColor || content?.styles?.backgroundColor || '#ffffff')
    : '#ffffff'

  if (blocks.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-gray-50 border-b border-gray-100"
        style={{ height }}
      >
        <Globe className="w-4 h-4 text-gray-300" />
      </div>
    )
  }

  // O conteúdo é renderizado na largura real do e-mail e só então
  // encolhido: reduzir a largura reflui o texto e a miniatura deixaria
  // de parecer com o e-mail. A escala sai da largura disponível, medida
  // — cravar um número deixaria sobra ou corte quando o painel mudar.
  const [scale, setScale] = useState(0.55)
  const observer = useRef<ResizeObserver | null>(null)
  const boxRef = useCallback((node: HTMLDivElement | null) => {
    // Ref callback também roda com null ao desmontar: é onde o
    // observador para, senão cada miniatura que sai da lista deixa um
    // observador vivo — e a biblioteca remonta a cada busca digitada.
    observer.current?.disconnect()
    observer.current = null
    if (!node) return
    const apply = () => {
      const w = node.clientWidth
      if (w > 0) setScale(w / width)
    }
    apply()
    if (typeof ResizeObserver === 'undefined') return
    observer.current = new ResizeObserver(apply)
    observer.current.observe(node)
  }, [width])

  return (
    <div
      ref={boxRef}
      className="relative overflow-hidden border-b border-gray-100"
      style={{ height, backgroundColor: bg }}
      aria-hidden
    >
      <div
        className="pointer-events-none origin-top-left absolute left-0 top-0"
        style={{ width, transform: `scale(${scale})` }}
      >
        {blocks.slice(0, 6).map((b) => (
          <BlockPreview
            key={b.id}
            block={b}
            selected={false}
            onSelect={() => {}}
            onClone={() => {}}
            onDelete={() => {}}
          />
        ))}
      </div>
      {/* Desbotado embaixo: diz que a miniatura é um recorte. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-4 bg-gradient-to-t from-black/5 to-transparent" />
    </div>
  )
}
