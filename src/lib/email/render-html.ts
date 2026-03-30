// ═══════════════════════════════════════════
// Worder Email Builder v2 — JSON to HTML Renderer
// Supports: Document → Sections → Columns → Blocks
// ═══════════════════════════════════════════

import type { EmailBlock, EmailSection, EmailDocument, Padding } from '@/components/email-builder/config/types'
import { migrateV1toV2 } from '@/components/email-builder/config/types'

function pad(p: Padding | number | undefined): string {
  if (!p) return '0'
  if (typeof p === 'number') return `${p}px`
  return `${p.top || 0}px ${p.right || 0}px ${p.bottom || 0}px ${p.left || 0}px`
}

function renderBlock(block: EmailBlock, font: string): string {
  const p = block.props
  const blockPad = pad(p.padding)

  switch (block.type) {
    case 'text':
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding:${blockPad};color:${p.color || '#374151'};font-size:${p.fontSize || 15}px;line-height:${p.lineHeight || 1.6};text-align:${p.align || 'left'};font-family:${font};${p.backgroundColor ? `background-color:${p.backgroundColor};` : ''}">${p.contentHtml || p.content || ''}</td></tr></table>`

    case 'image': {
      const img = `<img src="${p.src || ''}" alt="${p.alt || ''}" width="${p.width || 560}" style="max-width:100%;height:auto;display:block;margin:0 auto;${p.borderRadius ? `border-radius:${p.borderRadius}px;` : ''}" />`
      const linked = p.href ? `<a href="${p.href}" target="_blank" style="text-decoration:none;">${img}</a>` : img
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding:${blockPad};text-align:${p.align || 'center'};${p.backgroundColor ? `background-color:${p.backgroundColor};` : ''}">${linked}</td></tr></table>`
    }

    case 'button':
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding:${blockPad};text-align:${p.align || 'center'};${p.backgroundColor ? `background-color:${p.backgroundColor};` : ''}"><table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:${p.align === 'left' ? '0' : p.align === 'right' ? '0 0 0 auto' : '0 auto'};${p.fullWidth ? 'width:100%;' : ''}"><tr><td style="background-color:${p.bgColor || '#F97316'};border-radius:${p.borderRadius || 8}px;padding:${p.paddingV || 13}px ${p.paddingH || 28}px;text-align:center;"><a href="${p.href || '#'}" style="color:${p.textColor || '#fff'};font-size:${p.fontSize || 15}px;font-weight:${p.fontWeight || 'bold'};text-decoration:none;display:block;font-family:${font};">${p.text || ''}</a></td></tr></table></td></tr></table>`

    case 'divider':
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding:${blockPad};"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="border-top:${p.thickness || 1}px ${p.style || 'solid'} ${p.color || '#E5E7EB'};font-size:1px;line-height:1px;">&nbsp;</td></tr></table></td></tr></table>`

    case 'spacer':
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="height:${p.height || 32}px;line-height:${p.height || 32}px;font-size:1px;">&nbsp;</td></tr></table>`

    case 'html':
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding:${blockPad};">${p.code || ''}</td></tr></table>`

    case 'video':
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding:${blockPad};text-align:center;"><a href="${p.videoUrl || '#'}" target="_blank"><img src="${p.thumbnailUrl || ''}" alt="Video" width="560" style="max-width:100%;height:auto;display:block;margin:0 auto;border-radius:8px;" /></a></td></tr></table>`

    case 'social': {
      const icons: Record<string, string> = { instagram: '📸', facebook: '📘', tiktok: '🎵', youtube: '▶️', twitter: '🐦', linkedin: '💼', whatsapp: '💬' }
      const nets = (p.networks || []).filter((n: any) => n.url && n.enabled !== false)
      const html = nets.map((n: any) => `<a href="${n.url}" style="text-decoration:none;font-size:${p.iconSize || 32}px;margin:0 ${(p.spacing || 10) / 2}px;" target="_blank">${icons[n.type] || '🔗'}</a>`).join('')
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding:${blockPad};text-align:${p.align || 'center'};">${html}</td></tr></table>`
    }

    case 'header':
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding:${blockPad};background-color:${p.backgroundColor || '#fff'};text-align:center;">${p.logoHref ? `<a href="${p.logoHref}" style="text-decoration:none;">` : ''}<img src="${p.logoSrc || ''}" alt="Logo" width="${p.logoWidth || 160}" style="display:block;margin:0 auto;max-width:100%;height:auto;" />${p.logoHref ? '</a>' : ''}${p.showLinks && p.links?.length ? `<p style="margin:12px 0 0;font-size:13px;font-family:${font};">${p.links.map((l: any) => `<a href="${l.url}" style="color:#6B7280;text-decoration:none;margin:0 8px;">${l.text}</a>`).join('')}</p>` : ''}</td></tr></table>`

    case 'footer':
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding:${blockPad};background-color:${p.backgroundColor || '#F9FAFB'};text-align:center;font-size:${p.fontSize || 11}px;color:${p.textColor || '#9CA3AF'};font-family:${font};line-height:1.5;"><p style="margin:0;">${p.companyName || ''}</p>${p.address ? `<p style="margin:4px 0 0;">${p.address}</p>` : ''}<p style="margin:8px 0 0;">${p.showUnsubscribe ? '<a href="{{unsubscribe_url}}" style="color:#9CA3AF;text-decoration:underline;">Descadastrar-se</a>' : ''}${p.showUnsubscribe && p.showViewInBrowser ? ' · ' : ''}${p.showViewInBrowser ? '<a href="{{view_in_browser_url}}" style="color:#9CA3AF;text-decoration:underline;">Ver no navegador</a>' : ''}</p></td></tr></table>`

    case 'product-grid':
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding:${blockPad};${p.backgroundColor ? `background-color:${p.backgroundColor};` : ''}">${p.title ? `<p style="margin:0 0 16px;font-size:18px;font-weight:bold;color:#111827;text-align:center;font-family:${font};">${p.title}</p>` : ''}<!-- WORDER_PRODUCT_BLOCK:${p.feedType || 'bestsellers'}:${(p.columns || 2) * (p.rows || 2)}:${p.columns || 2}:${p.showPrice !== false}:${p.showComparePrice !== false}:${p.showButton !== false}:${encodeURIComponent(p.buttonText || 'Comprar')} --></td></tr></table>`

    case 'abandoned-cart':
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding:${blockPad};background-color:${p.backgroundColor || '#FFFBEB'};font-family:${font};"><p style="margin:0 0 4px;font-size:22px;font-weight:bold;color:#111827;text-align:center;">${p.title || ''}</p><p style="margin:0 0 20px;font-size:14px;color:#6B7280;text-align:center;">${p.subtitle || ''}</p><!-- WORDER_PRODUCT_BLOCK:cart_items:${p.maxItems || 3}:1:${p.showPrice !== false}:false:true:${encodeURIComponent(p.buttonText || 'Finalizar Compra')} --></td></tr></table>`

    case 'coupon':
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding:${blockPad};background-color:${p.backgroundColor || '#FFF7ED'};text-align:center;font-family:${font};"><p style="margin:0;font-size:14px;color:#9A3412;">${p.headerText || ''}</p><p style="margin:10px 0;font-size:${p.codeFontSize || 32}px;font-weight:bold;color:${p.codeColor || '#EA580C'};letter-spacing:4px;border:2px ${p.borderStyle || 'dashed'} ${p.borderColor || '#EA580C'};border-radius:${p.borderRadius || 12}px;display:inline-block;padding:10px 28px;">${p.code || ''}</p><p style="margin:0;font-size:12px;color:#9CA3AF;">${p.footerText || ''}</p></td></tr></table>`

    default:
      return ''
  }
}

function renderSection(section: EmailSection, font: string): string {
  const s = section.styles
  const sectionPad = pad(s.padding)
  const bg = s.backgroundColor ? `background-color:${s.backgroundColor};` : ''
  const stackClass = s.stackOnMobile ? ' class="worder-section-stack"' : ''

  if (section.columns.length === 1) {
    // Single column — simple render
    const blocksHtml = section.columns[0].blocks.map(b => renderBlock(b, font)).join('\n')
    return `<tr><td style="${bg}padding:${sectionPad};">${blocksHtml}</td></tr>`
  }

  // Multi-column
  const colsHtml = section.columns.map(col => {
    const blocksHtml = col.blocks.map(b => renderBlock(b, font)).join('\n')
    return `<td width="${col.width}%" valign="top" style="vertical-align:top;">${blocksHtml}</td>`
  }).join('\n')

  return `<tr><td style="${bg}padding:${sectionPad};"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"${stackClass}><tr>${colsHtml}</tr></table></td></tr>`
}

export function renderDocumentToHtml(doc: any): string {
  // Migrate if needed
  const d: EmailDocument = doc?.version === 2 ? doc : migrateV1toV2(doc)
  const s = d.settings
  const font = s.fontFamily || "'DM Sans', Arial, sans-serif"
  const w = s.contentWidth || 600

  const sectionsHtml = d.sections.map(sec => renderSection(sec, font)).join('\n')

  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="X-UA-Compatible" content="IE=edge"><meta name="x-apple-disable-message-reformatting"><title></title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>*{box-sizing:border-box}body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}img{-ms-interpolation-mode:bicubic;border:0;height:auto;line-height:100%;outline:none;text-decoration:none}body{margin:0;padding:0;width:100%!important}@media only screen and (max-width:620px){.email-container{width:100%!important;max-width:100%!important}.worder-section-stack td{display:block!important;width:100%!important}}</style>
</head>
<body style="margin:0;padding:0;background-color:${s.backgroundColor || '#f3f4f6'};font-family:${font};">
${s.preheaderText ? `<div style="display:none;max-height:0;overflow:hidden;">${s.preheaderText}</div>` : ''}
<center style="width:100%;background-color:${s.backgroundColor || '#f3f4f6'};">
<!--[if mso]><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="${w}" align="center"><tr><td><![endif]-->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="${w}" class="email-container" style="max-width:${w}px;margin:0 auto;background-color:${s.contentBackgroundColor || '#fff'};${s.borderRadius ? `border-radius:${s.borderRadius}px;overflow:hidden;` : ''}">
${sectionsHtml}
</table>
<!--[if mso]></td></tr></table><![endif]-->
</center>
</body>
</html>`
}
