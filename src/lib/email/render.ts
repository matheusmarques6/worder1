// =============================================
// WORDER: Email Rendering Pipeline
// /src/lib/email/render.ts
//
// Merge tags, URL tracking, open pixel,
// unsubscribe link, and full pipeline.
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin'
import { rewriteImagesForEmail } from './image-rewrite'

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
  // Standard HTML attribute escape set. We intentionally do NOT escape
  // `/` — that's a legacy OWASP recommendation that doesn't add real
  // XSS protection in modern browsers but DOES uglify every URL into
  // https:&#x2F;&#x2F;... attribute output. URLs ship clean.
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface RenderMergeTagsOptions {
  /**
   * HTML-escape substituted values (default TRUE — XSS prevention for HTML
   * bodies). Pass `escape: false` at PLAIN-TEXT call sites — subject lines
   * and preheaders — where escaping is meaningless and ships literal
   * `&amp;` to the inbox ("Zé & Cia" → "Zé &amp; Cia").
   */
  escape?: boolean;
}

/**
 * Replace {{tag}} and {{tag|fallback}} in HTML with data values.
 *
 * IMPORTANTE: valores são HTML-escaped por padrão (prevenção XSS).
 * Para injetar HTML confiável use a prefix tag `raw.`, ex: `{{raw.html_block}}`.
 * Para contexto de TEXTO (assunto/preheader) use options.escape = false.
 */
export function renderMergeTags(
  html: string,
  data: Record<string, string>,
  options?: RenderMergeTagsOptions
): string {
  const shouldEscape = options?.escape !== false;
  // Normalize bracket-style placeholders to the Worder canonical syntax.
  // Merchants routinely import HTML from Klaviyo / Omnisend / Mailchimp,
  // whose footers ship with [[account.name]] / [[contact.email]] tags.
  // Without this pass those literals reach the inbox unresolved (the
  // merchant just had "© 2026 [[account.name]] | The Most Products"
  // arrive on a customer's phone). Convert to {{...}} so the existing
  // resolver handles them uniformly. Strict regex avoids touching
  // legitimate "[[" in copy.
  html = html.replace(
    /\[\[\s*([a-zA-Z0-9_.][a-zA-Z0-9_.\s|-]*?)\s*\]\]/g,
    (_, inner: string) => `{{${inner.trim()}}}`
  )

  // Inject date tags + cross-platform aliases. Klaviyo and Omnisend use
  // {{ account.* }} / {{ contact.* }}; Worder's mergeData uses flat
  // keys (store_name, email, first_name, ...). Map both so a single
  // template renders the same regardless of source.
  const now = new Date()
  const dateData: Record<string, string> = {
    ...data,
    current_date: now.toLocaleDateString('pt-BR'),
    current_year: String(now.getFullYear()),
    'account.name': data.store_name || data['account.name'] || '',
    'account.website': data.store_url || data['account.website'] || '',
    'account.email': data.store_email || data['account.email'] || '',
    'contact.first_name': data.first_name || data['contact.first_name'] || '',
    'contact.last_name': data.last_name || data['contact.last_name'] || '',
    'contact.full_name': data.full_name || data['contact.full_name'] || '',
    'contact.email': data.email || data['contact.email'] || '',
    'contact.email_unsub': data.unsubscribe_url || data['contact.email_unsub'] || '',
    'contact.phone': data.phone || data['contact.phone'] || '',
    // Aliases legados do editor de TEXTO (sintaxe pontilhada antiga) → chaves
    // flat reais. Garante que templates de texto salvos antes da correção do
    // painel de variáveis continuem resolvendo em vez de mostrar o literal.
    'cart.url': data.checkout_url || data['cart.url'] || '',
    'cart.total': data.cart_total || data['cart.total'] || '',
    'cart.items_count': data.cart_item_count || data['cart.items_count'] || '',
    'store.name': data.store_name || data['store.name'] || '',
    'store.url': data.store_url || data['store.url'] || '',
    'store.email': data.store_email || data['store.email'] || '',
    'store.phone': data.store_phone || data['store.phone'] || '',
    'order.number': data.order_number || data['order.number'] || '',
    'order.total': data.order_total || data['order.total'] || '',
    'order.status': data.order_status || data['order.status'] || '',
    'order.tracking_url': data.tracking_url || data['order.tracking_url'] || '',
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
    return rawMode || !shouldEscape ? final : escapeHtml(final)
  }

  // Replace {{tag|fallback}} first (with fallback). Allows optional
  // whitespace around the tag so both {{checkout_url|loja.com}} and
  // {{ checkout_url | loja.com }} work — matches Klaviyo/Omnisend
  // tolerance and lines up with how the variable picker generates
  // tags ({{ trigger.path }} format).
  let result = html.replace(
    /\{\{\s*([a-zA-Z0-9_.\[\]]+)\s*\|\s*([^}]*?)\s*\}\}/g,
    (_, tag: string, fallback: string) => resolve(tag, fallback)
  )

  // Replace {{tag}} (no fallback) — same whitespace tolerance.
  result = result.replace(
    /\{\{\s*([a-zA-Z0-9_.\[\]]+)\s*\}\}/g,
    (_, tag: string) => resolve(tag, '')
  )

  return result
}

/**
 * Decodifica entidades HTML basicas. URLs em atributos HTML SAO escritas
 * com `&amp;` (correto pra HTML valido), mas o tracker precisa do `&` cru
 * antes de encodeURIComponent. Sem isso, o `&amp;` ia parar dentro do
 * `?url=` codificado como `%26amp%3B`, e o `decodeURIComponent` no
 * /api/t/c/[id] devolveria `&amp;` literal — destino quebrado.
 */
function decodeHtmlEntitiesInUrl(url: string): string {
  return url
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
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

      const decoded = decodeHtmlEntitiesInUrl(url);

      // Destino invalido: merge tag nao resolvida ({{x}}), sufixo orfao
      // (`&...`, `?...`) ou nao-http(s). Wrappear so esconde o problema —
      // o tracker decodificaria e cairia no fallback storefront. Melhor
      // deixar o link aparecer quebrado pro merchant notar do que esconder
      // atras de um redirect silencioso.
      if (
        /\{\{|\}\}/.test(decoded) ||
        decoded.startsWith('&') ||
        decoded.startsWith('?') ||
        !/^https?:\/\//i.test(decoded)
      ) {
        console.warn(
          `[email/track] href nao trackavel — send=${emailSendId} href="${decoded.slice(0, 80)}"`
        );
        return match;
      }

      const encodedUrl = encodeURIComponent(decoded);
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
 * Build the canonical unsubscribe URL for a recipient. Used both
 * in the visible footer link and in the List-Unsubscribe header so
 * Gmail's one-click unsub button (RFC 8058) hits the same endpoint.
 */
export function buildUnsubscribeUrl(
  emailSendId: string,
  baseUrl: string,
  contactId?: string,
  orgId?: string,
  campaignId?: string
): string {
  if (contactId && orgId) {
    try {
      const { signUnsubscribeToken } = require('@/lib/email/unsubscribe-token');
      const token = signUnsubscribeToken({ contactId, orgId, campaignId });
      return `${baseUrl}/unsubscribe?token=${token}`;
    } catch {
      return `${baseUrl}/api/unsubscribe/${emailSendId}`;
    }
  }
  return `${baseUrl}/api/unsubscribe/${emailSendId}`;
}

/**
 * Build a signed URL to the preference center (manage channel subscriptions,
 * email frequency, topics). Reuses the same HMAC token as unsubscribe.
 */
export function buildPreferencesUrl(
  baseUrl: string,
  contactId?: string,
  orgId?: string,
  campaignId?: string
): string | null {
  if (!contactId || !orgId) return null;
  try {
    const { signUnsubscribeToken } = require('@/lib/email/unsubscribe-token');
    const token = signUnsubscribeToken({ contactId, orgId, campaignId });
    return `${baseUrl}/preferencias?token=${token}`;
  } catch {
    return null;
  }
}

/**
 * RFC 2369 + RFC 8058 List-Unsubscribe headers. Gmail Postmaster
 * Tools requires both List-Unsubscribe and List-Unsubscribe-Post
 * for high-volume senders to qualify for the inbox; without them
 * deliverability craters and the dashboard flags the domain.
 *
 * The mailto: secondary is a fallback for clients that don't speak
 * one-click HTTP unsub; we don't actually run an SMTP unsubscribe
 * mailbox but Gmail accepts the header even when nothing reads it.
 */
export function buildListUnsubscribeHeaders(unsubUrl: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${unsubUrl}>, <mailto:unsubscribe@worder.email?subject=unsubscribe>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
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
  const unsubUrl = buildUnsubscribeUrl(emailSendId, baseUrl, contactId, orgId, campaignId);
  const prefsUrl = buildPreferencesUrl(baseUrl, contactId, orgId, campaignId);

  // If the template already has a footer with an unsubscribe link (custom
  // footer block, custom CAN-SPAM section), avoid double-appending. Detect
  // by looking for any anchor pointing at /unsubscribe or /preferencias on
  // our domain — these are the standard footer destinations.
  const hasUnsubAnchor = /href=["'][^"']*\/unsubscribe(\?|["'])/i.test(html);
  const hasPrefsAnchor = /href=["'][^"']*\/preferencias(\?|["'])/i.test(html);
  if (hasUnsubAnchor && hasPrefsAnchor) {
    return html;
  }

  // Build the missing portions so we never lose either link. If only the
  // unsubscribe is present in the template, we append a thin preferences
  // line; if neither exists, we render the full footer.
  const prefsLink = prefsUrl
    ? `<a href="${prefsUrl}" style="color:#999;text-decoration:underline;">Editar preferências</a>`
    : '';
  const unsubLink = `<a href="${unsubUrl}" style="color:#999;text-decoration:underline;">Cancelar inscrição</a>`;

  let footerHtml: string;
  if (hasUnsubAnchor && !hasPrefsAnchor && prefsLink) {
    footerHtml = `
<div style="text-align:center;padding:8px 0;font-size:12px;color:#999;font-family:Arial,Helvetica,sans-serif;">
  ${prefsLink}
</div>`;
  } else {
    footerHtml = `
<div style="text-align:center;padding:20px 0 10px;font-size:12px;color:#999;font-family:Arial,Helvetica,sans-serif;line-height:1.6;">
  <div>
    ${unsubLink}${prefsLink ? `&nbsp;&middot;&nbsp;${prefsLink}` : ''}
  </div>
  <div style="margin-top:6px;">Você recebeu este e-mail porque se inscreveu em nossa lista.</div>
</div>`;
  }

  if (html.includes('</body>')) {
    return html.replace('</body>', `${footerHtml}</body>`);
  }

  return html + footerHtml;
}

/**
 * Resolve dynamic product blocks in email HTML.
 * Replaces <!-- WORDER_PRODUCT_BLOCK:... --> comments with real product HTML.
 */
export async function resolveProductBlocks(
  html: string,
  orgId: string,
  contactId?: string,
  eventData?: Record<string, any>
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
      // Direct library call — no internal HTTP round-trip. This runs once
      // per contact for emails that contain a product block, so the saved
      // 50-200ms/call adds up across a batch.
      const { resolveProductFeed } = await import('@/lib/email/product-feeds')
      products = await resolveProductFeed({
        orgId, feedType, contactId, maxProducts, eventData,
      })
    } catch {
      // No products available
    }

    if (products.length === 0 && feedType.startsWith('trigger_')) {
      try {
        const { resolveProductFeed } = await import('@/lib/email/product-feeds')
        products = await resolveProductFeed({ orgId, feedType: 'bestsellers', maxProducts })
      } catch {}
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
  contactId?: string,
  eventData?: Record<string, any>,
  /** The automation's trigger type (e.g. 'trigger_checkout_abandoned'). When
   *  provided, the CTA link adapts to it (checkout recovery / cart permalink /
   *  product page / order status). When absent (campaign broadcast), the
   *  family is inferred from the event payload. */
  triggerType?: string | null
): Promise<string> {
  const { triggerFamily, resolveTriggerCtaUrl, getShopDomain, isManualCtaOverride } =
    await import('@/lib/email/trigger-cta')
  const regex = /<!-- WORDER_CART_BLOCK:([^ ]*?) -->/g
  let result = html
  const matches: RegExpExecArray[] = []
  let m: RegExpExecArray | null
  while ((m = regex.exec(html)) !== null) matches.push(m)

  for (const match of matches) {
    let cfg: any = {}
    try { cfg = JSON.parse(decodeURIComponent(match[1])) } catch { continue }

    // Resolve the recovery / checkout URL directly from the event so the
    // CTA button always lands on a working link — even when the
    // `{{checkout_url}}` merge tag isn't resolved by the caller. We walk
    // every place Shopify (webhook + pixel + enrichment) and Klaviyo can
    // stash it. Order: top-level CheckoutURL/checkout_url → raw.* nested
    // → recovery_url legacy → constructed from raw.token + landing_site
    // → buttonHref override → fallback.
    const ev: any = eventData || {}
    const props: any = ev.properties || ev
    const raw: any = props.raw || ev.raw || {}
    let eventCheckoutUrl: string =
      props.CheckoutURL ||
      props.checkout_url ||
      props.AbandonedCheckoutURL ||
      raw.abandoned_checkout_url ||
      raw.recovery_url ||
      raw.order_status_url ||
      ''
    // Construct URL when raw has the cart token + the host. This is the
    // common case for cart-abandon events where the merchant fetched
    // /cart.js (which has token + host but no abandoned_checkout_url).
    if (!eventCheckoutUrl) {
      const referring = raw.referring_site || props.referring_site || ''
      const cartHost = referring ? referring.replace(/\/$/, '') : ''
      const cartToken = raw.cart_token || raw.token || props.cart_token || props.token || ''
      const landingSite = raw.landing_site || props.landing_site || ''
      if (cartHost && cartToken) {
        // /cart/c/<token>?key=... when landing_site already carries the key,
        // else /checkouts/c/<token>/recover (Shopify accepts both).
        if (landingSite && landingSite.includes('?key=')) {
          const keyMatch = landingSite.match(/[?&]key=([a-f0-9]+)/i)
          eventCheckoutUrl = keyMatch
            ? `${cartHost}/cart/c/${cartToken}?key=${keyMatch[1]}`
            : `${cartHost}${landingSite.startsWith('/') ? '' : '/'}${landingSite}`
        } else {
          eventCheckoutUrl = `${cartHost}/checkouts/c/${cartToken}/recover`
        }
      }
    }
    // Currency for price formatting — falls through to BRL for
    // backward compatibility when neither is set.
    const eventCurrency: string =
      props.Currency ||
      props.currency ||
      raw.currency ||
      raw.presentment_currency ||
      ev.currency ||
      'BRL'
    // Locale used by Intl.NumberFormat — pick a sensible default per
    // currency so prices don't look weird (e.g. R$ for GBP).
    const localeForCurrency: Record<string, string> = {
      BRL: 'pt-BR',
      USD: 'en-US',
      GBP: 'en-GB',
      EUR: 'de-DE',
      CAD: 'en-CA',
      AUD: 'en-AU',
      MXN: 'es-MX',
      ARS: 'es-AR',
      CLP: 'es-CL',
      COP: 'es-CO',
      JPY: 'ja-JP',
    }
    const formatPrice = (n: number): string => {
      try {
        return new Intl.NumberFormat(localeForCurrency[eventCurrency] || 'en-US', {
          style: 'currency',
          currency: eventCurrency,
          minimumFractionDigits: 2,
        }).format(n)
      } catch {
        return `${eventCurrency} ${n.toFixed(2)}`
      }
    }
    // Pick the resolver feed_type based on the block config. Default is
    // trigger_auto, which lets the API resolver detect from event_data
    // whether to pull cart items, checkout line items, viewed product,
    // or placed-order items. cart_items keeps the legacy "last recovery
    // cart" behavior for blocks that explicitly want it.
    const feedType = cfg.feedType || 'trigger_auto'

    // Product cap. maxItems === 0 (or unset) means "todos os produtos do
    // gatilho" — stack them all. We keep a generous safety ceiling so a
    // pathological cart can't produce a monstrous email.
    const MAX_STACK = 50
    const itemCap = cfg.maxItems && Number(cfg.maxItems) > 0 ? Number(cfg.maxItems) : MAX_STACK

    let products: any[] = []
    try {
      const { resolveProductFeed } = await import('@/lib/email/product-feeds')
      products = await resolveProductFeed({
        orgId,
        feedType,
        contactId,
        maxProducts: itemCap,
        eventData,
      })
    } catch {}

    // Fallback: when the API resolver returned nothing (network blip,
    // store filter mismatch, etc.) but the event itself carries items,
    // render directly from the event so the merchant doesn't see a gap.
    if (products.length === 0) {
      const fallbackItems: any[] =
        raw.line_items ||
        props.Items ||
        props.items ||
        props.line_items ||
        ev.raw?.line_items ||
        []
      if (Array.isArray(fallbackItems) && fallbackItems.length > 0) {
        products = fallbackItems.slice(0, itemCap).map((it: any) => {
          const productObj = it.product || it.Product || {}
          const variant = it.variant || it.Variant || {}
          // Same cascade the canonical normalizer uses — every shape any
          // source ships. Shopify cart line_items put the variant image
          // at featured_image.url AND mirror it as a string in `image`.
          const imageUrl =
            it.ImageURL ||
            it.image_url ||
            it.imageUrl ||
            it.featured_image?.url ||
            it.featured_image?.src ||
            (typeof it.image === 'string' ? it.image : null) ||
            it.image?.src ||
            it.image?.url ||
            productObj.variant_images_url ||
            productObj.image?.src ||
            productObj.images?.[0]?.src ||
            productObj.images?.[0]?.url ||
            productObj.product_image_urls?.[0] ||
            variant?.image?.src ||
            it.Product?.VariantImage ||
            it.Product?.Images?.[0] ||
            null
          return {
            product_id: it.product_id || it.productId || it.ProductID || productObj.id || null,
            variant_id: it.VariantID || it.variant_id || it.variantId || variant.id || null,
            title: it.ProductName || it.title || it.name || it.product_title || productObj.title || it.presentment_title || 'Produto',
            price: parseFloat(
              it.ItemPrice ||
              it.price ||
              variant.price?.amount ||
              variant.price ||
              it.line_price ||
              '0'
            ),
            compare_at_price: it.compare_at_price || it.CompareAtPrice || variant.compare_at_price || null,
            image_url: imageUrl,
            url:
              it.ProductURL ||
              it.product_url ||
              it.url ||
              productObj.product_url ||
              productObj.url ||
              '#',
            quantity: it.Quantity || it.quantity || 1,
            variant_title: it.variant_title || it.VariantName || it.variantTitle || it.presentment_variant_title || null,
          }
        })
      }
      if (products.length === 0) {
        result = result.replace(match[0], '')
        continue
      }
    }

    const isVert = cfg.layoutType === 'vertical'
    const isRight = cfg.layoutType === 'image-right'
    const font = cfg.font || 'Arial, sans-serif'
    const imgW = cfg.imageWidth || 200
    const imgR = cfg.imageBorderRadius || 0
    const btnAlign = cfg.buttonAlign || 'left'
    const btnDisplay = btnAlign === 'full' ? 'display:block;width:100%;text-align:center;' : `display:inline-block;`
    const sepHtml = cfg.separator ? `<tr><td style="border-top:1px solid ${cfg.separatorColor || '#E5E7EB'};font-size:1px;line-height:1px;" colspan="2">&nbsp;</td></tr>` : ''

    // ── Trigger-aware CTA link ──────────────────────────────────────────
    // The button adapts to the automation's trigger (like Omnisend):
    //   checkout abandoned → recovery URL; add-to-cart/cart → a Shopify cart
    //   permalink with ALL the items (/cart/variant:qty…); viewed/browse →
    //   the product page; order → order status. A manual buttonHref (that
    //   isn't one of the legacy auto placeholders) still wins as an override.
    const shopDomain = getShopDomain(eventData)
    const family = triggerFamily(triggerType)
    const permalinkItems = products.map((p: any) => ({ variant_id: p.variant_id, quantity: p.quantity }))
    const orderStatusUrl: string = props.OrderStatusURL || props.order_status_url || raw.order_status_url || ''
    const manualOverride = isManualCtaOverride(cfg.buttonHref) ? String(cfg.buttonHref) : ''
    const aggregateCtaUrl = resolveTriggerCtaUrl({
      family,
      eventCheckoutUrl,
      shopDomain,
      items: permalinkItems,
      productUrl: (props.ProductURL || props.product_url || products[0]?.url || '') as string,
      orderStatusUrl,
    })

    let cartHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:${font};">`

    products.forEach((prod: any, i: number) => {
      const title = prod.title || prod.name || 'Produto'
      const desc = prod.description || prod.variant_title || ''
      const priceNum = typeof prod.price === 'number' ? prod.price : parseFloat(String(prod.price || '0'))
      const price = isFinite(priceNum) && priceNum > 0 ? formatPrice(priceNum) : formatPrice(0)
      const oldPriceNum = prod.compare_at_price != null ? parseFloat(String(prod.compare_at_price)) : (prod.compare_price != null ? parseFloat(String(prod.compare_price)) : null)
      const oldPrice = oldPriceNum && isFinite(oldPriceNum) && oldPriceNum > priceNum ? formatPrice(oldPriceNum) : ''
      // Image fallback cascade — tries every shape we ship, including
      // featured_image.url (raw shopify) and product.product_image_urls[].
      const imgUrl =
        prod.image_url ||
        prod.imageUrl ||
        prod.image ||
        prod.featured_image?.url ||
        prod.featured_image?.src ||
        prod.images?.[0]?.src ||
        prod.images?.[0]?.url ||
        prod.product?.product_image_urls?.[0] ||
        prod.product?.variant_images_url ||
        prod.product?.image?.src ||
        ''
      const prodUrl = prod.url || (prod.handle ? `/products/${prod.handle}` : '#')
      // Button href, in priority order:
      //   1) manual override (a real custom link set by the user)
      //   2) an explicit per-product checkout/recovery URL on the item
      //   3) trigger-aware link: for product-family triggers each card links
      //      to ITS OWN product page; otherwise the aggregate cart/checkout/
      //      order link (so every button recovers the whole cart/checkout)
      //   4) legacy merge-tag placeholder (resolved downstream)
      const productCheckoutUrl: string = prod.checkout_url || prod.recovery_url || ''
      const perProductAuto =
        family === 'product'
          ? (prodUrl && prodUrl !== '#' ? prodUrl : aggregateCtaUrl)
          : aggregateCtaUrl
      const checkoutUrl =
        manualOverride || productCheckoutUrl || perProductAuto || eventCheckoutUrl || '{{checkout_url}}'

      // Image cell — uses CSS `aspect-ratio` to keep a square frame and
      // `object-fit: cover` so the image fills without distortion.
      // Fallback (no URL) renders a soft neutral placeholder instead of a
      // jarring gray box.
      const imgSize = isVert ? '100%' : `${imgW}px`
      const imgCell = cfg.showImage ? `<td width="${isVert ? '100%' : imgW}" style="vertical-align:middle;${isVert ? 'padding:0 0 12px 0;' : 'padding:0;'}">
        <a href="${prodUrl}" style="display:block;text-decoration:none;">${imgUrl
          ? `<img src="${imgUrl}" alt="${title}" width="${isVert ? '100%' : imgW}" style="display:block;width:${imgSize};height:auto;max-width:100%;border-radius:${imgR}px;border:0;outline:none;" />`
          : `<div style="width:${imgSize};${isVert ? 'aspect-ratio:1/1;min-height:160px;' : `height:${imgW}px;`}background:#F3F4F6;border-radius:${imgR}px;display:flex;align-items:center;justify-content:center;color:#9CA3AF;font-size:11px;">imagem</div>`
        }</a>
      </td>` : ''

      const detailParts: string[] = []
      if (cfg.showName) detailParts.push(`<p style="margin:0 0 6px;font-size:${cfg.nameFontSize}px;font-weight:${cfg.nameWeight};color:${cfg.nameColor};line-height:1.35;">${title}</p>`)
      if (cfg.showDescription && desc) detailParts.push(`<p style="margin:0 0 6px;font-size:${cfg.descFontSize}px;color:${cfg.descColor};line-height:1.4;">${desc}</p>`)
      if (cfg.showPrice) {
        let priceHtml = `<span style="font-size:${cfg.priceFontSize}px;font-weight:${cfg.priceWeight};color:${cfg.priceColor};">${price}</span>`
        if (cfg.showOldPrice && oldPrice) {
          priceHtml += ` <span style="font-size:${(cfg.priceFontSize || 14) - 1}px;color:${cfg.oldPriceColor};text-decoration:line-through;margin-left:6px;">${oldPrice}</span>`
        }
        detailParts.push(`<p style="margin:0 0 ${cfg.showButton ? 12 : 0}px;line-height:1.3;">${priceHtml}</p>`)
      }
      if (cfg.showButton) {
        detailParts.push(`<p style="margin:0;text-align:${btnAlign === 'full' ? 'center' : btnAlign};line-height:1;"><a href="${checkoutUrl}" style="${btnDisplay}padding:${cfg.buttonPaddingV}px ${cfg.buttonPaddingH}px;background:${cfg.buttonColor};color:${cfg.buttonTextColor};border-radius:${cfg.buttonRadius}px;font-size:${cfg.buttonFontSize}px;font-weight:600;text-decoration:none;box-sizing:border-box;mso-padding-alt:0;">${cfg.buttonText}</a></p>`)
      }
      // vertical-align:middle on the details cell — the user explicitly
      // asked for vertically-centered text alongside the image.
      const detailsCell = `<td style="vertical-align:middle;${isVert ? 'padding:0;' : `padding:0 0 0 ${isRight ? '0' : '20px'};${isRight ? 'padding-right:20px;' : ''}`}">${detailParts.join('')}</td>`

      // Wrap each product row in its own table-row with consistent
      // vertical padding so multi-item carts breathe.
      const rowPadTop = i === 0 ? '0' : '16px'
      const rowPadBottom = i === products.length - 1 ? '0' : '16px'
      if (isVert) {
        cartHtml += `<tr><td style="padding:${rowPadTop} 0 ${rowPadBottom};"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${imgCell}</tr><tr>${detailsCell}</tr></table></td></tr>`
      } else {
        cartHtml += `<tr><td style="padding:${rowPadTop} 0 ${rowPadBottom};"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${isRight ? detailsCell + imgCell : imgCell + detailsCell}</tr></table></td></tr>`
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
 * Enriches Items[] (Klaviyo PascalCase) and/or line_items[] (raw Shopify) in
 * eventData with product images from shopify_products when image URL is missing.
 * Handles both webhook-bridge formats transparently. Mutates arrays in place.
 */
export async function enrichOrderItemImages(
  eventData: Record<string, any>,
  supabase: any,
  storeId?: string,
  organizationId?: string,
): Promise<void> {
  const items: any[] = Array.isArray(eventData?.Items) ? eventData.Items : []
  const lineItems: any[] = Array.isArray(eventData?.line_items) ? eventData.line_items : []
  const extraLineItems: any[] = Array.isArray(eventData?.extra?.line_items) ? eventData.extra.line_items : []

  const all = [...items, ...lineItems, ...extraLineItems]
  if (all.length === 0) return

  const needsImage = (it: any) => {
    const existing = it.ImageURL || it.image_url || it.image?.src
    return !existing
  }
  if (!all.some(needsImage)) return

  const productIds = [...new Set(
    all.map((it: any) => it.ProductID || (it.product_id != null ? String(it.product_id) : null)).filter(Boolean)
  )] as string[]
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
  for (const p of prods) pMap.set(String(p.shopify_product_id), p)

  const imgSrc = (img: any): string => img?.src || img?.url || ''

  const resolveImage = (it: any): string => {
    const pid = it.ProductID || (it.product_id != null ? String(it.product_id) : '')
    if (!pid) return ''
    const prod = pMap.get(pid)
    if (!prod) return ''
    const images: any[] = prod.images || []
    const vid = it.VariantID || (it.variant_id != null ? String(it.variant_id) : '')
    const variant = (prod.variants || []).find((v: any) => String(v.id) === vid)
    const variantImgId = variant?.image_id
    const variantImg = variantImgId
      ? images.find((img: any) => String(img.id) === String(variantImgId))
      : null
    return imgSrc(variantImg) || imgSrc(images[0]) || ''
  }

  for (const it of items) {
    if (!it.ImageURL) {
      const url = resolveImage(it)
      if (url) it.ImageURL = url
    }
  }
  for (const it of lineItems) {
    if (!it.image_url && !it.image?.src) {
      const url = resolveImage(it)
      if (url) { it.image_url = url; it.image = it.image || { src: url } }
    }
  }
  for (const it of extraLineItems) {
    if (!it.image_url && !it.image?.src) {
      const url = resolveImage(it)
      if (url) { it.image_url = url; it.image = it.image || { src: url } }
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

    // Title section — "Resumo do Pedido"
    if (cfg.showTitle && cfg.titleText) {
      const tAlign = cfg.titleAlign || 'center'
      const tColor = cfg.titleColor || primColor
      const tSize = cfg.titleFontSize || 24
      const tWeight = cfg.titleWeight || '700'
      orderHtml += `<tr><td style="padding:0 0 8px;text-align:${tAlign};font-size:${tSize}px;font-weight:${tWeight};color:${tColor};line-height:1.3;">${cfg.titleText}</td></tr>`
    }

    // Order meta (number + date)
    const showOrderNum = cfg.showOrderNumber !== false
    const showOrderDate = cfg.showOrderDate !== false
    if (showOrderNum || showOrderDate) {
      const orderNum = eventData?.OrderNumber || eventData?.order_number || eventData?.OrderId || eventData?.order_id || ''
      const rawDate = eventData?.OrderDate
        || eventData?.occurred_at
        || eventData?.created_at
        || eventData?.CreatedAt
        || ''
      const locale = currency === 'USD' ? 'en-US' : currency === 'EUR' ? 'en-GB' : 'pt-BR'
      let dateStr = ''
      if (rawDate) {
        const d = new Date(rawDate)
        if (!isNaN(d.getTime())) {
          try {
            dateStr = d.toLocaleString(locale, { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
          } catch {
            dateStr = d.toISOString().split('T')[0]
          }
        }
      }
      const metaParts: string[] = []
      if (showOrderNum && orderNum) metaParts.push(`${cfg.orderNumberLabel || 'Pedido'}: #${orderNum}`)
      if (showOrderDate && dateStr) metaParts.push(dateStr)
      if (metaParts.length > 0) {
        const mAlign = cfg.metaAlign || 'center'
        const mColor = cfg.metaColor || secColor
        const mSize = cfg.metaFontSize || 13
        orderHtml += `<tr><td style="padding:0 0 20px;text-align:${mAlign};font-size:${mSize}px;color:${mColor};line-height:1.5;">${metaParts.join('<br/>')}</td></tr>`
      }
    }

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
        || raw.image?.src || raw.image?.url
        || raw.product?.image?.src || raw.product?.image?.url
        || raw.product?.images?.[0]?.src || raw.product?.images?.[0]?.url
        || ''
      const discount = toNum(
        item.DiscountAmount
        ?? item.discount
        ?? (Array.isArray(raw.discount_allocations)
          ? raw.discount_allocations.reduce((s: number, d: any) => s + toNum(d.amount), 0)
          : 0)
      )
      const priceAfterDiscount = discount > 0 ? rowTotal - discount : rowTotal

      // Omnisend-style layout: image cell vertically centered spanning all detail rows.
      // Product name row has quantity + price aligned. Variant/SKU/Discount render as
      // separate rows with label on left, value aligned right (like the totals table).
      const isEnLocale = currency === 'USD' || currency === 'EUR'
      const imgCell = cfg.showImage
        ? `<td width="${imgW}" valign="middle" style="vertical-align:middle;padding:0 16px 0 0;width:${imgW}px;">${imgUrl
            ? `<img src="${imgUrl}" alt="${title.replace(/"/g, '&quot;')}" width="${imgW}" height="${imgW}" style="display:block;width:${imgW}px;height:${imgW}px;object-fit:cover;border-radius:${imgR}px;border:0;" />`
            : `<div style="width:${imgW}px;height:${imgW}px;background:#F3F4F6;border-radius:${imgR}px;"></div>`
          }</td>`
        : ''

      // Build the detail block (right of image) as its own table so name/variant
      // rows align their right-edge values with each other (Omnisend look).
      const detailRows: string[] = []
      if (cfg.showName) {
        const nameText = `${title}${cfg.showQuantity ? ` &times; ${qty}` : ''}`
        const priceText = cfg.showPrice ? fmtPrice(rowTotal) : ''
        detailRows.push(
          `<tr>
            <td style="font-size:14px;font-weight:600;color:${primColor};line-height:1.45;padding:0;">${nameText}</td>
            ${cfg.showPrice ? `<td style="font-size:14px;font-weight:600;color:${priceColor};line-height:1.45;padding:0 0 0 12px;text-align:right;white-space:nowrap;">${priceText}</td>` : ''}
          </tr>`
        )
      }
      if (cfg.showVariant && variantName) {
        const vLabel = isEnLocale ? 'Variant' : 'Variante'
        detailRows.push(
          `<tr>
            <td style="font-size:12px;color:${secColor};line-height:1.5;padding:4px 0 0;">${vLabel}:</td>
            <td style="font-size:12px;color:${secColor};line-height:1.5;padding:4px 0 0 12px;text-align:right;">${variantName}</td>
          </tr>`
        )
      }
      if (cfg.showSku && sku) {
        detailRows.push(
          `<tr>
            <td style="font-size:11px;color:${secColor};line-height:1.5;padding:2px 0 0;">SKU:</td>
            <td style="font-size:11px;color:${secColor};line-height:1.5;padding:2px 0 0 12px;text-align:right;">${sku}</td>
          </tr>`
        )
      }
      if (cfg.showDiscount && discount > 0) {
        const dLbl = isEnLocale ? 'Discount' : 'Desconto'
        const pLbl = isEnLocale ? 'Price after discount' : 'Preço com desconto'
        detailRows.push(
          `<tr>
            <td style="font-size:12px;color:${secColor};line-height:1.5;padding:6px 0 0;">${dLbl}:</td>
            <td style="font-size:12px;color:${secColor};line-height:1.5;padding:6px 0 0 12px;text-align:right;">-${fmtPrice(discount)}</td>
          </tr>
          <tr>
            <td style="font-size:13px;font-weight:600;color:${primColor};line-height:1.5;padding:2px 0 0;">${pLbl}:</td>
            <td style="font-size:13px;font-weight:700;color:${priceColor};line-height:1.5;padding:2px 0 0 12px;text-align:right;">${fmtPrice(priceAfterDiscount)}</td>
          </tr>`
        )
      }

      const detailCell = `<td valign="middle" style="vertical-align:middle;padding:0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          ${detailRows.join('')}
        </table>
      </td>`

      orderHtml += `<tr><td style="padding:16px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>${imgCell}${detailCell}</tr>
        </table>
      </td></tr>`

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

      const rowLabelStyle = `font-size:13px;color:${secColor};padding:6px 0;line-height:1.5;`
      const rowValueStyle = `font-size:13px;color:${secColor};padding:6px 0 6px 12px;line-height:1.5;text-align:right;white-space:nowrap;`
      orderHtml += `<tr><td style="border-top:1px solid ${divColor};padding-top:18px;">`
      orderHtml += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:${font};">`
      const isEnLocale2 = currency === 'USD' || currency === 'EUR'
      const lbl = isEnLocale2
        ? { discount: 'Discount', subtotal: 'Subtotal price', shipping: 'Shipping price', tax: 'Taxes', total: 'Total price' }
        : { discount: 'Desconto', subtotal: 'Subtotal', shipping: 'Frete', tax: 'Taxa', total: 'Total' }
      if (cfg.showTotalDiscount && discountTotal > 0) {
        orderHtml += `<tr><td style="${rowLabelStyle}">${lbl.discount}:</td><td style="${rowValueStyle}">-${fmtPrice(discountTotal)}</td></tr>`
      }
      if (cfg.showSubtotal) {
        orderHtml += `<tr><td style="${rowLabelStyle}">${lbl.subtotal}:</td><td style="${rowValueStyle}">${fmtPrice(subtotalPrice)}</td></tr>`
      }
      if (cfg.showShipping) {
        orderHtml += `<tr><td style="${rowLabelStyle}">${lbl.shipping}:</td><td style="${rowValueStyle}">${fmtPrice(shippingPrice)}</td></tr>`
      }
      if (cfg.showTax && taxPrice > 0) {
        orderHtml += `<tr><td style="${rowLabelStyle}">${lbl.tax}:</td><td style="${rowValueStyle}">${fmtPrice(taxPrice)}</td></tr>`
      }
      orderHtml += `<tr><td colspan="2" style="border-top:1px solid ${divColor};padding-top:14px;font-size:1px;line-height:1px;">&nbsp;</td></tr>`
      orderHtml += `<tr><td style="font-size:18px;font-weight:700;color:${totalColor};padding:4px 0 0;line-height:1.4;">${lbl.total}:</td><td style="font-size:18px;font-weight:700;color:${totalColor};padding:4px 0 0 12px;line-height:1.4;text-align:right;white-space:nowrap;">${fmtPrice(totalPrice)}</td></tr>`
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

  // Tracking URLs (open pixel, click rewrite, unsubscribe) MUST be
  // absolute https origins — relative URLs get stripped by Gmail's
  // image proxy and webmail clients refuse to navigate to them, which
  // is why an empty baseUrl silently destroys every metric without
  // any visible error. Refuse to render rather than ship a broken
  // email; callers should pull from getAppBaseUrl() which has the
  // production fallback.
  if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) {
    console.error('[prepareEmailHtml] invalid baseUrl — tracking will not work', {
      baseUrl,
      emailSendId,
    });
  }

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

  // 1b. Rewrite Supabase Storage image URLs to the transform/CDN
  // endpoint. Same-host URLs but the /render/image/ path serves
  // through Supabase's edge cache + auto-resizes to email width +
  // negotiates WebP. Without this rewrite Gmail's image proxy
  // pulls the raw object from origin, times out on mobile, and the
  // recipient sees a broken icon even though Resend's preview
  // rendered fine.
  result = rewriteImagesForEmail(result, { width: 600, quality: 80 });

  // 2. Add unsubscribe link with HMAC token (before tracking rewrites)
  result = addUnsubscribeLink(result, emailSendId, baseUrl, contactId, orgId, campaignId);

  // 3. Rewrite URLs for click tracking
  result = rewriteUrlsForTracking(result, emailSendId, baseUrl);

  // 4. Inject open pixel
  result = injectOpenPixel(result, emailSendId, baseUrl);

  return result;
}
