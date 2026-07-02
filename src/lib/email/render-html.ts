import type { EmailBlock, EmailSection, EmailDocument, Padding } from '@/components/email-builder/config/types'
import { migrateV1toV2 } from '@/components/email-builder/config/types'

// Escape a value for safe use inside an HTML attribute (src/alt/href/title).
// Without this, an alt text like My "best" photo or a URL with a double quote
// terminates the attribute early and corrupts the email markup.
function attr(value: unknown): string {
  if (value == null) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Resolve dynamic product blocks by fetching real products from Shopify
// Call this BEFORE renderDocumentToHtml if you need dynamic products resolved
export async function resolveProductBlocks(doc: any, fetchProducts: () => Promise<any[]>): Promise<any> {
  const resolved = JSON.parse(JSON.stringify(doc))
  const d = resolved.version === 2 ? resolved : migrateV1toV2(resolved)

  let products: any[] | null = null

  for (const section of d.sections || []) {
    for (const column of section.columns || []) {
      for (const block of column.blocks || []) {
        if (block.type === 'product-grid' && (!block.props.staticProducts || block.props.staticProducts.length === 0)) {
          // Dynamic product block — fetch products if not yet fetched
          if (products === null) {
            try {
              products = await fetchProducts()
            } catch {
              products = []
            }
          }
          // Inject products as staticProducts so render-html generates real HTML
          const total = (block.props.columns || 2) * (block.props.rows || 2)
          block.props.staticProducts = products.slice(0, total).map((p: any) => ({
            id: String(p.id),
            title: p.title || '',
            price: p.price_min ?? p.price ?? 0,
            compare_at_price: p.compare_at_price || null,
            image_url: p.image || p.image_url || '',
            url: p.url || '',
            description: '',
            buttonText: block.props.buttonText || 'Comprar',
          }))
        }
      }
    }
  }

  return d
}

function pad(p: Padding | number | undefined): string {
  if (!p) return '0'
  if (typeof p === 'number') return `${p}px`
  return `${p.top || 0}px ${p.right || 0}px ${p.bottom || 0}px ${p.left || 0}px`
}

function renderBlock(block: EmailBlock, font: string, settings?: EmailDocument['settings']): string {
  const p = block.props
  const blockPad = pad(p.padding)
  const ts = settings?.textStyles
  const bs = settings?.buttonStyles
  const linkColor = ts?.link?.color || '#18181B'
  const linkUnderline = ts?.link?.underline !== false

  // Block visibility values:
  //   undefined/''/'all'  → show everywhere (default)
  //   'desktop'           → show on desktop only (hidden on mobile via @media)
  //   'mobile'            → show on mobile only (hidden on desktop via @media)
  //   'hidden'            → omit from output entirely (hidden in both preview and sent email)
  if (p.visibility === 'hidden') return ''

  // Device visibility: wrap any block in a visibility class
  const visClass = p.visibility === 'desktop' ? 'worder-desktop-only' : p.visibility === 'mobile' ? 'worder-mobile-only' : ''

  // Conditional logic: emit markers if block has condition
  const conditionEnabled = p._condition_enabled && p._condition_field
  const conditionMarker = conditionEnabled
    ? `<!-- WORDER_CONDITION:${encodeURIComponent(JSON.stringify({ field: p._condition_field, operator: p._condition_op || 'equals', value: p._condition_value || '' }))} -->`
    : ''
  const conditionEndMarker = conditionEnabled ? '<!-- /WORDER_CONDITION -->' : ''

  // Helper: wrap entire block in a visibility row
  const wrapVis = (html: string): string => {
    if (!visClass || !html) return html
    return html.replace(/^(<tr)/, `$1 class="${visClass}"`)
  }

  const _render = (): string => {
  switch (block.type) {
    case 'text': {
      const bodyTs = ts?.body
      const tColor = p.color || bodyTs?.color || '#374151'
      const tSize = p.fontSize || bodyTs?.fontSize || 16
      const tLh = p.lineHeight || bodyTs?.lineHeight || 1.6
      return `<tr><td style="padding:${blockPad};color:${tColor};font-size:${tSize}px;line-height:${tLh};text-align:${p.align || 'left'};font-family:${font};${p.backgroundColor ? `background-color:${p.backgroundColor};` : ''}">${p.contentHtml || p.content || ''}</td></tr>`
    }

    case 'image': {
      const imgW = p.fillColumn ? '100%' : (p.width || 600)
      const imgStyle = `max-width:100%;height:auto;display:block;${p.fillColumn ? 'width:100%;' : `width:${imgW}px;`}margin:${p.align === 'left' ? '0 auto 0 0' : p.align === 'right' ? '0 0 0 auto' : '0 auto'};border:0;outline:0;vertical-align:bottom;${p.borderRadius ? `border-radius:${p.borderRadius}px;` : ''}${p.border?.width ? `border:${p.border.width}px solid ${p.border.color || '#E5E7EB'};` : ''}`
      const img = `<img src="${attr(p.src)}" alt="${attr(p.alt)}" width="${p.fillColumn ? '100%' : imgW}" style="${imgStyle}" />`
      const linked = p.href ? `<a href="${attr(p.href)}" target="_blank" style="text-decoration:none;display:block;line-height:0;font-size:0;">${img}</a>` : img
      const blockBg = p.blockBgColor ? `background-color:${p.blockBgColor};` : ''
      const blockPadStyle = p.blockPadding ? `padding:${p.blockPadding.top || 0}px ${p.blockPadding.right || 0}px ${p.blockPadding.bottom || 0}px ${p.blockPadding.left || 0}px;` : ''
      return `<tr><td style="padding:${blockPad};text-align:${p.align || 'center'};line-height:0;font-size:0;${p.backgroundColor ? `background-color:${p.backgroundColor};` : ''}${blockBg}${blockPadStyle}">${linked}</td></tr>`
    }

    case 'button':
      return `<tr><td style="padding:${blockPad};text-align:${p.align || 'center'};${p.backgroundColor ? `background-color:${p.backgroundColor};` : ''}"><table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:${p.align === 'left' ? '0' : p.align === 'right' ? '0 0 0 auto' : '0 auto'};${p.fullWidth ? 'width:100%;' : ''}"><tr><td style="background-color:${p.bgColor || '#18181B'};border-radius:${p.borderRadius || 8}px;padding:${p.paddingV || 14}px ${p.paddingH || 32}px;text-align:center;"><a href="${p.href || '#'}" style="color:${p.textColor || '#fff'};font-size:${p.fontSize || 16}px;font-weight:${p.fontWeight || 'bold'};text-decoration:none;display:block;font-family:${font};">${p.text || ''}</a></td></tr></table></td></tr>`

    case 'divider': {
      const dw = p.width ?? 100
      const da = p.align || 'center'
      const margin = da === 'left' ? '0 auto 0 0' : da === 'right' ? '0 0 0 auto' : '0 auto'
      return `<tr><td style="padding:${blockPad};"><table role="presentation" width="${dw}%" cellspacing="0" cellpadding="0" border="0" style="margin:${margin};"><tr><td style="border-top:${p.thickness || 1}px ${p.style || 'solid'} ${p.color || '#E5E7EB'};font-size:1px;line-height:1px;">&nbsp;</td></tr></table></td></tr>`
    }

    case 'spacer':
      return `<tr><td style="height:${p.height || 32}px;line-height:${p.height || 32}px;font-size:1px;">&nbsp;</td></tr>`

    case 'html':
      return `<tr><td style="padding:${blockPad};">${p.code || ''}</td></tr>`

    case 'video':
      return `<tr><td style="padding:${blockPad};text-align:center;line-height:0;font-size:0;"><a href="${p.videoUrl || '#'}" target="_blank" style="display:block;line-height:0;"><img src="${p.thumbnailUrl || ''}" alt="Video" width="600" style="max-width:100%;height:auto;display:block;margin:0 auto;border-radius:8px;vertical-align:bottom;" /></a></td></tr>`

    case 'social': {
      const iconUrls: Record<string, string> = {
        instagram: 'https://cdn2.hubspot.net/hubfs/53/tools/email-signature-generator/icons/instagram-icon-2x.png',
        facebook: 'https://cdn2.hubspot.net/hubfs/53/tools/email-signature-generator/icons/facebook-icon-2x.png',
        tiktok: 'https://cdn2.hubspot.net/hubfs/53/tools/email-signature-generator/icons/tiktok-icon-2x.png',
        youtube: 'https://cdn2.hubspot.net/hubfs/53/tools/email-signature-generator/icons/youtube-icon-2x.png',
        twitter: 'https://cdn2.hubspot.net/hubfs/53/tools/email-signature-generator/icons/twitter-icon-2x.png',
        linkedin: 'https://cdn2.hubspot.net/hubfs/53/tools/email-signature-generator/icons/linkedin-icon-2x.png',
        whatsapp: 'https://cdn2.hubspot.net/hubfs/53/tools/email-signature-generator/icons/whatsapp-icon-2x.png',
      }
      const labels: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', twitter: 'Twitter', linkedin: 'LinkedIn', whatsapp: 'WhatsApp' }
      const nets = (p.networks || []).filter((n: any) => n.url && n.enabled !== false)
      const iconSz = p.iconSize || 32
      const spacing = (p.spacing || 12) / 2
      const html = nets.map((n: any) => {
        const url = iconUrls[n.type]
        if (url) {
          return `<a href="${n.url}" target="_blank" style="display:inline-block;margin:0 ${spacing}px;line-height:0;text-decoration:none;"><img src="${url}" alt="${labels[n.type] || n.type}" width="${iconSz}" height="${iconSz}" style="display:block;width:${iconSz}px;height:${iconSz}px;border:0;${p.iconStyle === 'black' ? 'filter:grayscale(1);' : ''}" /></a>`
        }
        return `<a href="${n.url}" target="_blank" style="display:inline-block;margin:0 ${spacing}px;font-size:${iconSz}px;text-decoration:none;">${labels[n.type] || n.type}</a>`
      }).join('')
      return `<tr><td style="padding:${blockPad};text-align:${p.align || 'center'};line-height:0;font-size:0;">${html}</td></tr>`
    }

    case 'header':
      return `<tr><td style="padding:${blockPad};background-color:${p.backgroundColor || '#fff'};text-align:center;line-height:0;">${p.logoHref ? `<a href="${p.logoHref}" style="text-decoration:none;display:inline-block;line-height:0;">` : ''}<img src="${p.logoSrc || ''}" alt="Logo" width="${p.logoWidth || 160}" style="display:block;margin:0 auto;max-width:100%;height:auto;vertical-align:bottom;" />${p.logoHref ? '</a>' : ''}${p.showLinks && p.links?.length ? `<p style="margin:12px 0 0;font-size:${p.linkFontSize || 13}px;font-family:${font};line-height:1.4;">${p.links.map((l: any) => `<a href="${l.url}" style="color:${p.linkColor || '#6B7280'};text-decoration:none;margin:0 8px;">${l.text}</a>`).join('')}</p>` : ''}</td></tr>`

    case 'footer': {
      const flc = p.linkColor || p.textColor || '#9CA3AF'
      return `<tr><td style="padding:${blockPad};background-color:${p.backgroundColor || '#F9FAFB'};text-align:${p.align || 'center'};font-size:${p.fontSize || 11}px;color:${p.textColor || '#9CA3AF'};font-family:${font};line-height:1.5;"><p style="margin:0;">${p.companyName || ''}</p>${p.address ? `<p style="margin:4px 0 0;">${p.address}</p>` : ''}<p style="margin:8px 0 0;">${p.showUnsubscribe ? `<a href="{{unsubscribe_url}}" style="color:${flc};text-decoration:underline;">Descadastrar-se</a>` : ''}${p.showUnsubscribe && p.showViewInBrowser ? ' · ' : ''}${p.showViewInBrowser ? `<a href="{{view_in_browser_url}}" style="color:${flc};text-decoration:underline;">Ver no navegador</a>` : ''}</p></td></tr>`
    }

    case 'product-grid': {
      const cols = p.columns || 2
      const rows = p.rows || 2
      const total = cols * rows
      const staticProds = p.staticProducts || []
      const hasStaticProducts = staticProds.length > 0

      let productsHtml = ''
      if (hasStaticProducts) {
        // Render real static products as table grid
        const prodsToRender = staticProds.slice(0, total)
        const productRows: string[] = []
        for (let r = 0; r < Math.ceil(prodsToRender.length / cols); r++) {
          const rowProds = prodsToRender.slice(r * cols, r * cols + cols)
          const cellWidth = Math.floor(100 / cols)
          const cells = rowProds.map((prod: any) => {
            const imgHtml = prod.image_url ? `<img src="${prod.image_url}" alt="${prod.title || ''}" width="100%" style="display:block;width:100%;height:auto;max-height:${p.maxImageHeight || 300}px;object-fit:cover;border-radius:${p.productBorderRadius ?? 0}px ${p.productBorderRadius ?? 0}px 0 0;" />` : `<div style="height:${p.maxImageHeight || 300}px;background:#f3f4f6;"></div>`
            const nameHtml = p.showName !== false ? `<p style="margin:0;font-weight:${p.nameWeight || '600'};font-size:${p.nameFontSize || 14}px;color:${p.nameColor || '#111827'};font-family:${font};">${prod.title || ''}</p>` : ''
            const priceHtml = p.showPrice !== false ? `<p style="margin:4px 0 0;">${p.showComparePrice && prod.compare_at_price ? `<span style="font-size:${(p.priceFontSize || 16) - 3}px;color:${p.comparePriceColor || '#9CA3AF'};text-decoration:line-through;margin-right:6px;">R$ ${Number(prod.compare_at_price).toFixed(2)}</span>` : ''}<span style="font-weight:${p.priceWeight || '700'};font-size:${p.priceFontSize || 16}px;color:${p.priceColor || '#18181B'};">R$ ${Number(prod.price || 0).toFixed(2)}</span></p>` : ''
            const btnHtml = p.showButton !== false ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px ${p.buttonFullWidth ? '0' : 'auto'} 0;${p.buttonFullWidth ? 'width:100%;' : ''}"><tr><td style="background-color:${p.buttonColor || '#18181B'};border-radius:${p.buttonRadius ?? 6}px;padding:${p.buttonPaddingV ?? 6}px ${p.buttonPaddingH ?? 16}px;text-align:center;"><a href="${prod.url || '#'}" style="color:${p.buttonTextColor || '#FFFFFF'};font-size:${p.buttonFontSize || 12}px;font-weight:600;text-decoration:none;display:block;font-family:${font};">${p.buttonText || 'Comprar'}</a></td></tr></table>` : ''
            return `<td width="${cellWidth}%" valign="top" style="vertical-align:top;padding:${p.productPadding ?? 4}px;"><div style="border:1px solid ${p.productBorderColor || '#E5E7EB'};border-radius:${p.productBorderRadius ?? 8}px;overflow:hidden;background:#fff;text-align:center;">${imgHtml}<div style="padding:${p.productPadding ?? 8}px;">${nameHtml}${priceHtml}${btnHtml}</div></div></td>`
          }).join('')
          // Pad with empty cells if row not full
          const emptyCells = cols - rowProds.length > 0 ? `<td width="${Math.floor(100 / cols)}%" style="padding:${p.productPadding ?? 4}px;"></td>`.repeat(cols - rowProds.length) : ''
          productRows.push(`<tr>${cells}${emptyCells}</tr>`)
        }
        productsHtml = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="worder-product-grid">${productRows.join('')}</table>`
      } else {
        // Dynamic products: placeholder comment for server-side resolution at send time
        productsHtml = `<!-- WORDER_PRODUCT_BLOCK:${p.feedType || 'bestsellers'}:${total}:${cols}:${p.showPrice !== false}:${p.showComparePrice !== false}:${p.showButton !== false}:${encodeURIComponent(p.buttonText || 'Comprar')} -->`
      }

      return `<tr><td style="padding:${blockPad};${p.backgroundColor ? `background-color:${p.backgroundColor};` : ''}">${p.title ? `<p style="margin:0 0 16px;font-size:18px;font-weight:bold;color:#111827;text-align:center;font-family:${font};">${p.title}</p>` : ''}${productsHtml}</td></tr>`
    }

    case 'abandoned-cart': {
      // Encode all styling props as JSON for the resolver to generate styled HTML
      const cartConfig = {
        type: 'abandoned-cart',
        layoutType: p.layoutType || 'image-left',
        // 0 = todos os produtos do gatilho (resolvido em resolveCartBlocks).
        // `?? 0`, não `|| 2`: 0 é falsy e `|| 2` reintroduziria o teto de 2.
        maxItems: p.maxItems ?? 0,
        showImage: p.showImage !== false,
        showName: p.showName !== false,
        showDescription: p.showDescription !== false,
        showPrice: p.showPrice !== false,
        showOldPrice: p.showOldPrice !== false,
        showButton: p.showButton !== false,
        nameFontSize: p.nameFontSize || 14, nameColor: p.nameColor || '#111827', nameWeight: p.nameWeight || '600',
        descFontSize: p.descFontSize || 13, descColor: p.descColor || '#6B7280',
        priceFontSize: p.priceFontSize || 14, priceColor: p.priceColor || '#111827', priceWeight: p.priceWeight || '600',
        oldPriceColor: p.oldPriceColor || '#9CA3AF',
        buttonText: p.buttonText || 'Comprar agora', buttonHref: p.buttonHref || '{{checkout_url}}',
        buttonColor: p.buttonColor || '#111827', buttonTextColor: p.buttonTextColor || '#FFFFFF',
        buttonRadius: p.buttonRadius ?? 4, buttonFontSize: p.buttonFontSize || 14,
        buttonAlign: p.buttonAlign || 'left',
        buttonPaddingV: p.buttonPaddingV || 10, buttonPaddingH: p.buttonPaddingH || 24,
        imageWidth: p.imageWidth || 200, imageBorderRadius: p.imageBorderRadius ?? 0,
        separator: p.separator !== false, separatorColor: p.separatorColor || '#E5E7EB',
        stackOnMobile: p.stackOnMobile !== false,
        font,
      }
      const configJson = encodeURIComponent(JSON.stringify(cartConfig))
      return `<tr><td style="padding:${blockPad};${p.backgroundColor ? `background-color:${p.backgroundColor};` : ''}font-family:${font};"><!-- WORDER_CART_BLOCK:${configJson} --></td></tr>`
    }

    case 'order-products': {
      const orderConfig = {
        type: 'order-products',
        // Title
        showTitle: p.showTitle !== false,
        titleText: p.titleText || 'Resumo do Pedido',
        titleFontSize: p.titleFontSize || 24,
        titleWeight: p.titleWeight || '700',
        titleAlign: p.titleAlign || 'center',
        titleColor: p.titleColor || '#000000',
        // Meta
        showOrderNumber: p.showOrderNumber !== false,
        showOrderDate: p.showOrderDate !== false,
        orderNumberLabel: p.orderNumberLabel || 'Pedido',
        metaColor: p.metaColor || '#AFAFAF',
        metaFontSize: p.metaFontSize || 13,
        metaAlign: p.metaAlign || 'center',
        // Products
        showImage: p.showImage !== false,
        showName: p.showName !== false,
        showQuantity: p.showQuantity !== false,
        showPrice: p.showPrice !== false,
        showVariant: p.showVariant !== false,
        showSku: p.showSku || false,
        showDiscount: p.showDiscount !== false,
        // Totals
        showTotals: p.showTotals !== false,
        showSubtotal: p.showSubtotal !== false,
        showShipping: p.showShipping !== false,
        showTax: p.showTax !== false,
        showTotalDiscount: p.showTotalDiscount !== false,
        // Colors
        primaryTextColor: p.primaryTextColor || '#000000',
        secondaryTextColor: p.secondaryTextColor || '#AFAFAF',
        priceTextColor: p.priceTextColor || '#000000',
        totalTextColor: p.totalTextColor || '#000000',
        dividerColor: p.dividerColor || '#EDEDED',
        // Image
        imageWidth: p.imageWidth || 80,
        imageBorderRadius: p.imageBorderRadius ?? 4,
        // Separator
        separator: p.separator !== false,
        separatorColor: p.separatorColor || '#EDEDED',
        font,
      }
      const configJson = encodeURIComponent(JSON.stringify(orderConfig))
      return `<tr><td style="padding:${blockPad};${p.backgroundColor ? `background-color:${p.backgroundColor};` : ''}font-family:${font};"><!-- WORDER_ORDER_BLOCK:${configJson} --></td></tr>`
    }

    case 'coupon': {
      const cpv = p.codePaddingV ?? 10
      const cph = p.codePaddingH ?? 28
      return `<tr><td style="padding:${blockPad};background-color:${p.backgroundColor || '#FFF7ED'};text-align:${p.headerAlign || 'center'};font-family:${font};">${p.headerText ? `<p style="margin:0 0 10px;font-size:${p.headerFontSize || 14}px;color:${p.headerColor || '#9A3412'};font-weight:${p.headerFontWeight || '500'};text-align:${p.headerAlign || 'center'};">${p.headerText}</p>` : ''}<p style="margin:0;font-size:${p.codeFontSize || 32}px;font-weight:${p.codeFontWeight || 'bold'};color:${p.codeColor || '#18181B'};letter-spacing:${p.codeLetterSpacing ?? 4}px;${p.borderStyle !== 'none' ? `border:${p.borderWidth ?? 2}px ${p.borderStyle || 'dashed'} ${p.borderColor || '#18181B'};` : ''}border-radius:${p.borderRadius || 12}px;display:inline-block;padding:${cpv}px ${cph}px;max-width:100%;box-sizing:border-box;word-break:break-all;${p.codeBgColor ? `background-color:${p.codeBgColor};` : ''}" class="worder-coupon-code">${p.code || ''}</p>${p.footerText ? `<p style="margin:10px 0 0;font-size:${p.footerFontSize || 12}px;color:${p.footerColor || '#9CA3AF'};font-weight:${p.footerFontWeight || 'normal'};">${p.footerText}</p>` : ''}</td></tr>`
    }

    case 'columns':
      return ''

    // ══════════════════════════════════════
    // NEW BLOCKS
    // ══════════════════════════════════════

    case 'split': {
      const isImgLeft = p.layout !== 'image-right'
      const ratios = (p.splitRatio || '50-50').split('-').map(Number)
      const imgCell = `<td width="${ratios[isImgLeft ? 0 : 1]}%" valign="top" style="vertical-align:top;line-height:0;font-size:0;"><img src="${p.imageSrc || ''}" alt="${p.imageAlt || ''}" width="${p.imageWidth || 300}" style="max-width:100%;height:auto;display:block;vertical-align:bottom;" /></td>`
      const textCell = `<td width="${ratios[isImgLeft ? 1 : 0]}%" valign="middle" style="vertical-align:middle;padding:16px 20px;font-family:${font};">${p.textHtml || ''}${p.showButton !== false ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:16px;"><tr><td style="background-color:${p.buttonColor || '#18181B'};border-radius:8px;padding:12px 24px;"><a href="${p.buttonHref || '#'}" style="color:${p.buttonTextColor || '#fff'};font-size:15px;font-weight:bold;text-decoration:none;display:block;font-family:${font};">${p.buttonText || 'Saiba Mais'}</a></td></tr></table>` : ''}</td>`
      return `<tr><td style="padding:${blockPad};${p.backgroundColor ? `background-color:${p.backgroundColor};` : ''}"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="worder-section-stack"><tr>${isImgLeft ? imgCell + textCell : textCell + imgCell}</tr></table></td></tr>`
    }

    case 'header-bar':
      return `<tr><td style="padding:${blockPad};background-color:${p.backgroundColor || '#fff'};text-align:${p.align || 'center'};font-family:${font};font-size:${p.fontSize || 13}px;">${(p.links || []).map((l: any, i: number) => `${i > 0 ? `<span style="color:${p.separatorColor || '#D1D5DB'};margin:0 8px;">${p.separator || '|'}</span>` : ''}<a href="${l.url || '#'}" style="color:${p.textColor || '#374151'};text-decoration:none;">${l.text}</a>`).join('')}</td></tr>`

    case 'drop-shadow': {
      const opacity = p.shadowType === 'darker' ? 0.2 : p.shadowType === 'dark' ? 0.12 : 0.05
      return `<tr><td style="padding:0;line-height:0;font-size:0;height:${p.height || 8}px;background:linear-gradient(to bottom, rgba(0,0,0,${opacity}), transparent);">&nbsp;</td></tr>`
    }

    case 'table': {
      const data = p.data || [['', ''], ['', '']]
      const bw = p.borderWidth ?? 1
      const cp = p.cellPadding ?? 10
      const ta = p.textAlign || 'left'
      const hfs = p.headerFontSize || p.cellFontSize || 14
      const tbr = p.tableBorderRadius ?? 0
      const rows = data.map((row: string[], ri: number) => {
        const isHeader = p.headerRow && ri === 0
        const cells = row.map((cell: string, ci: number) => {
          const isStriped = !isHeader && p.stripedRows && ri % 2 === 0
          const bgCol = isHeader ? (p.headerBgColor || '#111827') : isStriped ? (p.stripedColor || '#F9FAFB') : (p.cellBgColor || 'transparent')
          const txtCol = isHeader ? (p.headerTextColor || '#FFFFFF') : (p.cellTextColor || '#374151')
          const fw = isHeader ? (p.headerFontWeight || '600') : 'normal'
          const fs = isHeader ? hfs : (p.cellFontSize || 14)
          const borderStyle = bw > 0 ? `border-bottom:${bw}px solid ${p.borderColor || '#E5E7EB'};${ci < row.length - 1 ? `border-right:${bw}px solid ${p.borderColor || '#E5E7EB'};` : ''}` : ''
          return `<td style="padding:${cp}px ${cp + 4}px;${borderStyle}font-size:${fs}px;color:${txtCol};font-weight:${fw};background-color:${bgCol};text-align:${ta};font-family:${font};">${cell}</td>`
        }).join('')
        return `<tr>${cells}</tr>`
      }).join('')
      const tableStyle = `border-collapse:${tbr > 0 ? 'separate' : 'collapse'};${tbr > 0 ? `border-radius:${tbr}px;overflow:hidden;` : ''}${bw > 0 ? `border:${bw}px solid ${p.borderColor || '#E5E7EB'};` : ''}`
      return `<tr><td style="padding:${blockPad};${p.backgroundColor ? `background-color:${p.backgroundColor};` : ''}"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="${tableStyle}">${rows}</table></td></tr>`
    }

    case 'review-quote': {
      const stars = p.showStars !== false ? `<div style="margin-bottom:12px;font-size:20px;color:${p.starColor || '#FBBF24'};">${'★'.repeat(p.rating || 5)}${'☆'.repeat(5 - (p.rating || 5))}</div>` : ''
      return `<tr><td style="padding:${blockPad};background-color:${p.backgroundColor || '#F9FAFB'};text-align:${p.quoteAlign || 'center'};font-family:${font};">${stars}<p style="margin:0;font-size:${p.quoteFontSize || 16}px;color:${p.quoteColor || '#374151'};font-style:${p.quoteStyle || 'italic'};line-height:1.6;">"${p.quote || ''}"</p><p style="margin:12px 0 0;font-size:${p.authorFontSize || 14}px;color:${p.authorColor || '#6B7280'};font-weight:500;">— ${p.author || ''}</p></td></tr>`
    }

    case 'countdown': {
      // Dynamic countdown: server-generated image that updates on each email open
      const params = new URLSearchParams()
      if (p.endDate) params.set('end', p.endDate)
      if (p.style) params.set('style', p.style)
      if (p.numberColor) params.set('nc', p.numberColor)
      if (p.labelColor) params.set('lc', p.labelColor)
      if (p.boxColor) params.set('bc', p.boxColor)
      if (p.backgroundColor) params.set('bg', p.backgroundColor)
      if (p.separatorColor) params.set('sc', p.separatorColor)
      if (p.boxBorderRadius != null) params.set('br', String(p.boxBorderRadius))
      if (p.boxBorder) params.set('bb', p.boxBorder)
      if (p.title) params.set('title', p.title)
      if (p.titleColor) params.set('tc', p.titleColor)
      if (p.expiredText) params.set('expired', p.expiredText)
      if (p.labels?.days) params.set('ld', p.labels.days)
      if (p.labels?.hours) params.set('lh', p.labels.hours)
      if (p.labels?.minutes) params.set('lm', p.labels.minutes)
      if (p.labels?.seconds) params.set('ls', p.labels.seconds)
      if (p.fontSize) params.set('fs', String(p.fontSize))
      if (p.labelFontSize) params.set('lfs', String(p.labelFontSize))
      const imgUrl = `{{countdown_base_url}}/api/email/countdown?${params.toString()}`
      const h = p.title ? 160 : 120
      return `<tr><td style="padding:${blockPad};text-align:center;line-height:0;font-size:0;"><img src="${imgUrl}" alt="Countdown Timer" width="600" height="${h}" style="display:block;margin:0 auto;max-width:100%;height:auto;" /></td></tr>`
    }

    default:
      return ''
  }
  } // end _render
  const rendered = wrapVis(_render())
  return conditionMarker ? conditionMarker + rendered + conditionEndMarker : rendered
}

function renderSection(section: EmailSection, font: string, contentWidth: number, contentBg: string, settings?: EmailDocument['settings'], isFirst = false, isLast = false): string {
  const s = section.styles
  // Hidden from builder: skip section entirely
  if ((s as any).hidden === true) return ''
  // Device visibility: if both hidden, skip section entirely
  const showDesktop = (s as any).showOnDesktop !== false
  const showMobile = (s as any).showOnMobile !== false
  if (!showDesktop && !showMobile) return ''

  // Add visibility CSS class to section wrapper
  const visClass = !showDesktop ? ' class="worder-desktop-hide"' : !showMobile ? ' class="worder-mobile-hide"' : ''

  const sectionPad = pad(s.padding)
  const sectionBg = s.backgroundColor || ''
  // Respect contentColorMode: 'auto' uses doc default, 'custom' uses section color, 'none' = transparent
  const contentColorMode = s.contentColorMode || 'auto'
  const contentAreaBg = contentColorMode === 'none' ? '' : contentColorMode === 'custom' ? (s.contentBackgroundColor || '') : (contentBg || '')
  const stackClass = s.stackOnMobile ? ' class="worder-section-stack"' : ''

  // Build blocks HTML for each column
  const renderCol = (blocks: EmailBlock[]) =>
    blocks.map(b => `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${renderBlock(b, font, settings)}</table>`).join('\n')

  let innerHtml = ''

  if (section.columns.length === 1) {
    innerHtml = renderCol(section.columns[0].blocks)
  } else {
    const colAlign = (s as any).columnAlignment || 'top'
    const colsHtml = section.columns.map(col =>
      `<td width="${col.width}%" valign="${colAlign}" style="vertical-align:${colAlign};">${renderCol(col.blocks)}</td>`
    ).join('\n')
    innerHtml = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"${stackClass}><tr>${colsHtml}</tr></table>`
  }

  // Section = full-width row with section bg
  // Content = centered table with content bg
  return `
<!-- Section -->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"${visClass}${sectionBg ? ` style="background-color:${sectionBg};"` : ''}>
  <tr>
    <td align="center" style="padding:0;">
      <!--[if mso]><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="${contentWidth}" align="center"><tr><td><![endif]-->
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="${contentWidth}" style="max-width:${contentWidth}px;width:100%;${contentAreaBg ? `background-color:${contentAreaBg};` : ''}${(() => { const br = settings?.borderRadius || 0; if (br > 0) { return `border-radius:${isFirst ? br : 0}px ${isFirst ? br : 0}px ${isLast ? br : 0}px ${isLast ? br : 0}px;overflow:hidden;` } return '' })()}">
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

  const sectionsHtml = d.sections.map((sec, i) => renderSection(sec, font, w, s.contentBackgroundColor || '#ffffff', s, i === 0, i === d.sections.length - 1)).join('\n')

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
a{color:${s.textStyles?.link?.color || '#18181B'};${s.textStyles?.link?.underline !== false ? 'text-decoration:underline;' : 'text-decoration:none;'}}
.worder-mobile-only{display:none!important;max-height:0;overflow:hidden}
.worder-mobile-hide{} /* visible on desktop by default */
.worder-desktop-hide{display:none!important;mso-hide:all;max-height:0;overflow:hidden}
@media only screen and (max-width:620px){
  .worder-desktop-only{display:none!important;max-height:0;overflow:hidden}
  .worder-mobile-only{display:table-row!important;max-height:none!important}
  .worder-mobile-hide{display:none!important;max-height:0;overflow:hidden}
  .worder-desktop-hide{display:table!important;max-height:none!important}
  .email-container{width:100%!important;max-width:100%!important}
  .worder-section-stack td{display:block!important;width:100%!important}
  .worder-countdown-wrap td{padding:2px!important}
  .worder-countdown-wrap td div{min-width:50px!important;padding:10px 8px 6px!important}
  .worder-countdown-wrap td div span:first-child{font-size:24px!important}
  .worder-coupon-code{font-size:22px!important;letter-spacing:2px!important;padding:8px 16px!important;word-break:break-all!important;max-width:100%!important;box-sizing:border-box!important}
  .worder-product-grid td{display:block!important;width:100%!important}
  .worder-product-grid .worder-product-cell{display:block!important;width:100%!important}
}
</style>
</head>
<body style="margin:0;padding:0;background-color:${s.backgroundColor || '#f3f4f6'};font-family:${font};-webkit-font-smoothing:antialiased;">
${s.preheaderText ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${s.preheaderText}</div>` : ''}
${sectionsHtml}
</body>
</html>`
}

export function injectEmailTracking(html: string, campaignId: string, contactId: string, orgId: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://worder1.vercel.app'

  // 1. Inject open tracking pixel before </body>
  const pixel = `<img src="${baseUrl}/api/email/track/open?c=${campaignId}&r=${contactId}&o=${orgId}" width="1" height="1" style="display:none;width:1px;height:1px;opacity:0;" alt="" />`
  let tracked = html.replace('</body>', `${pixel}</body>`)

  // 2. Wrap links with click tracking (skip unsubscribe and view-in-browser)
  tracked = tracked.replace(/href="(https?:\/\/[^"]+)"/g, (match, url) => {
    // Don't track unsubscribe or system links
    if (url.includes('unsubscribe') || url.includes('view_in_browser') || url.includes('/api/email/track/')) {
      return match
    }
    const trackUrl = `${baseUrl}/api/email/track/click?url=${encodeURIComponent(url)}&c=${campaignId}&r=${contactId}&o=${orgId}`
    return `href="${trackUrl}"`
  })

  // 3. Replace unsubscribe placeholder
  tracked = tracked.replace(/\{\{unsubscribe_url\}\}/g, `${baseUrl}/unsubscribe?r=${contactId}&o=${orgId}`)

  // 4. Replace view in browser placeholder
  tracked = tracked.replace(/\{\{view_in_browser_url\}\}/g, `${baseUrl}/api/email/view?c=${campaignId}&r=${contactId}`)

  return tracked
}
