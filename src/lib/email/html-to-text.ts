// =============================================
// HTML → plain-text fallback for email sends.
//
// Sending an HTML-only email (no text/plain part) is one of the strongest
// spam signals there is — Gmail/Outlook/SpamAssassin all penalize it, and
// mail-tester docks a full point. Visual-editor templates never carry a
// plain-text version, so both send paths (campaign send-batch + automation
// send-campaign-email) shipped HTML-only. This converts the final rendered
// HTML into a readable text/plain alternative so every send is
// multipart/alternative.
//
// Not a full HTML parser (email HTML is table soup); a pragmatic stripper
// that preserves link URLs and block breaks, which is what plain-text
// readers and spam filters want.
// =============================================

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;|&#x27;/gi, "'")
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&middot;/gi, '·')
    .replace(/&hellip;/gi, '…')
    .replace(/&#(\d+);/g, (_, n) => {
      try { return String.fromCodePoint(parseInt(n, 10)); } catch { return ''; }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
      try { return String.fromCodePoint(parseInt(n, 16)); } catch { return ''; }
    });
}

export function htmlToPlainText(html: string): string {
  if (!html) return '';
  let t = html;

  // Drop non-content elements entirely (incl. their inner text).
  t = t.replace(/<!--[\s\S]*?-->/g, '');
  t = t.replace(/<style[\s\S]*?<\/style>/gi, '');
  t = t.replace(/<script[\s\S]*?<\/script>/gi, '');
  t = t.replace(/<head[\s\S]*?<\/head>/gi, '');

  // Preserve link destinations: "<a href="url">label</a>" → "label (url)".
  // Skip when the label already equals the url (avoids "url (url)") and when
  // the href is a tracking/merge placeholder.
  t = t.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) => {
    const cleanLabel = label.replace(/<[^>]+>/g, '').trim();
    const cleanHref = String(href).trim();
    if (!cleanHref || cleanHref.startsWith('#') || cleanHref.startsWith('{{')) return cleanLabel;
    if (!cleanLabel) return cleanHref;
    if (cleanLabel === cleanHref) return cleanHref;
    return `${cleanLabel} (${cleanHref})`;
  });

  // Block-level tags → newlines so structure survives.
  t = t.replace(/<\/(p|div|tr|table|h[1-6]|li|ul|ol|section|header|footer|blockquote)>/gi, '\n');
  t = t.replace(/<br\s*\/?>/gi, '\n');
  t = t.replace(/<\/td>/gi, ' ');
  t = t.replace(/<li[^>]*>/gi, '• ');

  // Strip every remaining tag.
  t = t.replace(/<[^>]+>/g, '');

  t = decodeEntities(t);

  // Collapse whitespace: trim each line, drop empties beyond a single blank,
  // and cap runs of blank lines to keep it tidy.
  t = t
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return t;
}
