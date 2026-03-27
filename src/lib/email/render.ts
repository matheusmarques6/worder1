import { mergeTags } from './merge-tags'

interface ContactData {
  first_name?: string
  last_name?: string
  email?: string
  phone?: string
  company?: string
  [key: string]: any
}

interface OrgData {
  name?: string
  domain?: string
  [key: string]: any
}

/** Replace merge tags like {{first_name}} and {{first_name|fallback}} */
export function renderMergeTags(html: string, data: Record<string, any>): string {
  // Handle {{tag|fallback}} syntax
  let result = html.replace(/\{\{(\w+)\|([^}]*)\}\}/g, (_, key, fallback) => {
    const value = data[key]
    return value != null && value !== '' ? String(value) : fallback
  })
  // Handle {{tag}} syntax
  result = result.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = data[key]
    return value != null ? String(value) : ''
  })
  return result
}

/** Rewrite all <a href="..."> for click tracking */
export function rewriteUrlsForTracking(html: string, emailSendId: string, baseUrl: string): string {
  return html.replace(
    /href="(https?:\/\/[^"]+)"/gi,
    (match, url) => {
      // Skip mailto: and anchor links
      if (url.startsWith('mailto:') || url.startsWith('#') || url.includes('/api/t/') || url.includes('/unsubscribe/')) {
        return match
      }
      const encodedUrl = encodeURIComponent(url)
      return `href="${baseUrl}/api/t/c/${emailSendId}?url=${encodedUrl}"`
    }
  )
}

/** Inject 1x1 transparent GIF for open tracking */
export function injectOpenPixel(html: string, emailSendId: string, baseUrl: string): string {
  const pixel = `<img src="${baseUrl}/api/t/o/${emailSendId}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;" />`
  if (html.includes('</body>')) {
    return html.replace('</body>', `${pixel}</body>`)
  }
  return html + pixel
}

/** Add unsubscribe link if not present */
export function addUnsubscribeLink(html: string, emailSendId: string, baseUrl: string): string {
  if (html.includes('/unsubscribe/') || html.includes('descadastrar') || html.includes('cancelar inscrição')) {
    return html
  }
  const unsubLink = `
    <div style="text-align:center;padding:20px 0;font-size:12px;color:#6b7280;">
      <p>Você está recebendo este email porque se inscreveu em nossa lista.</p>
      <a href="${baseUrl}/api/unsubscribe/${emailSendId}" style="color:#6b7280;text-decoration:underline;">
        Cancelar inscrição
      </a>
    </div>`
  if (html.includes('</body>')) {
    return html.replace('</body>', `${unsubLink}</body>`)
  }
  return html + unsubLink
}

/** Full pipeline: merge tags → tracking URLs → open pixel → unsubscribe */
export function prepareEmailHtml(
  html: string,
  contact: ContactData,
  org: OrgData,
  emailSendId: string,
  baseUrl: string
): string {
  const data: Record<string, any> = {
    ...contact,
    store_name: org.name || '',
    store_url: org.domain ? `https://${org.domain}` : '',
  }
  let result = renderMergeTags(html, data)
  result = rewriteUrlsForTracking(result, emailSendId, baseUrl)
  result = injectOpenPixel(result, emailSendId, baseUrl)
  result = addUnsubscribeLink(result, emailSendId, baseUrl)
  return result
}
