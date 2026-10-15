'use client'

import React, { type CSSProperties, type ReactNode } from 'react'
import { parseMd } from '@/lib/ai/processors/markdown-processor'
import { Icon } from '../proto/ui'
import { KT } from './kb-model'

/**
 * Leitura de uma nota no formato do protótipo (MdView): títulos, listas com
 * marcador, destaques coloridos por tipo e links [[Título]]. Usa o mesmo
 * parseMd que gera os trechos, então o que o lojista vê é o que o agente lê.
 * `data-bi` marca cada bloco para o "Ver trecho" e a Estrutura rolarem até ele.
 */

const CALL: Record<string, [string, string, keyof typeof KT]> = {
  regra: ['Regra', 'shield', 'red'],
  resposta: ['Resposta pronta', 'message', 'green'],
  atencao: ['Atenção', 'alert', 'amber'],
}

export function Inline({ s, onLink, exists }: { s: string; onLink?: (title: string) => void; exists?: (title: string) => boolean }): ReactNode {
  const parts = s.split(/(\*\*[^*]+\*\*|\[\[[^\]]+\]\])/g).filter(Boolean)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>
    if (p.startsWith('[[') && p.endsWith(']]')) {
      const [target, label] = p.slice(2, -2).split('|')
      const title = target.trim()
      const ok = exists ? exists(title) : true
      return (
        <a key={i} href="#" className={'kb-wl' + (ok ? '' : ' un')} title={ok ? `Abrir ${title}` : 'Nota ainda não existe. Clique para criar'}
          onClick={(e) => { e.preventDefault(); onLink?.(title) }}>{(label ?? title).trim()}</a>
      )
    }
    return <React.Fragment key={i}>{p}</React.Fragment>
  })
}

export default function MdView({ markdown, onLink, exists, hi }: {
  markdown: string; onLink?: (title: string) => void; exists?: (title: string) => boolean; hi?: number | null
}) {
  const blocks = parseMd(markdown)
  if (blocks.length === 0) return <div className="kb-md"><p style={{ color: '#9CA3AF' }}>Nota vazia. Clique duas vezes para escrever.</p></div>
  const I = (s: string) => <Inline s={s} onLink={onLink} exists={exists} />
  return (
    <div className="kb-md">
      {blocks.map((b, i) => {
        const cls = hi === i ? 'kb-hi' : undefined
        const p = { 'data-bi': i, className: cls }
        if (b.type === 'heading') {
          const T = (`h${Math.min(6, b.level + 1)}`) as 'h2'
          return <T key={i} {...p} id={`h-${i}`}>{I(b.text)}</T>
        }
        if (b.type === 'list') {
          const T = b.ordered ? 'ol' : 'ul'
          return <T key={i} {...p}>{b.items.map((x, j) => <li key={j}>{I(x)}</li>)}</T>
        }
        if (b.type === 'callout') {
          const c = CALL[b.kind] ?? ['Nota', 'bookOpen', 'slate']
          const t = KT[c[2]]
          return (
            <div key={i} data-bi={i} className={'kb-call' + (cls ? ` ${cls}` : '')} style={{ '--cb': t[0], '--cf': t[1] } as CSSProperties}>
              <div className="kb-call-h"><Icon n={c[1]} s={14} />{b.title || c[0]}</div>
              <div className="kb-call-b">{I(b.text)}</div>
            </div>
          )
        }
        return <p key={i} {...p}>{I(b.text)}</p>
      })}
    </div>
  )
}
