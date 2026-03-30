// ═══════════════════════════════════════════
// Worder Email Builder — JSON to HTML Renderer
// Generates email-safe table-based HTML
// ═══════════════════════════════════════════

import type { EmailBlock, EmailDocument, Padding } from '@/components/email-builder/config/types'

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
      return `<tr><td style="padding:${blockPad};color:${p.color || '#374151'};font-size:${p.fontSize || 15}px;line-height:${p.lineHeight || 1.6};text-align:${p.align || 'left'};font-family:${font};${p.backgroundColor ? `background-color:${p.backgroundColor};` : ''}">${p.content || ''}</td></tr>`

    case 'image': {
      const img = `<img src="${p.src || ''}" alt="${p.alt || ''}" width="${p.width || 560}" style="max-width:100%;height:auto;display:block;margin:0 auto;${p.borderRadius ? `border-radius:${p.borderRadius}px;` : ''}" />`
      const linked = p.href ? `<a href="${p.href}" target="_blank" style="text-decoration:none;">${img}</a>` : img
      return `<tr><td style="padding:${blockPad};text-align:${p.align || 'center'};${p.backgroundColor ? `background-color:${p.backgroundColor};` : ''}">${linked}</td></tr>`
    }

    case 'button':
      return `<tr><td style="padding:${blockPad};text-align:${p.align || 'center'};${p.backgroundColor ? `background-color:${p.backgroundColor};` : ''}">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:${p.align === 'left' ? '0' : p.align === 'right' ? '0 0 0 auto' : '0 auto'};${p.fullWidth ? 'width:100%;' : ''}">
    <tr>
      <td style="background-color:${p.bgColor || '#F97316'};border-radius:${p.borderRadius || 8}px;padding:${p.paddingV || 13}px ${p.paddingH || 28}px;text-align:center;${p.borderWidth ? `border:${p.borderWidth}px solid ${p.borderColor || '#E5E7EB'};` : ''}">
        <a href="${p.href || '#'}" style="color:${p.textColor || '#FFFFFF'};font-size:${p.fontSize || 15}px;font-weight:${p.fontWeight || 'bold'};text-decoration:none;display:block;font-family:${font};">${p.text || 'Clique'}</a>
      </td>
    </tr>
  </table>
</td></tr>`

    case 'divider':
      return `<tr><td style="padding:${blockPad};"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="border-top:${p.thickness || 1}px ${p.style || 'solid'} ${p.color || '#E5E7EB'};font-size:1px;line-height:1px;">&nbsp;</td></tr></table></td></tr>`

    case 'spacer':
      return `<tr><td style="height:${p.height || 32}px;line-height:${p.height || 32}px;font-size:1px;">&nbsp;</td></tr>`

    case 'columns':
      return `<tr><td style="padding:${blockPad};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td width="50%" style="padding-right:${(p.gap || 16) / 2}px;vertical-align:top;font-family:${font};font-size:14px;color:#374151;line-height:1.5;">${p.leftContent || ''}</td>
      <td width="50%" style="padding-left:${(p.gap || 16) / 2}px;vertical-align:top;font-family:${font};font-size:14px;color:#374151;line-height:1.5;">${p.rightContent || ''}</td>
    </tr>
  </table>
</td></tr>`

    case 'html':
      return `<tr><td style="padding:${blockPad};">${p.code || ''}</td></tr>`

    case 'video':
      return `<tr><td style="padding:${blockPad};text-align:center;">
  <a href="${p.videoUrl || '#'}" target="_blank" style="text-decoration:none;">
    <img src="${p.thumbnailUrl || ''}" alt="Video" width="560" style="max-width:100%;height:auto;display:block;margin:0 auto;border-radius:8px;" />
  </a>
</td></tr>`

    case 'social': {
      const icons: Record<string, string> = { instagram: '📸', facebook: '📘', tiktok: '🎵', youtube: '▶️', twitter: '🐦', linkedin: '💼', whatsapp: '💬', pinterest: '📌' }
      const nets = (p.networks || []).filter((n: any) => n.url)
      const iconsHtml = nets.map((n: any) =>
        `<a href="${n.url}" style="text-decoration:none;font-size:${p.iconSize || 32}px;margin:0 ${(p.spacing || 10) / 2}px;" target="_blank">${icons[n.type] || '🔗'}</a>`
      ).join('')
      return `<tr><td style="padding:${blockPad};text-align:${p.align || 'center'};">${iconsHtml}</td></tr>`
    }

    case 'header':
      return `<tr><td style="padding:${blockPad};background-color:${p.backgroundColor || '#FFFFFF'};text-align:center;">
  ${p.logoHref ? `<a href="${p.logoHref}" target="_blank" style="text-decoration:none;">` : ''}
  <img src="${p.logoSrc || ''}" alt="Logo" width="${p.logoWidth || 160}" style="display:block;margin:0 auto;max-width:100%;height:auto;" />
  ${p.logoHref ? '</a>' : ''}
  ${p.showLinks && p.links?.length ? `<p style="margin:12px 0 0;font-size:13px;font-family:${font};">${p.links.map((l: any) => `<a href="${l.url}" style="color:#6B7280;text-decoration:none;margin:0 8px;">${l.text}</a>`).join('')}</p>` : ''}
</td></tr>`

    case 'footer':
      return `<tr><td style="padding:${blockPad};background-color:${p.backgroundColor || '#F9FAFB'};text-align:center;font-size:${p.fontSize || 11}px;color:${p.textColor || '#9CA3AF'};font-family:${font};line-height:1.5;">
  <p style="margin:0;">${p.companyName || ''}</p>
  ${p.address ? `<p style="margin:4px 0 0;">${p.address}</p>` : ''}
  <p style="margin:8px 0 0;">
    ${p.showUnsubscribe ? '<a href="{{unsubscribe_url}}" style="color:#9CA3AF;text-decoration:underline;">Descadastrar-se</a>' : ''}
    ${p.showUnsubscribe && p.showViewInBrowser ? ' · ' : ''}
    ${p.showViewInBrowser ? '<a href="{{view_in_browser_url}}" style="color:#9CA3AF;text-decoration:underline;">Ver no navegador</a>' : ''}
    ${(p.showUnsubscribe || p.showViewInBrowser) && p.showPreferences ? ' · ' : ''}
    ${p.showPreferences ? '<a href="{{preferences_url}}" style="color:#9CA3AF;text-decoration:underline;">Preferências</a>' : ''}
  </p>
</td></tr>`

    case 'product-grid':
      return `<tr><td style="padding:${blockPad};${p.backgroundColor ? `background-color:${p.backgroundColor};` : ''}">
  ${p.title ? `<p style="margin:0 0 16px;font-size:18px;font-weight:bold;color:#111827;text-align:center;font-family:${font};">${p.title}</p>` : ''}
  <!-- WORDER_PRODUCT_BLOCK:${p.feedType || 'bestsellers'}:${(p.columns || 2) * (p.rows || 2)}:${p.columns || 2}:${p.showPrice !== false}:${p.showComparePrice !== false}:${p.showButton !== false}:${encodeURIComponent(p.buttonText || 'Comprar')} -->
</td></tr>`

    case 'abandoned-cart':
      return `<tr><td style="padding:${blockPad};background-color:${p.backgroundColor || '#FFFBEB'};font-family:${font};">
  <p style="margin:0 0 4px;font-size:22px;font-weight:bold;color:#111827;text-align:center;">${p.title || ''}</p>
  <p style="margin:0 0 20px;font-size:14px;color:#6B7280;text-align:center;">${p.subtitle || ''}</p>
  <!-- WORDER_PRODUCT_BLOCK:cart_items:${p.maxItems || 3}:1:${p.showPrice !== false}:false:true:${encodeURIComponent(p.buttonText || 'Finalizar Compra')} -->
</td></tr>`

    case 'coupon':
      return `<tr><td style="padding:${blockPad};background-color:${p.backgroundColor || '#FFF7ED'};text-align:center;font-family:${font};">
  <p style="margin:0;font-size:14px;color:#9A3412;">${p.headerText || ''}</p>
  <p style="margin:10px 0;font-size:${p.codeFontSize || 32}px;font-weight:bold;color:${p.codeColor || '#EA580C'};letter-spacing:4px;border:2px ${p.borderStyle || 'dashed'} ${p.borderColor || '#EA580C'};border-radius:${p.borderRadius || 12}px;display:inline-block;padding:10px 28px;">${p.code || ''}</p>
  <p style="margin:0;font-size:12px;color:#9CA3AF;">${p.footerText || ''}</p>
</td></tr>`

    default:
      return ''
  }
}

export function renderDocumentToHtml(doc: EmailDocument): string {
  const s = doc.settings
  const font = s.fontFamily || "'DM Sans', Arial, sans-serif"
  const w = s.contentWidth || 600

  const blocksHtml = doc.blocks.map(b => renderBlock(b, font)).join('\n')

  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <title></title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style>
    *{box-sizing:border-box;}
    body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
    table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
    img{-ms-interpolation-mode:bicubic;border:0;height:auto;line-height:100%;outline:none;text-decoration:none;}
    body{margin:0;padding:0;width:100%!important;}
    @media only screen and (max-width:620px){
      .email-container{width:100%!important;max-width:100%!important;}
      .stack-column{display:block!important;width:100%!important;max-width:100%!important;}
      .full-width-mobile{width:100%!important;height:auto!important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${s.backgroundColor || '#f3f4f6'};font-family:${font};">
<center style="width:100%;background-color:${s.backgroundColor || '#f3f4f6'};">
  <!--[if mso]><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="${w}" align="center"><tr><td><![endif]-->
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="${w}" class="email-container" style="max-width:${w}px;margin:0 auto;background-color:${s.contentBackgroundColor || '#ffffff'};${s.borderRadius ? `border-radius:${s.borderRadius}px;overflow:hidden;` : ''}">
${blocksHtml}
  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</center>
</body>
</html>`
}
