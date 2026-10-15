'use client'

import React, { Fragment, type ReactNode } from 'react'
import { parseMd, type MdBlock } from '@/lib/ai/processors/markdown-processor'

/**
 * Leitura de uma nota (plano IA M3 passo 22) — o mesmo parseMd que gera os
 * chunks, então o que o lojista vê é o que o agente lê: callouts coloridos
 * por tipo e links [[Título]] clicáveis.
 */

const CALLOUT_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  regra: { label: 'Regra', color: '#E5484D', bg: '#FDECEC' },
  resposta: { label: 'Resposta pronta', color: '#0E9384', bg: '#E6F5F3' },
  atencao: { label: 'Atenção', color: '#E0930B', bg: '#FCF3E0' },
}

export function renderInline(text: string, onLink?: (title: string) => void): ReactNode[] {
  const out: ReactNode[] = []
  const re = /\[\[([^\]|]+)(?:\|([^\]]*))?\]\]|\*\*([^*]+)\*\*/g
  let last = 0
  let m: RegExpExecArray | null
  let key = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    if (m[1]) {
      const title = m[1].trim()
      out.push(
        <button key={key++} type="button" onClick={() => onLink?.(title)}
          style={{ background: 'none', border: 0, padding: 0, color: 'var(--brand)', cursor: 'pointer', font: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2 }}>
          {(m[2] ?? title).trim()}
        </button>,
      )
    } else if (m[3]) {
      out.push(<b key={key++}>{m[3]}</b>)
    }
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function Block({ block, onLink }: { block: MdBlock; onLink?: (title: string) => void }) {
  if (block.type === 'heading') {
    const size = block.level === 1 ? 20 : block.level === 2 ? 16 : 14
    return <div style={{ fontSize: size, fontWeight: 800, margin: '18px 0 8px' }}>{renderInline(block.text, onLink)}</div>
  }
  if (block.type === 'list') {
    const Tag = block.ordered ? 'ol' : 'ul'
    return (
      <Tag style={{ margin: '6px 0 10px', paddingLeft: 22, display: 'grid', gap: 4 }}>
        {block.items.map((item, i) => <li key={i}>{renderInline(item, onLink)}</li>)}
      </Tag>
    )
  }
  if (block.type === 'callout') {
    const style = CALLOUT_STYLE[block.kind]
    return (
      <div style={{ borderLeft: `3px solid ${style.color}`, background: style.bg, borderRadius: 8, padding: '10px 12px', margin: '10px 0' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: style.color, textTransform: 'uppercase', letterSpacing: '.05em' }}>
          {style.label}{block.title ? ` · ${block.title}` : ''}
        </div>
        <div style={{ marginTop: 4 }}>{renderInline(block.text, onLink)}</div>
      </div>
    )
  }
  return <p style={{ margin: '6px 0 10px', lineHeight: 1.6 }}>{renderInline(block.text, onLink)}</p>
}

export default function MdView({ markdown, onLink }: { markdown: string; onLink?: (title: string) => void }) {
  const blocks = parseMd(markdown)
  if (blocks.length === 0) {
    return <p style={{ color: 'var(--text-3)', fontSize: 13 }}>Nota vazia. Clique em Editar para escrever.</p>
  }
  return (
    <div style={{ fontSize: 14, color: 'var(--text)' }}>
      {blocks.map((block, i) => <Fragment key={i}><Block block={block} onLink={onLink} /></Fragment>)}
    </div>
  )
}
