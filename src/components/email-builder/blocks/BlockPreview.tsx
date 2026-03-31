'use client'

import { Instagram, Facebook, Music, Youtube, Link2, Zap, ChevronUp, ChevronDown, Copy, X } from 'lucide-react'
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

const DYNAMIC_TYPES = new Set(['product-grid', 'abandoned-cart', 'coupon'])

const SOCIAL_ICONS: Record<string, { icon: typeof Instagram; label: string }> = {
  instagram: { icon: Instagram, label: 'Instagram' },
  facebook: { icon: Facebook, label: 'Facebook' },
  tiktok: { icon: Music, label: 'TikTok' },
  youtube: { icon: Youtube, label: 'YouTube' },
}

function parsePadding(padding: any): React.CSSProperties {
  if (!padding) return {}
  if (typeof padding === 'number') {
    return { padding }
  }
  if (typeof padding === 'object') {
    return {
      paddingTop: padding.top ?? 0,
      paddingRight: padding.right ?? 0,
      paddingBottom: padding.bottom ?? 0,
      paddingLeft: padding.left ?? 0,
    }
  }
  return {}
}

function preventDefault(e: React.MouseEvent) {
  e.preventDefault()
}

export function BlockPreview({
  block,
  selected,
  onSelect,
  onMoveUp,
  onMoveDown,
  onClone,
  onDelete,
  isFirst,
  isLast,
}: BlockPreviewProps) {
  const p = block.props
  const pad = parsePadding(p.padding)

  const renderBlock = () => {
    switch (block.type) {
      // ── Text ──
      case 'text':
        return (
          <div
            style={{
              ...pad,
              color: p.color,
              fontSize: p.fontSize,
              lineHeight: p.lineHeight,
              textAlign: p.align as React.CSSProperties['textAlign'],
              backgroundColor: p.backgroundColor || undefined,
            }}
            dangerouslySetInnerHTML={{ __html: p.contentHtml || (typeof p.content === 'string' ? p.content : '') || '<p>Escreva seu texto aqui.</p>' }}
          />
        )

      // ── Image ──
      case 'image':
        return (
          <div
            style={{
              ...pad,
              textAlign: (p.align as React.CSSProperties['textAlign']) || 'center',
              backgroundColor: p.backgroundColor || undefined,
              lineHeight: 0,
              fontSize: 0,
            }}
          >
            <div style={{ position: 'relative', maxWidth: '100%', lineHeight: 0, fontSize: 0 }}>
              <img
                src={p.src}
                alt={p.alt || ''}
                style={{
                  maxWidth: '100%',
                  width: p.width,
                  height: 'auto',
                  display: 'block',
                  borderRadius: p.borderRadius,
                  margin: p.align === 'left' ? '0' : p.align === 'right' ? '0 0 0 auto' : '0 auto',
                }}
              />
              {p.href && (
                <span
                  style={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    background: 'rgba(0,0,0,0.5)',
                    color: '#fff',
                    borderRadius: '50%',
                    width: 22,
                    height: 22,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                  }}
                  title={p.href}
                >
                  <Link2 size={12} />
                </span>
              )}
            </div>
          </div>
        )

      // ── Button ──
      case 'button':
        return (
          <div
            style={{
              ...pad,
              textAlign: (p.align as React.CSSProperties['textAlign']) || 'center',
              backgroundColor: p.backgroundColor || undefined,
            }}
          >
            <a
              href="#"
              onClick={preventDefault}
              style={{
                display: p.fullWidth ? 'block' : 'inline-block',
                backgroundColor: p.bgColor,
                color: p.textColor,
                padding: `${p.paddingV ?? 13}px ${p.paddingH ?? 28}px`,
                borderRadius: p.borderRadius,
                fontSize: p.fontSize,
                fontWeight: p.fontWeight || 'bold',
                textDecoration: 'none',
                textAlign: 'center',
                border: p.borderWidth
                  ? `${p.borderWidth}px solid ${p.borderColor || '#E5E7EB'}`
                  : 'none',
                boxSizing: 'border-box',
              }}
            >
              {p.text}
            </a>
          </div>
        )

      // ── Divider ──
      case 'divider':
        return (
          <div style={pad}>
            <hr
              style={{
                border: 'none',
                borderTop: `${p.thickness ?? 1}px ${p.style || 'solid'} ${p.color || '#E5E7EB'}`,
                margin: 0,
              }}
            />
          </div>
        )

      // ── Spacer ──
      case 'spacer':
        return <div style={{ height: p.height || 32 }} />

      // ── Columns ──
      // ── HTML ──
      case 'html':
        return (
          <div style={pad} dangerouslySetInnerHTML={{ __html: p.code || '' }} />
        )

      // ── Video ──
      case 'video':
        return (
          <div style={pad}>
            <div style={{ position: 'relative', textAlign: 'center' }}>
              <img
                src={
                  p.thumbnailUrl ||
                  'https://placehold.co/560x315/111827/FFFFFF?text=Video'
                }
                alt="Video thumbnail"
                style={{
                  maxWidth: '100%',
                  width: '100%',
                  height: 'auto',
                  display: 'block',
                  borderRadius: 4,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  background: 'rgba(0,0,0,0.6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none',
                }}
              >
                <span style={{ color: '#fff', fontSize: 28, marginLeft: 4 }}>▶</span>
              </div>
            </div>
          </div>
        )

      // ── Social ──
      case 'social': {
        const nets: { type: string; url: string }[] = p.networks || []
        return (
          <div
            style={{
              ...pad,
              textAlign: (p.align as React.CSSProperties['textAlign']) || 'center',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent:
                  p.align === 'left'
                    ? 'flex-start'
                    : p.align === 'right'
                      ? 'flex-end'
                      : 'center',
                gap: p.spacing ?? 10,
                flexWrap: 'wrap',
              }}
            >
              {nets.map((n, i) => {
                const info = SOCIAL_ICONS[n.type]
                if (!info) return null
                const SocialIcon = info.icon
                return (
                  <span
                    key={`${n.type}-${i}`}
                    style={{
                      cursor: 'default',
                      lineHeight: 1,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    title={info.label}
                  >
                    <SocialIcon size={p.iconSize || 32} className="text-gray-600" />
                  </span>
                )
              })}
            </div>
          </div>
        )
      }

      // ── Header ──
      case 'header':
        return (
          <div
            style={{
              ...pad,
              backgroundColor: p.backgroundColor || undefined,
              textAlign: 'center',
            }}
          >
            <img
              src={p.logoSrc}
              alt="Logo"
              style={{
                width: p.logoWidth,
                height: 'auto',
                display: 'block',
                margin: '0 auto',
              }}
            />
            {p.showLinks && Array.isArray(p.links) && p.links.length > 0 && (
              <div
                style={{
                  marginTop: 12,
                  display: 'flex',
                  justifyContent: 'center',
                  gap: 16,
                  flexWrap: 'wrap',
                }}
              >
                {p.links.map((link: { text: string; url: string }, i: number) => (
                  <a
                    key={i}
                    href="#"
                    onClick={preventDefault}
                    style={{
                      color: '#6B7280',
                      fontSize: 13,
                      textDecoration: 'none',
                    }}
                  >
                    {link.text}
                  </a>
                ))}
              </div>
            )}
          </div>
        )

      // ── Footer ──
      case 'footer':
        return (
          <div
            style={{
              ...pad,
              backgroundColor: p.backgroundColor || undefined,
              textAlign: 'center',
              fontSize: p.fontSize || 11,
              color: p.textColor || '#9CA3AF',
            }}
          >
            {p.companyName && (
              <p style={{ margin: 0 }}>{p.companyName}</p>
            )}
            {p.address && (
              <p style={{ margin: '4px 0 0', fontSize: (p.fontSize || 11) - 1 }}>
                {p.address}
              </p>
            )}
            <div
              style={{
                marginTop: 8,
                display: 'flex',
                justifyContent: 'center',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              {p.showUnsubscribe && (
                <a
                  href="#"
                  onClick={preventDefault}
                  style={{
                    color: p.textColor || '#9CA3AF',
                    textDecoration: 'underline',
                    fontSize: p.fontSize || 11,
                  }}
                >
                  Descadastrar-se
                </a>
              )}
              {p.showPreferences && (
                <a
                  href="#"
                  onClick={preventDefault}
                  style={{
                    color: p.textColor || '#9CA3AF',
                    textDecoration: 'underline',
                    fontSize: p.fontSize || 11,
                  }}
                >
                  Preferências
                </a>
              )}
              {p.showViewInBrowser && (
                <a
                  href="#"
                  onClick={preventDefault}
                  style={{
                    color: p.textColor || '#9CA3AF',
                    textDecoration: 'underline',
                    fontSize: p.fontSize || 11,
                  }}
                >
                  Ver no navegador
                </a>
              )}
            </div>
          </div>
        )

      // ── Product Grid ──
      case 'product-grid': {
        const cols = p.columns || 2
        const rows = p.rows || 2
        const total = cols * rows
        return (
          <div
            style={{
              ...pad,
              backgroundColor: p.backgroundColor || undefined,
            }}
          >
            {p.title && (
              <p
                style={{
                  fontSize: 18,
                  fontWeight: 'bold',
                  color: '#111827',
                  textAlign: 'center',
                  margin: '0 0 16px',
                }}
              >
                {p.title}
              </p>
            )}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                gap: p.productPadding ?? 8,
              }}
            >
              {Array.from({ length: total }).map((_, i) => {
                const staticProd = p.staticProducts?.[i]
                return (
                <div
                  key={i}
                  style={{
                    border: `1px solid ${p.productBorderColor || '#E5E7EB'}`,
                    borderRadius: p.productBorderRadius ?? 8,
                    overflow: 'hidden',
                    background: '#fff',
                    textAlign: 'center',
                  }}
                >
                  <div
                    style={{
                      background: '#F3F4F6',
                      height: p.maxImageHeight ?? 200,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#9CA3AF',
                      fontSize: 12,
                      overflow: 'hidden',
                    }}
                  >
                    {staticProd?.image_url ? (
                      <img src={staticProd.image_url} alt={staticProd.title || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      `Produto ${i + 1}`
                    )}
                  </div>
                  <div style={{ padding: p.productPadding ?? 8 }}>
                    {p.showName !== false && (
                      <p
                        style={{
                          margin: 0,
                          fontWeight: p.nameWeight || '600',
                          fontSize: p.nameFontSize || 14,
                          color: p.nameColor || '#111827',
                        }}
                      >
                        {staticProd?.title || 'Nome do produto'}
                      </p>
                    )}
                    {p.showPrice !== false && (
                      <div style={{ marginTop: 4 }}>
                        {p.showComparePrice && (
                          <span
                            style={{
                              fontSize: (p.priceFontSize || 16) - 3,
                              color: p.comparePriceColor || '#9CA3AF',
                              textDecoration: 'line-through',
                              marginRight: 6,
                            }}
                          >
                            {staticProd?.compare_at_price ? `R$ ${staticProd.compare_at_price.toFixed(2)}` : 'R$ XX,XX'}
                          </span>
                        )}
                        <span
                          style={{
                            fontWeight: p.priceWeight || '700',
                            fontSize: p.priceFontSize || 16,
                            color: p.priceColor || '#F97316',
                          }}
                        >
                          {staticProd?.price ? `R$ ${staticProd.price.toFixed(2)}` : 'R$ XX,XX'}
                        </span>
                      </div>
                    )}
                    {p.showButton !== false && (
                      <a
                        href="#"
                        onClick={preventDefault}
                        style={{
                          display: 'inline-block',
                          marginTop: 8,
                          padding: '6px 16px',
                          background: p.buttonColor || '#F97316',
                          color: p.buttonTextColor || '#FFFFFF',
                          borderRadius: p.buttonRadius ?? 6,
                          fontSize: 12,
                          fontWeight: 600,
                          textDecoration: 'none',
                        }}
                      >
                        {p.buttonText || 'Comprar'}
                      </a>
                    )}
                  </div>
                </div>
                )
              })}
            </div>
          </div>
        )
      }

      // ── Abandoned Cart ──
      case 'abandoned-cart': {
        const maxItems = p.maxItems || 3
        return (
          <div
            style={{
              ...pad,
              backgroundColor: p.backgroundColor || '#FFFBEB',
            }}
          >
            {p.title && (
              <p
                style={{
                  margin: '0 0 4px',
                  fontSize: 18,
                  fontWeight: 'bold',
                  color: '#111827',
                  textAlign: 'center',
                }}
              >
                {p.title}
              </p>
            )}
            {p.subtitle && (
              <p
                style={{
                  margin: '0 0 16px',
                  fontSize: 14,
                  color: '#6B7280',
                  textAlign: 'center',
                }}
              >
                {p.subtitle}
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Array.from({ length: maxItems }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    background: '#fff',
                    borderRadius: 8,
                    padding: 10,
                    border: '1px solid #E5E7EB',
                  }}
                >
                  {p.showImage !== false && (
                    <div
                      style={{
                        width: 64,
                        height: 64,
                        flexShrink: 0,
                        background: '#F3F4F6',
                        borderRadius: 6,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#9CA3AF',
                        fontSize: 11,
                      }}
                    >
                      Item {i + 1}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        margin: 0,
                        fontWeight: 600,
                        fontSize: 14,
                        color: '#111827',
                      }}
                    >
                      Nome do produto
                    </p>
                    <div
                      style={{
                        display: 'flex',
                        gap: 8,
                        marginTop: 2,
                        fontSize: 13,
                        color: '#6B7280',
                      }}
                    >
                      {p.showQuantity !== false && <span>Qtd: 1</span>}
                      {p.showPrice !== false && (
                        <span style={{ fontWeight: 600, color: '#111827' }}>
                          R$ XX,XX
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <a
                href="#"
                onClick={preventDefault}
                style={{
                  display: 'inline-block',
                  padding: '12px 32px',
                  background: p.buttonColor || '#F97316',
                  color: p.buttonTextColor || '#FFFFFF',
                  borderRadius: 8,
                  fontSize: 15,
                  fontWeight: 'bold',
                  textDecoration: 'none',
                }}
              >
                {p.buttonText || 'Finalizar Compra'}
              </a>
            </div>
          </div>
        )
      }

      // ── Coupon ──
      case 'coupon':
        return (
          <div
            style={{
              ...pad,
              backgroundColor: p.backgroundColor || '#FFF7ED',
              textAlign: 'center',
            }}
          >
            {p.headerText && (
              <p style={{ margin: '0 0 12px', fontSize: 14, color: '#9A3412' }}>
                {p.headerText}
              </p>
            )}
            <p
              style={{
                margin: 0,
                fontSize: p.codeFontSize || 32,
                fontWeight: 'bold',
                color: p.codeColor || '#EA580C',
                letterSpacing: 4,
                border: `2px ${p.borderStyle || 'dashed'} ${p.borderColor || '#EA580C'}`,
                borderRadius: p.borderRadius ?? 12,
                display: 'inline-block',
                padding: '8px 24px',
              }}
            >
              {p.code}
            </p>
            {p.footerText && (
              <p style={{ margin: '12px 0 0', fontSize: 12, color: '#9CA3AF' }}>
                {p.footerText}
              </p>
            )}
          </div>
        )

      // ── Fallback ──
      default:
        return (
          <div style={{ padding: 20, color: '#9CA3AF', textAlign: 'center' }}>
            Bloco: {block.type}
          </div>
        )
    }
  }

  const isDynamic = DYNAMIC_TYPES.has(block.type)

  return (
    <div
      onClick={onSelect}
      className={`relative group transition-all cursor-pointer ${
        selected
          ? 'ring-2 ring-brand-500 ring-offset-1'
          : 'hover:ring-1 hover:ring-gray-300'
      }`}
    >
      {renderBlock()}

      {/* Dynamic badge */}
      {isDynamic && (
        <div
          className="absolute top-1 left-1 flex items-center gap-1 bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 text-[10px] font-semibold pointer-events-none"
        >
          <Zap size={10} />
          <span>Dinâmico</span>
        </div>
      )}

      {/* Floating toolbar */}
      {selected && (
        <div className="absolute -top-8 right-0 flex items-center gap-0.5 bg-white border border-gray-200 rounded-md shadow-md px-1 py-0.5 z-10">
          <button
            onClick={(e) => { e.stopPropagation(); onMoveUp() }}
            disabled={isFirst}
            className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 text-xs"
            title="Mover para cima"
          >
            <ChevronUp size={14} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onMoveDown() }}
            disabled={isLast}
            className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 text-xs"
            title="Mover para baixo"
          >
            <ChevronDown size={14} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onClone() }}
            className="p-1 text-gray-400 hover:text-blue-600 text-xs"
            title="Duplicar"
          >
            <Copy size={14} />
          </button>
          <div className="w-px h-4 bg-gray-200" />
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="p-1 text-gray-400 hover:text-red-600 text-xs"
            title="Excluir"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
