'use client'

import type { EmailBlock } from '../config/types'

interface BlockPreviewProps {
  block: EmailBlock
  selected: boolean
  onSelect: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onClone: () => void
  onDelete: () => void
  isFirst: boolean
  isLast: boolean
}

export function BlockPreview({ block, selected, onSelect, onMoveUp, onMoveDown, onClone, onDelete, isFirst, isLast }: BlockPreviewProps) {
  const p = block.props

  const renderBlock = () => {
    switch (block.type) {
      case 'text':
        return (
          <div style={{ padding: p.padding || 20, color: p.color, fontSize: p.fontSize, textAlign: p.align as any }}
            dangerouslySetInnerHTML={{ __html: p.content || '' }} />
        )

      case 'image':
        return (
          <div style={{ padding: p.padding || 16, textAlign: 'center' }}>
            <img src={p.src} alt={p.alt || ''} style={{ maxWidth: '100%', width: p.width, height: 'auto', display: 'block', margin: '0 auto', borderRadius: 4 }} />
          </div>
        )

      case 'button':
        return (
          <div style={{ padding: p.padding || 20, textAlign: 'center' }}>
            <a href="#" onClick={e => e.preventDefault()}
              style={{
                display: p.fullWidth ? 'block' : 'inline-block',
                backgroundColor: p.bgColor, color: p.textColor,
                padding: '12px 28px', borderRadius: p.borderRadius,
                fontSize: p.fontSize, fontWeight: 'bold', textDecoration: 'none',
                textAlign: 'center',
              }}>
              {p.text}
            </a>
          </div>
        )

      case 'divider':
        return (
          <div style={{ padding: `${p.padding || 16}px 20px` }}>
            <hr style={{ border: 'none', borderTop: `${p.thickness}px solid ${p.color}`, margin: 0 }} />
          </div>
        )

      case 'spacer':
        return <div style={{ height: p.height || 32 }} />

      case 'columns':
        return (
          <div style={{ padding: p.padding || 16, display: 'flex', gap: p.gap || 16 }}>
            <div style={{ flex: 1, minWidth: 0 }} dangerouslySetInnerHTML={{ __html: p.leftContent || '' }} />
            <div style={{ flex: 1, minWidth: 0 }} dangerouslySetInnerHTML={{ __html: p.rightContent || '' }} />
          </div>
        )

      case 'html':
        return (
          <div style={{ padding: p.padding || 16 }} dangerouslySetInnerHTML={{ __html: p.code || '' }} />
        )

      case 'social':
        const networks = [
          p.instagram && { name: 'Instagram', url: p.instagram, emoji: '📸' },
          p.facebook && { name: 'Facebook', url: p.facebook, emoji: '📘' },
          p.tiktok && { name: 'TikTok', url: p.tiktok, emoji: '🎵' },
          p.youtube && { name: 'YouTube', url: p.youtube, emoji: '▶️' },
        ].filter(Boolean) as { name: string; url: string; emoji: string }[]
        return (
          <div style={{ padding: p.padding || 20, textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
              {networks.map(n => (
                <span key={n.name} style={{ fontSize: p.iconSize || 28, cursor: 'pointer' }} title={n.name}>{n.emoji}</span>
              ))}
            </div>
          </div>
        )

      case 'header':
        return (
          <div style={{ padding: p.padding || 24, backgroundColor: p.bgColor, textAlign: 'center' }}>
            <img src={p.logoSrc} alt="Logo" style={{ width: p.logoWidth, height: 'auto', display: 'block', margin: '0 auto' }} />
          </div>
        )

      case 'footer':
        return (
          <div style={{ padding: p.padding || 24, backgroundColor: p.bgColor, textAlign: 'center', fontSize: 12, color: '#9CA3AF' }}>
            <p style={{ margin: 0 }}>{p.text}</p>
            {p.showUnsubscribe && (
              <p style={{ margin: '8px 0 0' }}>
                <a href="#" onClick={e => e.preventDefault()} style={{ color: '#9CA3AF', textDecoration: 'underline' }}>Descadastrar-se</a>
              </p>
            )}
          </div>
        )

      case 'product-grid':
        return (
          <div style={{ padding: p.padding || 16 }}>
            {p.title && <p style={{ fontSize: 18, fontWeight: 'bold', color: '#111827', textAlign: 'center', marginBottom: 16 }}>{p.title}</p>}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${p.columns || 2}, 1fr)`, gap: 12 }}>
              {Array.from({ length: p.maxProducts || 4 }).map((_, i) => (
                <div key={i} style={{ border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden', background: '#fff', textAlign: 'center' }}>
                  <div style={{ background: '#F3F4F6', height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: 12 }}>
                    Produto {i + 1}
                  </div>
                  <div style={{ padding: 10 }}>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: '#111827' }}>Nome do produto</p>
                    {p.showPrice && <p style={{ margin: '4px 0 0', fontWeight: 700, fontSize: 16, color: '#F97316' }}>R$ XX,XX</p>}
                    {p.showButton && (
                      <a href="#" onClick={e => e.preventDefault()} style={{ display: 'inline-block', marginTop: 8, padding: '6px 16px', background: p.buttonColor || '#F97316', color: '#fff', borderRadius: 6, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                        {p.buttonText || 'Comprar'}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )

      case 'coupon':
        return (
          <div style={{ padding: p.padding || 24, backgroundColor: p.bgColor || '#FFF7ED', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 14, color: '#9A3412' }}>{p.header}</p>
            <p style={{ margin: '8px 0', fontSize: 32, fontWeight: 'bold', color: '#EA580C', letterSpacing: 4, border: `2px dashed ${p.borderColor || '#EA580C'}`, borderRadius: 8, display: 'inline-block', padding: '8px 24px' }}>
              {p.code}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: '#9CA3AF' }}>{p.footer}</p>
          </div>
        )

      default:
        return <div style={{ padding: 20, color: '#9CA3AF', textAlign: 'center' }}>Bloco: {block.type}</div>
    }
  }

  return (
    <div
      onClick={onSelect}
      className={`relative group transition-all cursor-pointer ${selected ? 'ring-2 ring-brand-500 ring-offset-1' : 'hover:ring-1 hover:ring-gray-300'}`}
      style={{ backgroundColor: block.props.bgColor && block.type !== 'button' ? undefined : undefined }}
    >
      {renderBlock()}

      {/* Toolbar on hover/select */}
      {selected && (
        <div className="absolute -top-8 right-0 flex items-center gap-0.5 bg-white border border-gray-200 rounded-md shadow-md px-1 py-0.5 z-10">
          <button onClick={(e) => { e.stopPropagation(); onMoveUp() }} disabled={isFirst}
            className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 text-xs" title="Mover para cima">↑</button>
          <button onClick={(e) => { e.stopPropagation(); onMoveDown() }} disabled={isLast}
            className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 text-xs" title="Mover para baixo">↓</button>
          <button onClick={(e) => { e.stopPropagation(); onClone() }}
            className="p-1 text-gray-400 hover:text-blue-600 text-xs" title="Duplicar">⎘</button>
          <div className="w-px h-4 bg-gray-200" />
          <button onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="p-1 text-gray-400 hover:text-red-600 text-xs" title="Excluir">✕</button>
        </div>
      )}
    </div>
  )
}
