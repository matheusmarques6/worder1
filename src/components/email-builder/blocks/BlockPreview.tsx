'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { Instagram, Facebook, Music, Youtube, Link2, Zap, Copy, X } from 'lucide-react'
import type { EmailBlock } from '../config/types'

const RichTextEditor = dynamic(
  () => import('./RichTextEditor').then(m => m.RichTextEditor),
  { ssr: false }
)

interface BlockPreviewProps {
  block: EmailBlock
  selected: boolean
  onSelect: () => void
  onClone: () => void
  onDelete: () => void
  selectedSubElement?: string | null
  onSelectSubElement?: (subEl: string | null) => void
  isInlineEditing?: boolean
  onEnterInlineEdit?: () => void
  onExitInlineEdit?: () => void
  onUpdateProps?: (patch: Record<string, any>) => void
}

const DYNAMIC_TYPES = new Set(['product-grid', 'abandoned-cart', 'order-products', 'coupon'])

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
  onClone,
  onDelete,
  selectedSubElement,
  onSelectSubElement,
  isInlineEditing,
  onEnterInlineEdit,
  onExitInlineEdit,
  onUpdateProps,
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
              textAlign: (p.align as React.CSSProperties['textAlign']) || 'left',
              backgroundColor: p.backgroundColor || undefined,
            }}
            onDoubleClick={(e) => {
              if (!isInlineEditing) {
                e.stopPropagation()
                onEnterInlineEdit?.()
              }
            }}
          >
            {isInlineEditing ? (
              <RichTextEditor
                content={p.contentHtml || (typeof p.content === 'string' ? p.content : '') || '<p>Escreva seu texto aqui.</p>'}
                onChange={(html: string) => {
                  onUpdateProps?.({ contentHtml: html })
                }}
              />
            ) : (
              <>
                {/* Wrap in a div that forces text-align on all children */}
                <style dangerouslySetInnerHTML={{ __html: `.worder-ta-${block.id.replace(/[^a-z0-9]/gi,'')} p,.worder-ta-${block.id.replace(/[^a-z0-9]/gi,'')} h1,.worder-ta-${block.id.replace(/[^a-z0-9]/gi,'')} h2,.worder-ta-${block.id.replace(/[^a-z0-9]/gi,'')} h3,.worder-ta-${block.id.replace(/[^a-z0-9]/gi,'')} h4{text-align:${p.align || 'left'}}` }} />
                <div className={`worder-ta-${block.id.replace(/[^a-z0-9]/gi,'')}`} dangerouslySetInnerHTML={{ __html: p.contentHtml || (typeof p.content === 'string' ? p.content : '') || '<p>Escreva seu texto aqui.</p>' }} />
              </>
            )}
          </div>
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
              {isInlineEditing ? (
                <span
                  ref={(el) => { if (el) { el.focus(); const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r); } }}
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => {
                    const newText = (e.target as HTMLSpanElement).textContent || ''
                    if (newText !== p.text) {
                      onUpdateProps?.({ text: newText })
                    }
                    onExitInlineEdit?.()
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      ;(e.target as HTMLSpanElement).blur()
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      ;(e.target as HTMLSpanElement).textContent = p.text || ''
                      onExitInlineEdit?.()
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  style={{ outline: 'none', cursor: 'text', minWidth: 20, display: 'inline-block' }}
                >
                  {p.text}
                </span>
              ) : (
                <span
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    onEnterInlineEdit?.()
                  }}
                >
                  {p.text}
                </span>
              )}
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
                width: `${p.width ?? 100}%`,
                marginLeft: p.align === 'left' ? 0 : 'auto',
                marginRight: p.align === 'right' ? 0 : 'auto',
                marginTop: 0,
                marginBottom: 0,
              }}
            />
          </div>
        )

      // ── Spacer ──
      case 'spacer':
        return <div style={{ height: p.height || 32 }} />

      // ── Columns ──
      case 'columns': {
        const cols = p.columns || 2
        const gap = p.gap || 12
        return (
          <div style={{ ...pad, display: 'flex', gap }}>
            {Array.from({ length: cols }).map((_, i) => (
              <div key={i} style={{ flex: 1, minHeight: 60, border: '1px dashed #D1D5DB', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 11, color: '#9CA3AF' }}>Coluna {i + 1}</span>
              </div>
            ))}
          </div>
        )
      }

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
                      color: p.linkColor || '#6B7280',
                      fontSize: p.linkFontSize || 13,
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
              textAlign: (p.align as React.CSSProperties['textAlign']) || 'center',
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
                    color: p.linkColor || p.textColor || '#9CA3AF',
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
                    color: p.linkColor || p.textColor || '#9CA3AF',
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
                    color: p.linkColor || p.textColor || '#9CA3AF',
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
        const isListLayout = p.layout === 'list'
        const cols = isListLayout ? 1 : (p.columns || 2)
        const rows = p.rows || 2
        const total = isListLayout ? rows : cols * rows
        const imgRatio = p.imageRatio || 'square'
        const imgHeight = imgRatio === 'portrait' ? (p.maxImageHeight || 300) * 1.3 : imgRatio === 'landscape' ? (p.maxImageHeight || 300) * 0.65 : (p.maxImageHeight || 300)
        // eslint-disable-next-line react-hooks/rules-of-hooks
        const gridId = `pgrid-${block.id.replace(/[^a-z0-9]/gi,'')}`
        const subClick = (el: string) => (e: React.MouseEvent) => {
          e.stopPropagation()
          // Select the block too so the properties panel opens even when the
          // user clicks a sub-element (button/name/price) before selecting
          // the block itself. Without this, stopPropagation swallows the
          // block selection and the panel never appears.
          onSelect()
          onSelectSubElement?.(el)
        }
        const subRing = (el: string) => selectedSubElement === el ? 'outline outline-2 outline-zinc-900 outline-offset-1 rounded-sm' : 'hover:outline hover:outline-1 hover:outline-zinc-300 hover:outline-offset-1 rounded-sm cursor-pointer'
        return (
          <div
            style={{
              ...pad,
              backgroundColor: p.backgroundColor || undefined,
              containerType: 'inline-size' as any,
            }}
          >
            {p.stackOnMobile !== false && (
              <style dangerouslySetInnerHTML={{ __html: `@container (max-width: 420px) { .${gridId} { grid-template-columns: 1fr !important; } }` }} />
            )}
            {p.title && (
              <div onClick={subClick('title')} className={subRing('title')}>
                <p
                  style={{
                    fontSize: p.titleFontSize || 18,
                    fontWeight: p.titleWeight || 'bold',
                    color: p.titleColor || '#111827',
                    textAlign: (p.titleAlign as React.CSSProperties['textAlign']) || 'center',
                    margin: '0 0 16px',
                  }}
                >
                  {p.title}
                </p>
              </div>
            )}
            <div
              className={gridId}
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                gap: p.productPadding ?? 8,
              }}
            >
              {Array.from({ length: total }).map((_, i) => {
                const staticProd = p.staticProducts?.[i]
                return (
                <div key={i}>
                <div
                  style={{
                    border: `1px solid ${p.productBorderColor || '#E5E7EB'}`,
                    borderRadius: p.productBorderRadius ?? 8,
                    overflow: 'hidden',
                    background: '#fff',
                    textAlign: isListLayout ? 'left' : 'center',
                    display: isListLayout ? 'flex' : 'block',
                    gap: isListLayout ? 12 : undefined,
                  }}
                >
                  <div onClick={subClick('image')} className={subRing('image')}
                    style={{
                      background: '#F3F4F6',
                      height: isListLayout ? 80 : imgHeight,
                      width: isListLayout ? 80 : undefined,
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#9CA3AF',
                      fontSize: 12,
                      overflow: 'hidden',
                      transition: 'outline-color 0.15s',
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
                      <div onClick={subClick('name')} className={subRing('name')}>
                        <p
                          style={{
                            margin: 0,
                            fontWeight: p.nameWeight || '600',
                            fontSize: p.nameFontSize || 14,
                            color: p.nameColor || '#111827',
                            padding: '2px 0',
                          }}
                        >
                          {staticProd?.title || 'Nome do produto'}
                        </p>
                      </div>
                    )}
                    {p.showPrice !== false && (
                      <div onClick={subClick('price')} className={subRing('price')} style={{ marginTop: 4, padding: '2px 0' }}>
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
                            color: p.priceColor || '#18181B',
                          }}
                        >
                          {staticProd?.price ? `R$ ${staticProd.price.toFixed(2)}` : 'R$ XX,XX'}
                        </span>
                      </div>
                    )}
                    {p.showButton !== false && (
                      <div onClick={subClick('button')} className={subRing('button')} style={{ marginTop: 8, textAlign: p.buttonAlign as any || undefined }}>
                        <a
                          href="#"
                          onClick={preventDefault}
                          style={{
                            display: p.buttonFullWidth ? 'block' : 'inline-block',
                            padding: `${p.buttonPaddingV ?? 6}px ${p.buttonPaddingH ?? 16}px`,
                            background: p.buttonColor || '#18181B',
                            color: p.buttonTextColor || '#FFFFFF',
                            borderRadius: p.buttonRadius ?? 6,
                            fontSize: p.buttonFontSize || 12,
                            fontWeight: 600,
                            textDecoration: 'none',
                          }}
                        >
                          {p.buttonText || 'Comprar'}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
                {/* Separator */}
                {p.showSeparator && i < total - 1 && (
                  <hr style={{ border: 'none', borderTop: `1px solid ${p.separatorColor || '#E5E7EB'}`, margin: `${(p.productPadding ?? 8) / 2}px 0` }} />
                )}
                </div>
                )
              })}
            </div>
          </div>
        )
      }

      // ── Abandoned Cart ──
      case 'abandoned-cart': {
        const maxItems = p.maxItems ?? 0
        // maxItems 0 = "todos" — render a representative stack in the editor.
        const previewCount = maxItems && maxItems > 0 ? Math.min(maxItems, 6) : 3
        const layout = p.layoutType || 'image-left'
        const isVertical = layout === 'vertical'
        const imgW = p.imageWidth || 200
        // A mesma caixa que o envio usa: quadrada quando ninguém
        // escolheu altura. O editor já desenhava assim; quem discordava
        // era o HTML enviado.
        const imgH = p.imageHeight || imgW
        const imgR = p.imageBorderRadius ?? 0
        const sampleProducts = [
          { name: 'Product name', desc: 'Product description', price: 'R$0.00', oldPrice: 'R$0.00' },
          { name: 'Product name', desc: 'Product description', price: 'R$0.00', oldPrice: 'R$0.00' },
          { name: 'Product name', desc: 'Product description', price: 'R$0.00', oldPrice: 'R$0.00' },
        ]
        const btnAlign = p.buttonAlign || 'left'
        // Sub-element click handler (compound block)
        const subClick = (el: string) => (e: React.MouseEvent) => {
          e.stopPropagation()
          // Select the block so the properties panel (with the button editor)
          // opens when clicking the button/name/price directly on the canvas.
          onSelect()
          onSelectSubElement?.(el)
        }
        const subRing = (el: string) => selectedSubElement === el ? 'outline outline-2 outline-zinc-900 outline-offset-1 rounded-sm' : 'hover:outline hover:outline-1 hover:outline-zinc-300 hover:outline-offset-1 rounded-sm cursor-pointer'
        // Show only first product for compact preview, but render all
        return (
          <div style={{ ...pad, backgroundColor: p.backgroundColor || undefined }}>
            <div>
              {Array.from({ length: previewCount }).map((_, i) => {
                const prod = sampleProducts[i % sampleProducts.length]
                return (
                  <div key={i}>
                    <div style={{
                      display: isVertical ? 'block' : 'flex',
                      gap: isVertical ? 0 : 20,
                      flexDirection: layout === 'image-right' ? 'row-reverse' : 'row',
                      padding: '16px 0',
                    }}>
                      {/* Image — clickable */}
                      {p.showImage !== false && (
                        <div onClick={subClick('image')} className={subRing('image')} style={{
                          width: isVertical ? '100%' : imgW,
                          height: imgH,
                          flexShrink: 0, background: '#F3F4F6', borderRadius: imgR,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#9CA3AF', fontSize: 12, transition: 'outline-color 0.15s',
                        }}>
                          Product image
                        </div>
                      )}
                      {/* Details column */}
                      <div style={{ flex: 1, minWidth: 0, padding: isVertical ? '12px 0 0' : '0' }}>
                        {/* Name — clickable */}
                        {p.showName !== false && (
                          <div onClick={subClick('name')} className={subRing('name')}>
                            <p style={{ margin: 0, fontWeight: p.nameWeight || '600', fontSize: p.nameFontSize || 14, color: p.nameColor || '#111827', fontFamily: p.nameFontFamily || 'inherit', padding: '2px 0' }}>
                              {prod.name}
                            </p>
                          </div>
                        )}
                        {/* Description — clickable */}
                        {p.showDescription !== false && (
                          <div onClick={subClick('description')} className={subRing('description')}>
                            <p style={{ margin: '4px 0 0', fontSize: p.descFontSize || 13, color: p.descColor || '#6B7280', fontWeight: p.descWeight || '400', padding: '2px 0' }}>
                              {prod.desc}
                            </p>
                          </div>
                        )}
                        {/* Price — clickable */}
                        {(p.showPrice !== false || p.showOldPrice !== false) && (
                          <div onClick={subClick('price')} className={subRing('price')} style={{ marginTop: 8, display: 'inline-flex', alignItems: 'baseline', gap: 6, padding: '2px 0' }}>
                            {p.showPrice !== false && (
                              <span style={{ fontWeight: p.priceWeight || '600', fontSize: p.priceFontSize || 14, color: p.priceColor || '#111827' }}>
                                {prod.price}
                              </span>
                            )}
                            {p.showOldPrice !== false && (
                              <span style={{ fontSize: (p.priceFontSize || 14) - 1, color: p.oldPriceColor || '#9CA3AF', textDecoration: 'line-through' }}>
                                {prod.oldPrice}
                              </span>
                            )}
                          </div>
                        )}
                        {/* Button — clickable */}
                        {p.showButton !== false && (
                          <div onClick={subClick('button')} className={subRing('button')} style={{ marginTop: 10, textAlign: btnAlign === 'full' ? undefined : btnAlign as any }}>
                            <a href="#" onClick={e => e.preventDefault()} style={{
                              display: btnAlign === 'full' ? 'block' : 'inline-block',
                              padding: `${p.buttonPaddingV || 10}px ${p.buttonPaddingH || 24}px`,
                              background: p.buttonColor || '#111827', color: p.buttonTextColor || '#FFFFFF',
                              borderRadius: p.buttonRadius ?? 4, fontSize: p.buttonFontSize || 14,
                              fontWeight: 600, textDecoration: 'none', textAlign: 'center',
                            }}>
                              {p.buttonText || 'Comprar agora'}
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                    {p.separator !== false && i < previewCount - 1 && (
                      <hr style={{ border: 'none', borderTop: `1px solid ${p.separatorColor || '#E5E7EB'}`, margin: 0 }} />
                    )}
                  </div>
                )
              })}
            </div>
            {/* Editor-only note (not exported) — shown when stacking all items. */}
            {(!maxItems || maxItems <= 0) && (
              <p style={{ margin: '8px 0 0', fontSize: 11, color: '#9CA3AF', fontStyle: 'italic', textAlign: 'center' }}>
                Todos os produtos do gatilho serão empilhados aqui
              </p>
            )}
          </div>
        )
      }

      // ── Order Products ──
      case 'order-products': {
        const sampleItems = [
          { name: 'Nome do produto', qty: 1, price: 'R$0,00', variant: 'Variante', img: '' },
          { name: 'Nome do produto', qty: 1, price: 'R$0,00', variant: 'Variante', img: '' },
        ]
        const imgW = p.imageWidth || 80
        const imgR = p.imageBorderRadius ?? 4
        const primColor = p.primaryTextColor || '#000000'
        const secColor = p.secondaryTextColor || '#AFAFAF'
        const priceColor = p.priceTextColor || '#000000'
        const divColor = p.dividerColor || '#EDEDED'
        const titleColor = p.titleColor || primColor
        const metaColor = p.metaColor || secColor
        return (
          <div style={{ ...pad, backgroundColor: p.backgroundColor || undefined }}>
            {/* Title */}
            {p.showTitle !== false && (
              <div style={{
                textAlign: (p.titleAlign || 'center') as any,
                fontSize: p.titleFontSize || 24,
                fontWeight: p.titleWeight || 700,
                color: titleColor,
                lineHeight: 1.3,
                paddingBottom: 8,
              }}>
                {p.titleText || 'Resumo do Pedido'}
              </div>
            )}
            {/* Order meta */}
            {(p.showOrderNumber !== false || p.showOrderDate !== false) && (
              <div style={{
                textAlign: (p.metaAlign || 'center') as any,
                fontSize: p.metaFontSize || 13,
                color: metaColor,
                lineHeight: 1.5,
                paddingBottom: 20,
              }}>
                {p.showOrderNumber !== false && (
                  <div>{(p.orderNumberLabel || 'Pedido')}: #1001</div>
                )}
                {p.showOrderDate !== false && (
                  <div>17 de abril de 2026 14:30</div>
                )}
              </div>
            )}
            {sampleItems.map((item, i) => (
              <div key={i}>
                <div style={{ display: 'flex', alignItems: 'center', padding: '16px 0' }}>
                  {p.showImage !== false && (
                    <div style={{
                      width: imgW, height: imgW, flexShrink: 0,
                      background: '#F3F4F6', borderRadius: imgR,
                      marginRight: 16,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#9CA3AF', fontSize: 10,
                    }}>
                      Imagem
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {p.showName !== false && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: primColor, lineHeight: 1.45 }}>
                          {item.name}{p.showQuantity !== false ? ` × ${item.qty}` : ''}
                        </span>
                        {p.showPrice !== false && (
                          <span style={{ fontSize: 14, fontWeight: 600, color: priceColor, whiteSpace: 'nowrap' }}>{item.price}</span>
                        )}
                      </div>
                    )}
                    {p.showVariant !== false && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, color: secColor, lineHeight: 1.5, marginTop: 4 }}>
                        <span>Variante:</span><span>{item.variant}</span>
                      </div>
                    )}
                    {p.showSku && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 11, color: secColor, lineHeight: 1.5, marginTop: 2 }}>
                        <span>SKU:</span><span>ABC123</span>
                      </div>
                    )}
                    {p.showDiscount && (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, color: secColor, marginTop: 6 }}>
                          <span>Desconto:</span><span>-R$0,00</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, fontWeight: 600, color: primColor, marginTop: 2 }}>
                          <span>Preço com desconto:</span><span style={{ color: priceColor, fontWeight: 700 }}>R$0,00</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                {p.separator !== false && i < sampleItems.length - 1 && (
                  <hr style={{ border: 'none', borderTop: `1px solid ${p.separatorColor || divColor}`, margin: 0 }} />
                )}
              </div>
            ))}
            {p.showTotals !== false && (
              <div style={{ borderTop: `1px solid ${divColor}`, marginTop: 8, paddingTop: 18 }}>
                {p.showTotalDiscount !== false && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: secColor, padding: '6px 0' }}>
                    <span>Desconto:</span><span>-R$0,00</span>
                  </div>
                )}
                {p.showSubtotal !== false && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: secColor, padding: '6px 0' }}>
                    <span>Subtotal:</span><span>R$0,00</span>
                  </div>
                )}
                {p.showShipping !== false && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: secColor, padding: '6px 0' }}>
                    <span>Frete:</span><span>R$0,00</span>
                  </div>
                )}
                {p.showTax !== false && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: secColor, padding: '6px 0' }}>
                    <span>Taxa:</span><span>R$0,00</span>
                  </div>
                )}
                <hr style={{ border: 'none', borderTop: `1px solid ${divColor}`, margin: '14px 0 4px' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700, color: p.totalTextColor || primColor, paddingTop: 4 }}>
                  <span>Total:</span><span>R$0,00</span>
                </div>
              </div>
            )}
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
              <p style={{
                margin: '0 0 12px', fontSize: p.headerFontSize || 14,
                color: p.headerColor || '#9A3412',
                fontWeight: p.headerFontWeight || '500',
                textAlign: (p.headerAlign as React.CSSProperties['textAlign']) || 'center',
              }}>
                {p.headerText}
              </p>
            )}
            <p
              style={{
                margin: 0,
                fontSize: p.codeFontSize || 32,
                fontWeight: p.codeFontWeight || 'bold',
                color: p.codeColor || '#EA580C',
                letterSpacing: p.codeLetterSpacing ?? 4,
                border: p.borderStyle === 'none' ? 'none' : `${p.borderWidth ?? 2}px ${p.borderStyle || 'dashed'} ${p.borderColor || '#EA580C'}`,
                borderRadius: p.borderRadius ?? 12,
                display: 'inline-block',
                padding: `${p.codePaddingV ?? 10}px ${p.codePaddingH ?? 28}px`,
                backgroundColor: p.codeBgColor || undefined,
                maxWidth: '100%',
                boxSizing: 'border-box' as const,
                wordBreak: 'break-all' as const,
                overflowWrap: 'break-word' as const,
              }}
            >
              {p.code || 'CODIGO'}
            </p>
            {p.footerText && (
              <p style={{
                margin: '12px 0 0', fontSize: p.footerFontSize || 12,
                color: p.footerColor || '#9CA3AF',
                fontWeight: p.footerFontWeight || 'normal',
              }}>
                {p.footerText}
              </p>
            )}
          </div>
        )

      // ── Split ──
      case 'split': {
        const isImageLeft = (p.layout || 'image-left') === 'image-left'
        const ratio = p.splitRatio || 50
        const imageSide = (
          <div style={{ flex: `0 0 ${ratio}%`, minWidth: 0 }}>
            <img
              src={p.imageSrc}
              alt={p.imageAlt || ''}
              style={{
                width: p.imageWidth || '100%',
                height: 'auto',
                display: 'block',
              }}
            />
          </div>
        )
        const textSide = (
          <div style={{ flex: 1, minWidth: 0, padding: 12 }}>
            {p.textHtml && (
              <div dangerouslySetInnerHTML={{ __html: p.textHtml }} />
            )}
            {p.showButton && p.buttonText && (
              <a
                href="#"
                onClick={preventDefault}
                style={{
                  display: 'inline-block',
                  marginTop: 12,
                  padding: '10px 20px',
                  backgroundColor: p.buttonColor || '#18181B',
                  color: p.buttonTextColor || '#FFFFFF',
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 'bold',
                  textDecoration: 'none',
                }}
              >
                {p.buttonText}
              </a>
            )}
          </div>
        )
        return (
          <div
            style={{
              ...pad,
              backgroundColor: p.backgroundColor || undefined,
              display: 'flex',
              alignItems: 'stretch',
            }}
          >
            {isImageLeft ? (
              <>
                {imageSide}
                {textSide}
              </>
            ) : (
              <>
                {textSide}
                {imageSide}
              </>
            )}
          </div>
        )
      }

      // ── Header Bar ──
      case 'header-bar': {
        const links: { text: string; url: string }[] = p.links || []
        const separator = p.separator || '|'
        return (
          <div
            style={{
              ...pad,
              backgroundColor: p.backgroundColor || undefined,
              textAlign: (p.align as React.CSSProperties['textAlign']) || 'center',
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0,
              }}
            >
              {links.map((link, i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center' }}>
                  {i > 0 && (
                    <span
                      style={{
                        color: p.separatorColor || '#9CA3AF',
                        margin: '0 8px',
                        fontSize: p.fontSize || 13,
                      }}
                    >
                      {separator}
                    </span>
                  )}
                  <a
                    href="#"
                    onClick={preventDefault}
                    style={{
                      color: p.textColor || '#6B7280',
                      fontSize: p.fontSize || 13,
                      textDecoration: 'none',
                    }}
                  >
                    {link.text}
                  </a>
                </span>
              ))}
            </div>
          </div>
        )
      }

      // ── Drop Shadow ──
      case 'drop-shadow': {
        const opacityMap: Record<string, number> = { light: 0.05, dark: 0.12, darker: 0.2 }
        const opacity = opacityMap[p.shadowType || 'light'] ?? 0.05
        return (
          <div
            style={{
              ...pad,
              backgroundColor: p.backgroundColor || undefined,
            }}
          >
            <div
              style={{
                height: p.height || 8,
                background: `linear-gradient(to bottom, rgba(0,0,0,${opacity}), transparent)`,
              }}
            />
          </div>
        )
      }

      // ── Table ──
      case 'table': {
        const data: string[][] = p.data || []
        const cols = data[0]?.length || p.cols || 2
        const borderW = p.borderWidth ?? 1
        const cellPad = p.cellPadding ?? 10
        const tAlign = (p.textAlign as React.CSSProperties['textAlign']) || 'left'
        const tableRadius = p.tableBorderRadius ?? 0

        return (
          <div style={{ ...pad, backgroundColor: p.backgroundColor || undefined, overflowX: 'auto' }}>
            <table style={{
              width: '100%', borderCollapse: tableRadius > 0 ? 'separate' : 'collapse',
              borderSpacing: tableRadius > 0 ? 0 : undefined,
              fontSize: p.cellFontSize || 14,
              borderRadius: tableRadius,
              overflow: 'hidden',
              border: borderW > 0 ? `${borderW}px solid ${p.borderColor || '#E5E7EB'}` : 'none',
            }}>
              {p.headerRow && data[0] && (
                <thead>
                  <tr>
                    {data[0].map((cell: string, c: number) => (
                      <th key={c} style={{
                        padding: `${cellPad}px ${cellPad + 4}px`,
                        backgroundColor: p.headerBgColor || '#111827',
                        color: p.headerTextColor || '#FFFFFF',
                        fontWeight: p.headerFontWeight || 600,
                        textAlign: tAlign,
                        borderBottom: borderW > 0 ? `${borderW}px solid ${p.borderColor || '#E5E7EB'}` : 'none',
                        borderRight: c < cols - 1 && borderW > 0 ? `${borderW}px solid ${p.borderColor || '#E5E7EB'}` : 'none',
                        fontSize: p.headerFontSize || (p.cellFontSize || 14),
                      }}>
                        {cell || `Coluna ${c + 1}`}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {data.slice(p.headerRow ? 1 : 0).map((row: string[], ri: number) => {
                  const isStriped = p.stripedRows && ri % 2 === 1
                  return (
                    <tr key={ri}>
                      {row.map((cell: string, ci: number) => (
                        <td key={ci} style={{
                          padding: `${cellPad}px ${cellPad + 4}px`,
                          color: p.cellTextColor || '#374151',
                          backgroundColor: isStriped ? (p.stripedColor || '#F9FAFB') : (p.cellBgColor || undefined),
                          borderBottom: ri < data.length - (p.headerRow ? 2 : 1) && borderW > 0 ? `${borderW}px solid ${p.borderColor || '#E5E7EB'}` : 'none',
                          borderRight: ci < cols - 1 && borderW > 0 ? `${borderW}px solid ${p.borderColor || '#E5E7EB'}` : 'none',
                          textAlign: tAlign,
                        }}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      }

      // ── Review Quote ──
      case 'review-quote': {
        const rating = Math.min(5, Math.max(0, p.rating ?? 5))
        const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating)
        return (
          <div
            style={{
              ...pad,
              backgroundColor: p.backgroundColor || undefined,
              textAlign: (p.quoteAlign as React.CSSProperties['textAlign']) || 'center',
            }}
          >
            {p.showStars !== false && (
              <div
                style={{
                  fontSize: (p.quoteFontSize || 18) + 4,
                  color: p.starColor || '#FBBF24',
                  marginBottom: 8,
                  letterSpacing: 2,
                }}
              >
                {stars}
              </div>
            )}
            <blockquote
              style={{
                margin: 0,
                fontSize: p.quoteFontSize || 18,
                color: p.quoteColor || '#374151',
                fontStyle: p.quoteStyle || 'italic',
                lineHeight: 1.6,
              }}
            >
              &ldquo;{p.quote || 'Customer quote here.'}&rdquo;
            </blockquote>
            {p.author && (
              <p
                style={{
                  marginTop: 12,
                  marginBottom: 0,
                  fontSize: p.authorFontSize || 14,
                  color: p.authorColor || '#6B7280',
                  fontWeight: 600,
                }}
              >
                — {p.author}
              </p>
            )}
          </div>
        )
      }

      // ── Countdown ──
      case 'countdown': {
        const CountdownLive = () => {
          const [now, setNow] = useState(Date.now())
          useEffect(() => {
            const id = setInterval(() => setNow(Date.now()), 1000)
            return () => clearInterval(id)
          }, [])

          const end = new Date(p.endDate).getTime()
          const diff = Math.max(0, end - now)
          const d = Math.floor(diff / (86400000))
          const h = Math.floor((diff % 86400000) / 3600000)
          const m = Math.floor((diff % 3600000) / 60000)
          const s = Math.floor((diff % 60000) / 1000)
          const values = [d, h, m, s]

          const styleType = p.style || 'dark'
          const labels = p.labels || { days: 'DIAS', hours: 'HORAS', minutes: 'MIN', seconds: 'SEG' }
          const labelKeys = ['days', 'hours', 'minutes', 'seconds'] as const

          const presets: Record<string, { numColor: string; lblColor: string; bxColor: string; bg: string; sepColor: string; ttlColor: string }> = {
            dark: { numColor: '#FFFFFF', lblColor: '#9CA3AF', bxColor: '#1F2937', bg: '#111827', sepColor: '#6B7280', ttlColor: '#F9FAFB' },
            light: { numColor: '#111827', lblColor: '#6B7280', bxColor: '#F3F4F6', bg: '#FFFFFF', sepColor: '#D1D5DB', ttlColor: '#111827' },
            brand: { numColor: '#FFFFFF', lblColor: 'rgba(255,255,255,0.75)', bxColor: '#27272A', bg: '#18181B', sepColor: 'rgba(255,255,255,0.5)', ttlColor: '#FFFFFF' },
            minimal: { numColor: '#111827', lblColor: '#9CA3AF', bxColor: 'transparent', bg: 'transparent', sepColor: '#D1D5DB', ttlColor: '#374151' },
            urgent: { numColor: '#FFFFFF', lblColor: 'rgba(255,255,255,0.8)', bxColor: '#991B1B', bg: '#DC2626', sepColor: 'rgba(255,255,255,0.4)', ttlColor: '#FFFFFF' },
          }
          const preset = presets[styleType] || presets.dark
          const nc = p.numberColor || preset.numColor
          const lc = p.labelColor || preset.lblColor
          const bc = p.boxColor || preset.bxColor
          const bgc = p.backgroundColor || preset.bg
          const sc = p.separatorColor || preset.sepColor
          const tc = p.titleColor || preset.ttlColor
          const br = p.boxBorderRadius ?? 12
          const isExpired = diff <= 0

          return (
            <div style={{ ...pad, backgroundColor: bgc, textAlign: 'center', padding: '24px 16px' }}>
              {isExpired ? (
                <div style={{ fontSize: 20, fontWeight: 700, color: nc }}>{p.expiredText || 'Oferta encerrada'}</div>
              ) : (
                <>
                  {p.title && (
                    <div style={{ fontSize: 13, fontWeight: 700, color: tc, letterSpacing: 3, textTransform: 'uppercase' as const, marginBottom: 16 }}>
                      {p.title}
                    </div>
                  )}
                  <div style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 0, flexWrap: 'wrap', justifyContent: 'center', maxWidth: '100%' }}>
                    {values.map((val, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 0, flexShrink: 0 }}>
                        {i > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '14px 4px 0', marginBottom: 18 }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: sc }} />
                            <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: sc }} />
                          </div>
                        )}
                        <div style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center',
                          backgroundColor: bc, borderRadius: br,
                          padding: styleType === 'minimal' ? '6px 10px 4px' : '12px 14px 8px',
                          minWidth: 56,
                          border: p.boxBorder ? `2px solid ${p.boxBorder}` : 'none',
                        }}>
                          <span style={{ fontSize: p.fontSize || 36, fontWeight: 800, color: nc, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                            {String(val).padStart(2, '0')}
                          </span>
                          <span style={{ fontSize: p.labelFontSize || 10, fontWeight: 600, color: lc, marginTop: 6, letterSpacing: 1.5, textTransform: 'uppercase' as const }}>
                            {labels[labelKeys[i]] || labelKeys[i]}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )
        }
        return <CountdownLive />
      }

      // ── Fallback ──
      default:
        return (
          <div style={{ padding: 20, color: '#9CA3AF', textAlign: 'center' }}>
            Bloco: {block.type}
          </div>
        )
    }
  }

  return (
    <div
      onClick={onSelect}
      className={`relative group transition-all cursor-pointer ${
        selected
          ? 'ring-2 ring-zinc-900 ring-offset-1'
          : 'hover:ring-1 hover:ring-zinc-400'
      }`}
    >
      {(() => { try { return renderBlock() } catch (err) { return <div className="p-4 text-center text-red-400 text-xs">Erro ao renderizar bloco: {block.type}</div> } })()}

      {/* Floating toolbar — compact, no arrows (drag to reorder) */}
      {selected && (
        <div className="absolute -top-7 right-0 flex items-center gap-0.5 bg-white border border-gray-200 rounded-md shadow-md px-1 py-0.5 z-10">
          <button
            onClick={(e) => { e.stopPropagation(); onClone() }}
            className="p-1 text-gray-400 hover:text-blue-600 text-xs"
            title="Duplicar"
          >
            <Copy size={13} />
          </button>
          <div className="w-px h-3.5 bg-gray-200" />
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="p-1 text-gray-400 hover:text-red-600 text-xs"
            title="Excluir"
          >
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  )
}
