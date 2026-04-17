// =============================================
// WORDER: Email Rendering Pipeline
// /src/lib/email/render.ts
//
// Merge tags, URL tracking, open pixel,
// unsubscribe link, and full pipeline.
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin'

/**
 * Resolve saved/universal blocks in an EmailDocument.
 * For each block with _savedBlockId, fetches the latest version from saved_blocks
 * and merges its props (keeping the local block's id and _savedBlockId).
 */
export async function resolveSavedBlocks(doc: any, orgId: string): Promise<any> {
  // Collect all unique savedBlockIds
  const ids = new Set<string>()
  for (const section of doc.sections || []) {
    for (const col of section.columns || []) {
      for (const block of col.blocks || []) {
        if (block._savedBlockId) ids.add(block._savedBlockId)
      }
    }
  }
  if (ids.size === 0) return doc

  // Fetch all saved blocks in one query
  const { data: savedBlocks } = await supabaseAdmin
    .from('saved_blocks')
    .select('id, block_json')
    .eq('organization_id', orgId)
    .in('id', Array.from(ids))

  if (!savedBlocks || savedBlocks.length === 0) return doc

  const savedMap = new Map(savedBlocks.map(sb => [sb.id, sb.block_json]))

  // Replace block props with latest saved version
  const resolved = JSON.parse(JSON.stringify(doc))
  for (const section of resolved.sections || []) {
    for (const col of section.columns || []) {
      for (let i = 0; i < (col.blocks || []).length; i++) {
        const block = col.blocks[i]
        if (block._savedBlockId && savedMap.has(block._savedBlockId)) {
          const savedJson = savedMap.get(block._savedBlockId)
          if (savedJson && savedJson.props) {
            // Merge: saved props override, keep local id + meta
            col.blocks[i] = {
              ...block,
              type: savedJson.type || block.type,
              props: { ...savedJson.props },
              _savedBlockId: block._savedBlockId,
              _savedBlockName: block._savedBlockName,
            }
          }
        }
      }
    }
  }
  return resolved
}

/**
 * Evaluate a block's conditional visibility.
 * Returns true if the block should be shown, false if hidden.
 */
export function evaluateBlockCondition(
  condition: { field: string; operator: string; value: string; logic?: 'and' | 'or'; rules?: Array<{ field: string; operator: string; value: string }> } | undefined,
  data: Record<string, string>
): boolean {
  if (!condition || !condition.field) return true // No condition = always show

  const evalRule = (rule: { field: string; operator: string; value: string }): boolean => {
    const actual = (data[rule.field] ?? '').toLowerCase()
    const expected = (rule.value ?? '').toLowerCase()
    switch (rule.operator) {
      case 'equals': return actual === expected
      case 'not_equals': return actual !== expected
      case 'contains': return actual.includes(expected)
      case 'not_contains': return !actual.includes(expected)
      case 'greater_than': return parseFloat(actual) > parseFloat(expected)
      case 'less_than': return parseFloat(actual) < parseFloat(expected)
      case 'is_set': return actual.length > 0
      case 'is_not_set': return actual.length === 0
      case 'starts_with': return actual.startsWith(expected)
      case 'ends_with': return actual.endsWith(expected)
      default: return true
    }
  }

  // Single rule
  const mainResult = evalRule(condition)

  // Multiple rules with AND/OR
  if (condition.rules && condition.rules.length > 0) {
    const allResults = [mainResult, ...condition.rules.map(evalRule)]
    return condition.logic === 'and'
      ? allResults.every(Boolean)
      : allResults.some(Boolean)
  }

  return mainResult
}

/**
 * Escapa caracteres HTML para evitar XSS ao interpolar merge tags.
 * Converter < > & " ' / impede que user-provided content vire tag HTML no email.
 */
function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\//g, '&#x2F;')
}

/**
 * Replace {{tag}} and {{tag|fallback}} in HTML with data values.
 *
 * IMPORTANTE: valores são HTML-escaped por padrão (prevenção XSS).
 * Para injetar HTML confiável use a prefix tag `raw.`, ex: `{{raw.html_block}}`.
 */
export function renderMergeTags(
  html: string,
  data: Record<string, string>
): string {
  // Inject date tags
  const now = new Date()
  const dateData: Record<string, string> = {
    ...data,
    current_date: now.toLocaleDateString('pt-BR'),
    current_year: String(now.getFullYear()),
  }

  const resolve = (tag: string, fallback: string = ''): string => {
    const rawMode = tag.startsWith('raw.')
    const actual = rawMode ? tag.slice(4) : tag
    let value: string | undefined

    if (actual.startsWith('custom.')) {
      const customKey = actual.slice(7)
      value = dateData[`custom_${customKey}`] ?? dateData[`custom.${customKey}`]
    } else {
      value = dateData[actual]
    }

    const final = value ?? fallback
    return rawMode ? final : escapeHtml(final)
  }

  // Replace {{tag|fallback}} first (with fallback)
  let result = html.replace(
    /\{\{([a-zA-Z0-9_.]+)\|([^}]*)\}\}/g,
    (_, tag: string, fallback: string) => resolve(tag, fallback)
  )

  // Replace {{tag}} (no fallback)
  result = result.replace(
    /\{\{([a-zA-Z0-9_.]+)\}\}/g,
    (_, tag: string) => resolve(tag, '')
  )

  return result
}

/**
 * Rewrite all <a href="..."> URLs to go through the click tracker.
 * Excludes mailto:, tel:, #, and unsubscribe links.
 */
export function rewriteUrlsForTracking(
  html: string,
  emailSendId: string,
  baseUrl: string
): string {
  return html.replace(
    /(<a\s[^>]*href=["'])([^"']+)(["'][^>]*>)/gi,
    (match, prefix: string, url: string, suffix: string) => {
      // Skip non-trackable URLs
      if (
        url.startsWith('mailto:') ||
        url.startsWith('tel:') ||
        url.startsWith('#') ||
        url.includes('/unsubscribe/') ||
        url.includes('/t/c/') ||
        url.includes('/t/o/')
      ) {
        return match;
      }

      const encodedUrl = encodeURIComponent(url);
      const trackingUrl = `${baseUrl}/api/t/c/${emailSendId}?url=${encodedUrl}`;
      return `${prefix}${trackingUrl}${suffix}`;
    }
  );
}

/**
 * Inject a 1x1 transparent pixel for open tracking before </body>.
 */
export function injectOpenPixel(
  html: string,
  emailSendId: string,
  baseUrl: string
): string {
  const pixel = `<img src="${baseUrl}/api/t/o/${emailSendId}" width="1" height="1" alt="" style="display:none;border:0;" />`;

  if (html.includes('</body>')) {
    return html.replace('</body>', `${pixel}</body>`);
  }

  // If no </body> tag, append at the end
  return html + pixel;
}

/**
 * Add unsubscribe link with HMAC-signed token before </body>.
 */
export function addUnsubscribeLink(
  html: string,
  emailSendId: string,
  baseUrl: string,
  contactId?: string,
  orgId?: string,
  campaignId?: string
): string {
  let unsubUrl: string;

  if (contactId && orgId) {
    // Token HMAC seguro (novo — Klaviyo-style)
    try {
      const { signUnsubscribeToken } = require('@/lib/email/unsubscribe-token');
      const token = signUnsubscribeToken({ contactId, orgId, campaignId });
      unsubUrl = `${baseUrl}/unsubscribe?token=${token}`;
    } catch {
      // Fallback se import falhar
      unsubUrl = `${baseUrl}/api/unsubscribe/${emailSendId}`;
    }
  } else {
    // Fallback legacy
    unsubUrl = `${baseUrl}/api/unsubscribe/${emailSendId}`;
  }

  const unsubscribeHtml = `
<div style="text-align:center;padding:20px 0 10px;font-size:12px;color:#999;">
  <a href="${unsubUrl}" style="color:#999;text-decoration:underline;">
    Cancelar inscrição
  </a>
  &nbsp;|&nbsp;
  Você recebeu este e-mail porque se inscreveu em nossa lista.
</div>`;

  if (html.includes('</body>')) {
    return html.replace('</body>', `${unsubscribeHtml}</body>`);
  }

  return html + unsubscribeHtml;
}

/**
 * Resolve dynamic product blocks in email HTML.
 * Replaces <!-- WORDER_PRODUCT_BLOCK:... --> comments with real product HTML.
 */
export async function resolveProductBlocks(
  html: string,
  orgId: string,
  contactId?: string
): Promise<string> {
  const regex = /<!-- WORDER_PRODUCT_BLOCK:(\w+):(\d+):(\d+):(true|false):(true|false):(true|false):([^-]*?) -->/g
  let result = html
  const matches: RegExpExecArray[] = []
  let m: RegExpExecArray | null

  while ((m = regex.exec(html)) !== null) {
    matches.push(m)
  }

  for (const match of matches) {
    const [fullMatch, feedType, maxStr, colsStr, showPrice, showComparePrice, showButton, buttonText] = match
    const maxProducts = parseInt(maxStr) || 4
    const cols = parseInt(colsStr) || 2

    let products: any[] = []
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      const res = await fetch(`${baseUrl}/api/email/product-feeds/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feed_type: feedType, contact_id: contactId, organization_id: orgId, max_products: maxProducts }),
      })
      const data = await res.json()
      products = data.products || []
    } catch {
      // No products available
    }

    if (products.length === 0) {
      result = result.replace(fullMatch, '')
      continue
    }

    const rows = Math.ceil(products.length / cols)
    let productHtml = '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:16px;">'

    for (let r = 0; r < rows; r++) {
      productHtml += '<tr>'
      for (let c = 0; c < cols; c++) {
        const p = products[r * cols + c]
        if (!p) { productHtml += `<td width="${100 / cols}%"></td>`; continue }

        const title = p.title || p.name || 'Produto'
        const price = p.price || '0'
        const comparePrice = p.compare_at_price || p.compare_price || ''
        const imgUrl = p.image_url || p.images?.[0]?.src || ''
        const url = p.url || (p.handle ? `https://loja.com/products/${p.handle}` : '#')

        productHtml += `<td width="${100 / cols}%" style="padding:8px;vertical-align:top;text-align:center;">
          <a href="${url}" style="text-decoration:none;color:inherit;display:block;">
            <div style="border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;background:#fff;">
              ${imgUrl ? `<img src="${imgUrl}" alt="${title}" style="width:100%;height:auto;display:block;" />` : '<div style="background:#F3F4F6;height:200px;"></div>'}
              <div style="padding:12px;">
                <p style="margin:0;font-size:14px;font-weight:600;color:#111827;">${title}</p>
                ${showPrice === 'true' ? `${showComparePrice === 'true' && comparePrice ? `<p style="margin:4px 0 0;font-size:12px;color:#9CA3AF;text-decoration:line-through;">R$ ${comparePrice}</p>` : ''}<p style="margin:2px 0 0;font-size:16px;font-weight:700;color:#F97316;">R$ ${price}</p>` : ''}
                ${showButton === 'true' ? `<a href="${url}" style="display:inline-block;margin-top:10px;padding:10px 24px;background:#F97316;color:white;border-radius:6px;font-size:13px;font-weight:600;text-decoration:none;">${buttonText.trim() || 'Comprar'}</a>` : ''}
              </div>
            </div>
          </a>
        </td>`
      }
      productHtml += '</tr>'
    }
    productHtml += '</table>'
    result = result.replace(fullMatch, productHtml)
  }

  return result
}

/**
 * Resolves <!-- WORDER_CART_BLOCK:{json} --> placeholders with real cart product HTML.
 * Uses Omnisend-style layout (image-left/right/vertical) with full styling from editor config.
 */
export async function resolveCartBlocks(
  html: string,
  orgId: string,
  contactId?: string
): Promise<string> {
  const regex = /<!-- WORDER_CART_BLOCK:([^ ]*?) -->/g
  let result = html
  const matches: RegExpExecArray[] = []
  let m: RegExpExecArray | null
  while ((m = regex.exec(html)) !== null) matches.push(m)

  for (const match of matches) {
    let cfg: any = {}
    try { cfg = JSON.parse(decodeURIComponent(match[1])) } catch { continue }

    // Fetch cart items for this contact
    let products: any[] = []
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      const res = await fetch(`${baseUrl}/api/email/product-feeds/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feed_type: 'cart_items', contact_id: contactId, organization_id: orgId, max_products: cfg.maxItems || 2 }),
      })
      const data = await res.json()
      products = data.products || []
    } catch {}

    if (products.length === 0) {
      result = result.replace(match[0], '')
      continue
    }

    const isVert = cfg.layoutType === 'vertical'
    const isRight = cfg.layoutType === 'image-right'
    const font = cfg.font || 'Arial, sans-serif'
    const imgW = cfg.imageWidth || 200
    const imgR = cfg.imageBorderRadius || 0
    const btnAlign = cfg.buttonAlign || 'left'
    const btnDisplay = btnAlign === 'full' ? 'display:block;width:100%;text-align:center;' : `display:inline-block;`
    const sepHtml = cfg.separator ? `<tr><td style="border-top:1px solid ${cfg.separatorColor || '#E5E7EB'};font-size:1px;line-height:1px;" colspan="2">&nbsp;</td></tr>` : ''

    let cartHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:${font};">`

    products.forEach((prod: any, i: number) => {
      const title = prod.title || prod.name || 'Produto'
      const desc = prod.description || prod.variant_title || ''
      const price = typeof prod.price === 'number' ? `R$ ${prod.price.toFixed(2)}` : (prod.price || 'R$ 0,00')
      const oldPrice = prod.compare_at_price ? `R$ ${prod.compare_at_price}` : (prod.compare_price ? `R$ ${prod.compare_price}` : '')
      const imgUrl = prod.image_url || prod.images?.[0]?.src || ''
      const prodUrl = prod.url || (prod.handle ? `/products/${prod.handle}` : '#')
      const checkoutUrl = cfg.buttonHref || '{{checkout_url}}'

      const imgCell = cfg.showImage ? `<td width="${isVert ? '100%' : imgW}" style="vertical-align:top;${isVert ? 'padding-bottom:12px;' : ''}"><a href="${prodUrl}" style="display:block;text-decoration:none;">${imgUrl ? `<img src="${imgUrl}" alt="${title}" width="${isVert ? '100%' : imgW}" style="display:block;border-radius:${imgR}px;max-width:100%;height:auto;" />` : `<div style="width:${isVert ? '100%' : imgW + 'px'};height:${isVert ? '150px' : imgW + 'px'};background:#F3F4F6;border-radius:${imgR}px;"></div>`}</a></td>` : ''

      const detailParts: string[] = []
      if (cfg.showName) detailParts.push(`<p style="margin:0;font-size:${cfg.nameFontSize}px;font-weight:${cfg.nameWeight};color:${cfg.nameColor};">${title}</p>`)
      if (cfg.showDescription && desc) detailParts.push(`<p style="margin:4px 0 0;font-size:${cfg.descFontSize}px;color:${cfg.descColor};">${desc}</p>`)
      if (cfg.showPrice) {
        let priceHtml = `<span style="font-size:${cfg.priceFontSize}px;font-weight:${cfg.priceWeight};color:${cfg.priceColor};">${price}</span>`
        if (cfg.showOldPrice && oldPrice) {
          priceHtml += ` <span style="font-size:${cfg.priceFontSize - 1}px;color:${cfg.oldPriceColor};text-decoration:line-through;">${oldPrice}</span>`
        }
        detailParts.push(`<p style="margin:8px 0 0;">${priceHtml}</p>`)
      }
      if (cfg.showButton) {
        detailParts.push(`<p style="margin:10px 0 0;text-align:${btnAlign === 'full' ? 'center' : btnAlign};"><a href="${checkoutUrl}" style="${btnDisplay}padding:${cfg.buttonPaddingV}px ${cfg.buttonPaddingH}px;background:${cfg.buttonColor};color:${cfg.buttonTextColor};border-radius:${cfg.buttonRadius}px;font-size:${cfg.buttonFontSize}px;font-weight:600;text-decoration:none;box-sizing:border-box;">${cfg.buttonText}</a></p>`)
      }
      const detailsCell = `<td style="vertical-align:top;${isVert ? '' : 'padding-left:16px;'}">${detailParts.join('')}</td>`

      if (isVert) {
        cartHtml += `<tr>${imgCell}</tr><tr>${detailsCell}</tr>`
      } else {
        cartHtml += `<tr>${isRight ? detailsCell + imgCell : imgCell + detailsCell}</tr>`
      }

      if (cfg.separator && i < products.length - 1) {
        cartHtml += sepHtml
      }
    })

    cartHtml += '</table>'
    result = result.replace(match[0], cartHtml)
  }
  return result
}

/**
 * Enriches Items[] in eventData with product images from shopify_products
 * when ImageURL is missing (common for older events stored before the webhook fix).
 * Mutates eventData.Items in place.
 */
export async function enrichOrderItemImages(
  eventData: Record<string, any>,
  supabase: any,
  storeId?: string,
  organizationId?: string,
): Promise<void> {
  const items: any[] = eventData?.Items || []
  if (items.length === 0) return

  const missingImage = items.some((it: any) => !it.ImageURL)
  if (!missingImage) return

  const productIds = [...new Set(items.map((it: any) => it.ProductID).filter(Boolean))]
  if (productIds.length === 0) return

  let query = supabase
    .from('shopify_products')
    .select('shopify_product_id, images, variants, handle')
    .in('shopify_product_id', productIds)
  if (storeId) query = query.eq('store_id', storeId)
  else if (organizationId) query = query.eq('organization_id', organizationId)

  const { data: prods } = await query
  if (!prods || prods.length === 0) return

  const pMap = new Map<string, any>()
  for (const p of prods) pMap.set(p.shopify_product_id, p)

  for (const item of items) {
    if (item.ImageURL) continue
    const prod = pMap.get(item.ProductID)
    if (!prod) continue
    const variant = (prod.variants || []).find((v: any) => String(v.id) === String(item.VariantID))
    const variantImgId = variant?.image_id
    const variantImg = variantImgId ? (prod.images || []).find((img: any) => img.id === variantImgId) : null
    item.ImageURL = variantImg?.src || (prod.images || [])[0]?.src || ''
    if (!item.ProductURL && prod.handle) {
      item.ProductURL = item.ProductURL || ''
    }
  }
}

/**
 * Resolves <!-- WORDER_ORDER_BLOCK:{json} --> placeholders with real order product HTML.
 * Uses Items array from the order event properties (Klaviyo PascalCase format).
 */
export function resolveOrderBlocks(
  html: string,
  eventData: Record<string, any>
): string {
  const regex = /<!-- WORDER_ORDER_BLOCK:([^ ]*?) -->/g
  let result = html
  const matches: RegExpExecArray[] = []
  let m: RegExpExecArray | null
  while ((m = regex.exec(html)) !== null) matches.push(m)
  if (matches.length === 0) return html

  const items: any[] = eventData?.Items || eventData?.items || eventData?.line_items || eventData?.extra?.line_items || []
  const rawLineItems: any[] = eventData?.extra?.line_items || []
  const currency = eventData?.Currency || eventData?.currency || 'BRL'
  const currencySymbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : 'R$'

  const toNum = (v: any): number => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0'))
    return isNaN(n) ? 0 : n
  }
  const fmtPrice = (v: any): string => `${currencySymbol}${toNum(v).toFixed(2)}`

  for (const match of matches) {
    let cfg: any = {}
    try { cfg = JSON.parse(decodeURIComponent(match[1])) } catch { continue }

    const font = cfg.font || 'Arial, sans-serif'
    const primColor = cfg.primaryTextColor || '#000000'
    const secColor = cfg.secondaryTextColor || '#AFAFAF'
    const priceColor = cfg.priceTextColor || '#000000'
    const totalColor = cfg.totalTextColor || primColor
    const divColor = cfg.dividerColor || '#EDEDED'
    const imgW = cfg.imageWidth || 80
    const imgR = cfg.imageBorderRadius ?? 4
    const sepColor = cfg.separatorColor || divColor

    if (items.length === 0) {
      result = result.replace(match[0], '')
      continue
    }

    let orderHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:${font};">`

    items.forEach((item: any, i: number) => {
      const raw = rawLineItems[i] || {}
      const title = item.ProductName || item.title || item.name || raw.title || raw.name || 'Product'
      const qty = toNum(item.Quantity ?? item.quantity ?? raw.quantity ?? 1) || 1
      const itemPrice = toNum(item.ItemPrice ?? item.price ?? raw.price ?? 0)
      const rowTotal = toNum(item.RowTotal ?? (itemPrice * qty))
      const variantName = item.VariantName || item.variant_title || raw.variant_title || ''
      const sku = item.SKU || item.sku || raw.sku || ''
      const imgUrl = item.ImageURL
        || item.image_url
        || raw.image_url
        || raw.image?.src
        || raw.product?.image?.src
        || raw.product?.images?.[0]?.src
        || ''
      const discount = toNum(
        item.DiscountAmount
        ?? item.discount
        ?? (Array.isArray(raw.discount_allocations)
          ? raw.discount_allocations.reduce((s: number, d: any) => s + toNum(d.amount), 0)
          : 0)
      )
      const priceAfterDiscount = discount > 0 ? rowTotal - discount : rowTotal

      let imgCell = ''
      if (cfg.showImage) {
        imgCell = `<td width="${imgW}" valign="top" style="vertical-align:top;padding-right:16px;width:${imgW}px;">${imgUrl
          ? `<img src="${imgUrl}" alt="${title.replace(/"/g, '&quot;')}" width="${imgW}" height="${imgW}" style="display:block;width:${imgW}px;height:${imgW}px;object-fit:cover;border-radius:${imgR}px;border:0;" />`
          : `<div style="width:${imgW}px;height:${imgW}px;background:#F3F4F6;border-radius:${imgR}px;"></div>`
        }</td>`
      }

      const detailLines: string[] = []
      if (cfg.showName) {
        detailLines.push(`<div style="font-size:14px;font-weight:600;color:${primColor};line-height:1.4;">${title}${cfg.showQuantity ? ` &times; ${qty}` : ''}</div>`)
      }
      if (cfg.showVariant && variantName) {
        detailLines.push(`<div style="margin-top:4px;font-size:12px;color:${secColor};line-height:1.4;">${variantName}</div>`)
      }
      if (cfg.showSku && sku) {
        detailLines.push(`<div style="margin-top:2px;font-size:11px;color:${secColor};line-height:1.4;">SKU: ${sku}</div>`)
      }
      if (cfg.showDiscount && discount > 0) {
        detailLines.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;"><tr><td style="font-size:12px;color:${secColor};">Discount</td><td style="font-size:12px;color:${secColor};text-align:right;">-${fmtPrice(discount)}</td></tr><tr><td style="font-size:13px;font-weight:600;color:${primColor};padding-top:2px;">Price after discount</td><td style="font-size:13px;font-weight:700;color:${priceColor};text-align:right;padding-top:2px;">${fmtPrice(priceAfterDiscount)}</td></tr></table>`)
      }

      const priceCell = cfg.showPrice
        ? `<td valign="top" style="vertical-align:top;text-align:right;white-space:nowrap;padding-left:12px;"><div style="font-size:14px;font-weight:600;color:${priceColor};">${fmtPrice(rowTotal)}</div></td>`
        : ''

      orderHtml += `<tr><td style="padding:12px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${imgCell}<td valign="top" style="vertical-align:top;">${detailLines.join('')}</td>${priceCell}</tr></table></td></tr>`

      if (cfg.separator && i < items.length - 1) {
        orderHtml += `<tr><td style="border-top:1px solid ${sepColor};font-size:1px;line-height:1px;">&nbsp;</td></tr>`
      }
    })

    if (cfg.showTotals) {
      const totalPrice = toNum(eventData?.$value ?? eventData?.total_price ?? eventData?.TotalPrice ?? 0)
      const subtotalPrice = toNum(eventData?.SubtotalPrice ?? eventData?.subtotal_price ?? 0)
      const taxPrice = toNum(eventData?.TotalTax ?? eventData?.total_tax ?? 0)
      const discountTotal = toNum(eventData?.DiscountValue ?? eventData?.total_discounts ?? 0)

      // Shipping: prefer numeric field; if missing (webhook only stores method name),
      // derive it from totals: shipping = total - subtotal - tax + discount
      let shippingPrice: number | null = null
      if (typeof eventData?.TotalShipping === 'number') shippingPrice = eventData.TotalShipping
      else if (typeof eventData?.total_shipping === 'number') shippingPrice = eventData.total_shipping
      else if (Array.isArray(eventData?.shipping_lines)) {
        shippingPrice = eventData.shipping_lines.reduce((s: number, sl: any) => s + toNum(sl.price), 0)
      } else if (Array.isArray(eventData?.extra?.shipping_lines)) {
        shippingPrice = eventData.extra.shipping_lines.reduce((s: number, sl: any) => s + toNum(sl.price), 0)
      } else if (totalPrice > 0 && subtotalPrice > 0) {
        const derived = totalPrice - subtotalPrice - taxPrice + discountTotal
        shippingPrice = derived > 0 ? derived : 0
      } else {
        shippingPrice = 0
      }

      const rowStyle = `font-size:13px;color:${secColor};padding:4px 0;line-height:1.4;`
      orderHtml += `<tr><td style="border-top:1px solid ${divColor};padding-top:14px;">`
      orderHtml += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:${font};">`
      if (cfg.showTotalDiscount && discountTotal > 0) {
        orderHtml += `<tr><td style="${rowStyle}">Discount</td><td style="${rowStyle}text-align:right;">-${fmtPrice(discountTotal)}</td></tr>`
      }
      if (cfg.showSubtotal) {
        orderHtml += `<tr><td style="${rowStyle}">Subtotal</td><td style="${rowStyle}text-align:right;">${fmtPrice(subtotalPrice)}</td></tr>`
      }
      if (cfg.showShipping) {
        orderHtml += `<tr><td style="${rowStyle}">Shipping</td><td style="${rowStyle}text-align:right;">${fmtPrice(shippingPrice)}</td></tr>`
      }
      if (cfg.showTax && taxPrice > 0) {
        orderHtml += `<tr><td style="${rowStyle}">Tax</td><td style="${rowStyle}text-align:right;">${fmtPrice(taxPrice)}</td></tr>`
      }
      orderHtml += `<tr><td colspan="2" style="border-top:1px solid ${divColor};padding-top:10px;font-size:1px;line-height:1px;">&nbsp;</td></tr>`
      orderHtml += `<tr><td style="font-size:16px;font-weight:700;color:${totalColor};padding:2px 0;">Total</td><td style="font-size:16px;font-weight:700;color:${totalColor};padding:2px 0;text-align:right;">${fmtPrice(totalPrice)}</td></tr>`
      orderHtml += `</table></td></tr>`
    }

    orderHtml += '</table>'
    result = result.replace(match[0], orderHtml)
  }

  return result
}

/**
 * Full email preparation pipeline.
 */
export function prepareEmailHtml({
  html,
  mergeData,
  emailSendId,
  baseUrl,
  contactId,
  orgId,
  campaignId,
}: {
  html: string;
  mergeData: Record<string, string>;
  emailSendId: string;
  baseUrl: string;
  contactId?: string;
  orgId?: string;
  campaignId?: string;
}): string {
  let result = html;

  // 0. Evaluate conditional blocks — remove blocks that fail condition check
  result = result.replace(
    /<!-- WORDER_CONDITION:(.*?) -->([\s\S]*?)<!-- \/WORDER_CONDITION -->/g,
    (_, condJson: string, content: string) => {
      try {
        const condition = JSON.parse(decodeURIComponent(condJson))
        const shouldShow = evaluateBlockCondition(condition, mergeData)
        return shouldShow ? content : ''
      } catch {
        return content // On error, show the block
      }
    }
  );

  // 0b. Replace countdown base URL placeholder
  result = result.replace(/\{\{countdown_base_url\}\}/g, baseUrl);

  // 1. Replace merge tags
  result = renderMergeTags(result, mergeData);

  // 2. Add unsubscribe link with HMAC token (before tracking rewrites)
  result = addUnsubscribeLink(result, emailSendId, baseUrl, contactId, orgId, campaignId);

  // 3. Rewrite URLs for click tracking
  result = rewriteUrlsForTracking(result, emailSendId, baseUrl);

  // 4. Inject open pixel
  result = injectOpenPixel(result, emailSendId, baseUrl);

  return result;
}
