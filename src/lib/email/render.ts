// =============================================
// WORDER: Email Rendering Pipeline
// /src/lib/email/render.ts
//
// Merge tags, URL tracking, open pixel,
// unsubscribe link, and full pipeline.
// =============================================

/**
 * Replace {{tag}} and {{tag|fallback}} in HTML with data values.
 */
export function renderMergeTags(
  html: string,
  data: Record<string, string>
): string {
  // Replace {{tag|fallback}} first (with fallback)
  let result = html.replace(
    /\{\{([a-zA-Z0-9_.]+)\|([^}]*)\}\}/g,
    (_, tag: string, fallback: string) => {
      return data[tag] ?? fallback;
    }
  );

  // Replace {{tag}} (no fallback)
  result = result.replace(
    /\{\{([a-zA-Z0-9_.]+)\}\}/g,
    (_, tag: string) => {
      return data[tag] ?? '';
    }
  );

  return result;
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
 * Add unsubscribe link in PT-BR before </body>.
 */
export function addUnsubscribeLink(
  html: string,
  emailSendId: string,
  baseUrl: string
): string {
  const unsubscribeHtml = `
<div style="text-align:center;padding:20px 0 10px;font-size:12px;color:#999;">
  <a href="${baseUrl}/api/unsubscribe/${emailSendId}" style="color:#999;text-decoration:underline;">
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
 * Full email preparation pipeline.
 */
export function prepareEmailHtml({
  html,
  mergeData,
  emailSendId,
  baseUrl,
}: {
  html: string;
  mergeData: Record<string, string>;
  emailSendId: string;
  baseUrl: string;
}): string {
  let result = html;

  // 1. Replace merge tags
  result = renderMergeTags(result, mergeData);

  // 2. Add unsubscribe link (before tracking rewrites)
  result = addUnsubscribeLink(result, emailSendId, baseUrl);

  // 3. Rewrite URLs for click tracking
  result = rewriteUrlsForTracking(result, emailSendId, baseUrl);

  // 4. Inject open pixel
  result = injectOpenPixel(result, emailSendId, baseUrl);

  return result;
}
