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
      return `<tr><td style="padding:${blockPad};color:${p.color || '#374151'};font-size:${p.fontSize || 16}px;line-height:${p.lineHeight || 1.6};text-align:${p.align || 'left'};font-family:${font};${p.backgroundColor ? `background-color:${p.backgroundColor};` : ''}">${p.contentHtml || p.content || ''}</td></tr>`

    case 'image': {
      const img = `<img src="${p.src || ''}" alt="${p.alt || ''}" width="${p.width || 600}" style="max-width:100%;height:auto;display:block;margin:0 auto;border:0;outline:0;vertical-align:bottom;${p.borderRadius ? `border-radius:${p.borderRadius}px;` : ''}" />`
      const linked = p.href ? `<a href="${p.href}" target="_blank" style="text-decoration:none;display:block;line-height:0;font-size:0;">${img}</a>` : img
      return `<tr><td style="padding:${blockPad};text-align:${p.align || 'center'};line-height:0;font-size:0;${p.backgroundColor ? `background-color:${p.backgroundColor};` : ''}">${linked}</td></tr>`
    }

    case 'button':
      return `<tr><td style="padding:${blockPad};text-align:${p.align || 'center'};${p.backgroundColor ? `background-color:${p.backgroundColor};` : ''}"><table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:${p.align === 'left' ? '0' : p.align === 'right' ? '0 0 0 auto' : '0 auto'};${p.fullWidth ? 'width:100%;' : ''}"><tr><td style="background-color:${p.bgColor || '#F97316'};border-radius:${p.borderRadius || 8}px;padding:${p.paddingV || 14}px ${p.paddingH || 32}px;text-align:center;"><a href="${p.href || '#'}" style="color:${p.textColor || '#fff'};font-size:${p.fontSize || 16}px;font-weight:${p.fontWeight || 'bold'};text-decoration:none;display:block;font-family:${font};">${p.text || ''}</a></td></tr></table></td></tr>`

    case 'divider':
      return `<tr><td style="padding:${blockPad};"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="border-top:${p.thickness || 1}px ${p.style || 'solid'} ${p.color || '#E5E7EB'};font-size:1px;line-height:1px;">&nbsp;</td></tr></table></td></tr>`

    case 'spacer':
      return `<tr><td style="height:${p.height || 32}px;line-height:${p.height || 32}px;font-size:1px;">&nbsp;</td></tr>`

    case 'html':
      return `<tr><td style="padding:${blockPad};">${p.code || ''}</td></tr>`

    case 'video':
      return `<tr><td style="padding:${blockPad};text-align:center;line-height:0;font-size:0;"><a href="${p.videoUrl || '#'}" target="_blank" style="display:block;line-height:0;"><img src="${p.thumbnailUrl || ''}" alt="Video" width="600" style="max-width:100%;height:auto;display:block;margin:0 auto;border-radius:8px;vertical-align:bottom;" /></a></td></tr>`

    case 'social': {
      const icons: Record<string, string> = { instagram: '📸', facebook: '📘', tiktok: '🎵', youtube: '▶️', twitter: '🐦', linkedin: '💼', whatsapp: '💬' }
      const nets = (p.networks || []).filter((n: any) => n.url && n.enabled !== false)
      const html = nets.map((n: any) => `<a href="${n.url}" style="text-decoration:none;font-size:${p.iconSize || 32}px;margin:0 ${(p.spacing || 12) / 2}px;" target="_blank">${icons[n.type] || '🔗'}</a>`).join('')
      return `<tr><td style="padding:${blockPad};text-align:${p.align || 'center'};">${html}</td></tr>`
    }

    case 'header':
      return `<tr><td style="padding:${blockPad};background-color:${p.backgroundColor || '#fff'};text-align:center;line-height:0;">${p.logoHref ? `<a href="${p.logoHref}" style="text-decoration:none;display:inline-block;line-height:0;">` : ''}<img src="${p.logoSrc || ''}" alt="Logo" width="${p.logoWidth || 160}" style="display:block;margin:0 auto;max-width:100%;height:auto;vertical-align:bottom;" />${p.logoHref ? '</a>' : ''}${p.showLinks && p.links?.length ? `<p style="margin:12px 0 0;font-size:13px;font-family:${font};line-height:1.4;">${p.links.map((l: any) => `<a href="${l.url}" style="color:#6B7280;text-decoration:none;margin:0 8px;">${l.text}</a>`).join('')}</p>` : ''}</td></tr>`

    case 'footer':
      return `<tr><td style="padding:${blockPad};background-color:${p.backgroundColor || '#F9FAFB'};text-align:center;font-size:${p.fontSize || 11}px;color:${p.textColor || '#9CA3AF'};font-family:${font};line-height:1.5;"><p style="margin:0;">${p.companyName || ''}</p>${p.address ? `<p style="margin:4px 0 0;">${p.address}</p>` : ''}<p style="margin:8px 0 0;">${p.showUnsubscribe ? '<a href="{{unsubscribe_url}}" style="color:#9CA3AF;text-decoration:underline;">Descadastrar-se</a>' : ''}${p.showUnsubscribe && p.showViewInBrowser ? ' · ' : ''}${p.showViewInBrowser ? '<a href="{{view_in_browser_url}}" style="color:#9CA3AF;text-decoration:underline;">Ver no navegador</a>' : ''}</p></td></tr>`

    case 'product-grid':
      return `<tr><td style="padding:${blockPad};${p.backgroundColor ? `background-color:${p.backgroundColor};` : ''}">${p.title ? `<p style="margin:0 0 16px;font-size:18px;font-weight:bold;color:#111827;text-align:center;font-family:${font};">${p.title}</p>` : ''}<!-- WORDER_PRODUCT_BLOCK:${p.feedType || 'bestsellers'}:${(p.columns || 2) * (p.rows || 2)}:${p.columns || 2}:${p.showPrice !== false}:${p.showComparePrice !== false}:${p.showButton !== false}:${encodeURIComponent(p.buttonText || 'Comprar')} --></td></tr>`

    case 'abandoned-cart':
      return `<tr><td style="padding:${blockPad};background-color:${p.backgroundColor || '#FFFBEB'};font-family:${font};"><p style="margin:0 0 4px;font-size:22px;font-weight:bold;color:#111827;text-align:center;">${p.title || ''}</p><p style="margin:0 0 20px;font-size:14px;color:#6B7280;text-align:center;">${p.subtitle || ''}</p><!-- WORDER_PRODUCT_BLOCK:cart_items:${p.maxItems || 3}:1:${p.showPrice !== false}:false:true:${encodeURIComponent(p.buttonText || 'Finalizar Compra')} --></td></tr>`

    case 'coupon':
      return `<tr><td style="padding:${blockPad};background-color:${p.backgroundColor || '#FFF7ED'};text-align:center;font-family:${font};"><p style="margin:0;font-size:14px;color:#9A3412;">${p.headerText || ''}</p><p style="margin:10px 0;font-size:${p.codeFontSize || 32}px;font-weight:bold;color:${p.codeColor || '#EA580C'};letter-spacing:4px;border:2px ${p.borderStyle || 'dashed'} ${p.borderColor || '#EA580C'};border-radius:${p.borderRadius || 12}px;display:inline-block;padding:10px 28px;">${p.code || ''}</p><p style="margin:0;font-size:12px;color:#9CA3AF;">${p.footerText || ''}</p></td></tr>`

    case 'columns':
      return ''

    default:
      return ''
  }
}

function renderSection(section: EmailSection, font: string, contentWidth: number, contentBg: string): string {
  const s = section.styles
  const sectionPad = pad(s.padding)
  const sectionBg = s.backgroundColor || ''
  // Respect contentColorMode: 'auto' uses doc default, 'custom' uses section color, 'none' = transparent
  const contentColorMode = (s as any).contentColorMode || 'auto'
  const contentAreaBg = contentColorMode === 'none' ? '' : contentColorMode === 'custom' ? (s.contentBackgroundColor || '') : (contentBg || '')
  const stackClass = s.stackOnMobile ? ' class="worder-section-stack"' : ''

  // Build blocks HTML for each column
  const renderCol = (blocks: EmailBlock[]) =>
    blocks.map(b => `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${renderBlock(b, font)}</table>`).join('\n')

  let innerHtml = ''

  if (section.columns.length === 1) {
    innerHtml = renderCol(section.columns[0].blocks)
  } else {
    const colsHtml = section.columns.map(col =>
      `<td width="${col.width}%" valign="top" style="vertical-align:top;">${renderCol(col.blocks)}</td>`
    ).join('\n')
    innerHtml = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"${stackClass}><tr>${colsHtml}</tr></table>`
  }

  // Section = full-width row with section bg
  // Content = centered table with content bg
  return `
<!-- Section -->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"${sectionBg ? ` style="background-color:${sectionBg};"` : ''}>
  <tr>
    <td align="center" style="padding:0;">
      <!--[if mso]><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="${contentWidth}" align="center"><tr><td><![endif]-->
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="${contentWidth}" style="max-width:${contentWidth}px;width:100%;${contentAreaBg ? `background-color:${contentAreaBg};` : ''}">
        <tr>
          <td style="padding:${sectionPad};">
            ${innerHtml}
          </td>
        </tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>`
}

export function renderDocumentToHtml(doc: any): string {
  const d: EmailDocument = doc?.version === 2 ? doc : migrateV1toV2(doc)
  const s = d.settings
  const font = s.fontFamily || "'DM Sans', Arial, sans-serif"
  const w = s.contentWidth || 600

  const sectionsHtml = d.sections.map(sec => renderSection(sec, font, w, s.contentBackgroundColor || '#ffffff')).join('\n')

  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="X-UA-Compatible" content="IE=edge"><meta name="x-apple-disable-message-reformatting"><title></title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
*{box-sizing:border-box}
body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}
img{-ms-interpolation-mode:bicubic;border:0;height:auto;line-height:100%;outline:none;text-decoration:none;display:block}
body{margin:0;padding:0;width:100%!important}
@media only screen and (max-width:620px){
  .email-container{width:100%!important;max-width:100%!important}
  .worder-section-stack td{display:block!important;width:100%!important}
}
</style>
</head>
<body style="margin:0;padding:0;background-color:${s.backgroundColor || '#f3f4f6'};font-family:${font};-webkit-font-smoothing:antialiased;">
${s.preheaderText ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${s.preheaderText}</div>` : ''}
${sectionsHtml}
</body>
</html>`
}
