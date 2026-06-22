// =============================================================
// Worder: Text-based email renderer
//
// Converts a Tiptap / ProseMirror JSON document (produced by the
// text-only email editor) into:
//   - email-safe HTML (single-column, 600px, system fonts) that survives
//     Gmail/Apple/Outlook stripping of <style> blocks because every rule
//     is inlined on the element.
//   - a true text/plain alternative derived from the same JSON tree (NOT
//     from stripping the HTML — see SpamAssassin's MIME_HTML_ONLY and
//     Postmark's plain-text guidance).
//
// The output is intentionally minimal: founder-style emails earn their
// engagement by looking like personal mail, so we resist the urge to add
// branding chrome here. Headers/footers (logo, unsubscribe block) are
// composed by prepareEmailHtml() downstream, same path visual emails use.
//
// IMPORTANT: this module is imported by the client-side text editor, so it
// must stay free of server-only imports. It deliberately does NOT import
// from './render' (which pulls in supabase-admin and throws in the
// browser) — the plain-text merge pass below is self-contained.
// =============================================================

/** ProseMirror node shape we accept. Loose typing — the editor may
 *  ship custom node types (variable chips, dividers) we want to
 *  forward without TypeScript ceremony. */
export interface TextDoc {
  type: string;
  content?: TextNode[];
  attrs?: Record<string, any>;
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, any> }>;
}
export type TextNode = TextDoc;

export interface RenderTextEmailOptions {
  /** Optional preheader text — rendered as an invisible preview snippet
   *  that inbox previews use (Gmail, Apple Mail) before the body. */
  preheader?: string;
  /** Container max-width in px. Default 600 — Litmus convention. */
  maxWidth?: number;
  /** Body text color override (default near-black for dark-mode friendliness). */
  textColor?: string;
  /** Page background. Default white. */
  backgroundColor?: string;
}

// System font stack — renders the same in every client without webfonts
// (which Outlook strips and Gmail proxies break). -apple-system FIRST
// inside the family property is safe; the legacy "font shorthand bug"
// only bites when it's the first token in `font:` shorthand syntax.
const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

/**
 * Allow only safe URL schemes in href/src attributes. Blocks
 * `javascript:`, `data:`, `vbscript:` etc. that could execute in the
 * in-app preview iframe. Permits http(s), mailto, tel, anchors,
 * relative paths, and unresolved merge tags ({{...}}).
 */
function safeUrl(raw: string): string {
  const url = String(raw || '').trim();
  if (!url) return '#';
  // Merge tags, relative paths and anchors are fine — they're resolved
  // (or scoped) downstream.
  if (url.startsWith('/') || url.startsWith('#') || url.includes('{{')) {
    return url;
  }
  if (/^(https?:|mailto:|tel:)/i.test(url)) {
    return url;
  }
  // A bare "www.foo.com" or "foo.com/x" with no scheme — treat as https.
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(url)) {
    return `https://${url}`;
  }
  // Anything else (javascript:, data:, vbscript:, unknown scheme) is dropped.
  return '#';
}

/** Wrap a string of inline content with the mark stack. Order matters:
 *  outer marks wrap inner marks so the HTML nests cleanly. */
function applyMarks(
  inner: string,
  marks: Array<{ type: string; attrs?: Record<string, any> }> = []
): string {
  let out = inner;
  // Apply non-link marks first so the link wraps everything visible.
  const links = marks.filter((m) => m.type === 'link');
  const other = marks.filter((m) => m.type !== 'link');
  for (const m of other) {
    switch (m.type) {
      case 'bold':
      case 'strong':
        out = `<strong>${out}</strong>`;
        break;
      case 'italic':
      case 'em':
        out = `<em>${out}</em>`;
        break;
      case 'underline':
        out = `<u>${out}</u>`;
        break;
      case 'strike':
      case 's':
        out = `<s>${out}</s>`;
        break;
      case 'code':
        out = `<code style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#f5f5f5;padding:2px 4px;border-radius:3px;">${out}</code>`;
        break;
      default:
        // Unknown marks pass through — better to drop the mark than the text.
        break;
    }
  }
  for (const m of links) {
    const href = safeUrl(String(m.attrs?.href || '#'));
    // color:inherit lets links pick up the surrounding text color but
    // we still underline so they read as links (default browser style
    // varies wildly between email clients).
    out = `<a href="${escapeAttr(href)}" style="color:#2563eb;text-decoration:underline;" target="_blank" rel="noopener">${out}</a>`;
  }
  return out;
}

/** Render a single inline node (text or variable chip) to HTML. */
function renderInline(node: TextNode): string {
  if (node.type === 'text') {
    return applyMarks(escapeHtml(node.text || ''), node.marks);
  }
  if (node.type === 'mergeTag' || node.type === 'variable') {
    // Atomic chip — emits the merge tag as plain Liquid-ish text that
    // prepareEmailHtml() will resolve downstream. Fallback shorthand
    // `{{tag|fallback}}` matches the existing renderMergeTags syntax.
    const tag = String(node.attrs?.tag || '');
    const fallback = String(node.attrs?.fallback || '');
    if (!tag) return '';
    return fallback ? `{{${tag}|${fallback}}}` : `{{${tag}}}`;
  }
  if (node.type === 'hardBreak') {
    return '<br />';
  }
  // Unknown inline node — render children if any, otherwise empty.
  return renderChildren(node.content);
}

function renderChildren(content: TextNode[] | undefined): string {
  if (!content) return '';
  return content.map(renderInline).join('');
}

/** Map a paragraph's textAlign attr (Tiptap convention) to inline CSS. */
function alignStyle(attrs?: Record<string, any>): string {
  const a = attrs?.textAlign;
  if (a === 'center' || a === 'right' || a === 'justify') {
    return `text-align:${a};`;
  }
  return '';
}

/**
 * Render a listItem's content. A listItem holds block nodes (usually one
 * paragraph, optionally a nested list). We unwrap paragraphs to inline so
 * the bullet sits on the same line as its text — but recurse into nested
 * lists as blocks so multi-level lists keep their <ul>/<ol> structure.
 */
function renderListItem(li: TextNode, textColor: string): string {
  return (li.content || [])
    .map((child) => {
      if (child.type === 'paragraph') {
        return renderChildren(child.content);
      }
      // Nested list (or any other block) — render with the block renderer.
      return renderBlock(child, textColor);
    })
    .join('');
}

/** Render a block-level node. */
function renderBlock(node: TextNode, textColor: string): string {
  switch (node.type) {
    case 'paragraph': {
      const inner = renderChildren(node.content);
      // Empty paragraph still produces vertical breathing room — the
      // editor uses Enter to mean "new paragraph" and dropping empties
      // would collapse spacing in a way users don't expect.
      const content = inner || '&nbsp;';
      return `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${textColor};${alignStyle(node.attrs)}">${content}</p>`;
    }
    case 'heading': {
      const level = Math.min(Math.max(Number(node.attrs?.level) || 2, 1), 4);
      const sizes: Record<number, number> = { 1: 28, 2: 22, 3: 18, 4: 16 };
      const size = sizes[level];
      const marginTop = level === 1 ? 0 : 24;
      const inner = renderChildren(node.content) || '&nbsp;';
      return `<h${level} style="margin:${marginTop}px 0 12px;font-size:${size}px;line-height:1.3;font-weight:700;color:${textColor};${alignStyle(node.attrs)}">${inner}</h${level}>`;
    }
    case 'bulletList': {
      const items = (node.content || [])
        .map((li) => `<li style="margin:0 0 6px;">${renderListItem(li, textColor)}</li>`)
        .join('');
      return `<ul style="margin:0 0 16px;padding-left:24px;font-size:16px;line-height:1.6;color:${textColor};">${items}</ul>`;
    }
    case 'orderedList': {
      const items = (node.content || [])
        .map((li) => `<li style="margin:0 0 6px;">${renderListItem(li, textColor)}</li>`)
        .join('');
      return `<ol style="margin:0 0 16px;padding-left:24px;font-size:16px;line-height:1.6;color:${textColor};">${items}</ol>`;
    }
    case 'listItem': {
      // Standalone listItem (shouldn't happen at block level but be safe).
      return `<li style="margin:0 0 6px;">${renderListItem(node, textColor)}</li>`;
    }
    case 'blockquote': {
      const inner = (node.content || []).map((c) => renderBlock(c, textColor)).join('');
      return `<blockquote style="margin:0 0 16px;padding:8px 16px;border-left:3px solid #e5e7eb;color:#6b7280;font-style:italic;">${inner}</blockquote>`;
    }
    case 'horizontalRule': {
      return `<hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0;" />`;
    }
    case 'image': {
      const rawSrc = String(node.attrs?.src || '');
      const src = safeUrl(rawSrc);
      const alt = String(node.attrs?.alt || '');
      if (!rawSrc || src === '#') return '';
      return `<p style="margin:0 0 16px;"><img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" style="display:block;max-width:100%;height:auto;border:0;" /></p>`;
    }
    case 'codeBlock': {
      // Mostly here so the editor doesn't lose data on round-trip; we
      // never expect product emails to ship code, but if a merchant does
      // it should at least render legibly.
      const inner = (node.content || [])
        .map((n) => escapeHtml(n.text || ''))
        .join('');
      return `<pre style="margin:0 0 16px;padding:12px;background:#f5f5f5;border-radius:6px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;overflow:auto;">${inner}</pre>`;
    }
    case 'doc': {
      // doc at the top level — recurse into children. Shouldn't be a
      // child block but defensive.
      return (node.content || []).map((c) => renderBlock(c, textColor)).join('');
    }
    default: {
      // Unknown block — render children if any, otherwise drop the node.
      const inner = (node.content || []).map((c) => renderBlock(c, textColor)).join('');
      return inner;
    }
  }
}

/**
 * Render a Tiptap JSON document to email-safe HTML.
 *
 * The output is a complete HTML document with `<!DOCTYPE>`, `<head>`
 * (meta viewport, color-scheme), and a centered single-column table.
 * Tables — not div + max-width — because Outlook (Word renderer) still
 * ignores CSS layout primitives.
 */
export function renderTextEmailToHtml(
  doc: TextDoc | null | undefined,
  opts: RenderTextEmailOptions = {}
): string {
  const maxWidth = opts.maxWidth || 600;
  const textColor = opts.textColor || '#111827';
  const backgroundColor = opts.backgroundColor || '#ffffff';
  const preheader = (opts.preheader || '').trim();

  const blocks = (doc?.content || []).map((b) => renderBlock(b, textColor)).join('');

  // Preheader: zero-height, zero-opacity div in the body so inbox
  // preview snippets pick it up but recipients don't see it. The
  // trailing &#847; characters pad the snippet so trailing template
  // text ("View this email in your browser…") doesn't leak in.
  const preheaderHtml = preheader
    ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:transparent;">${escapeHtml(preheader)}${'&#847;'.repeat(80)}</div>`
    : '';

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title></title>
<style>
  /* Bare minimum — most clients strip <style>. Anything semantic ships inline. */
  body { margin:0; padding:0; width:100%; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table { border-collapse:collapse; }
  img { -ms-interpolation-mode:bicubic; }
  a { color:#2563eb; }
  @media only screen and (max-width:${maxWidth}px) {
    .container { width:100% !important; }
    .pad { padding-left:20px !important; padding-right:20px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${backgroundColor};font-family:${FONT_STACK};">
${preheaderHtml}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${backgroundColor};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" class="container" width="${maxWidth}" cellpadding="0" cellspacing="0" border="0" style="width:${maxWidth}px;max-width:100%;background:${backgroundColor};">
        <tr>
          <td class="pad" style="padding:0 32px;font-family:${FONT_STACK};color:${textColor};">
${blocks}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/**
 * Derive a true text/plain alternative from the same Tiptap JSON.
 * Strips marks but preserves links as `text (url)` so subscribers using
 * a text-only client still see destinations.
 */
export function renderTextEmailToPlain(doc: TextDoc | null | undefined): string {
  if (!doc?.content) return '';

  const inlineToText = (node: TextNode): string => {
    if (node.type === 'text') {
      const link = (node.marks || []).find((m) => m.type === 'link');
      const txt = node.text || '';
      if (link?.attrs?.href && link.attrs.href !== txt) {
        return `${txt} (${link.attrs.href})`;
      }
      return txt;
    }
    if (node.type === 'mergeTag' || node.type === 'variable') {
      const tag = String(node.attrs?.tag || '');
      const fallback = String(node.attrs?.fallback || '');
      if (!tag) return '';
      return fallback ? `{{${tag}|${fallback}}}` : `{{${tag}}}`;
    }
    if (node.type === 'hardBreak') return '\n';
    return (node.content || []).map(inlineToText).join('');
  };

  const blockToText = (node: TextNode, depth = 0): string => {
    switch (node.type) {
      case 'paragraph':
        return (node.content || []).map(inlineToText).join('');
      case 'heading': {
        const level = Math.min(Math.max(Number(node.attrs?.level) || 2, 1), 4);
        const inner = (node.content || []).map(inlineToText).join('');
        // h1 underlined with === per markdown convention; smaller headings
        // use an inline prefix so the visual hierarchy survives.
        if (level === 1) return `${inner}\n${'='.repeat(Math.min(inner.length, 60))}`;
        if (level === 2) return `${inner}\n${'-'.repeat(Math.min(inner.length, 60))}`;
        return `${'#'.repeat(level)} ${inner}`;
      }
      case 'bulletList':
        return (node.content || [])
          .map((li) => `${'  '.repeat(depth)}- ${(li.content || []).map((c) => blockToText(c, depth + 1)).join('\n')}`)
          .join('\n');
      case 'orderedList':
        return (node.content || [])
          .map((li, i) => `${'  '.repeat(depth)}${i + 1}. ${(li.content || []).map((c) => blockToText(c, depth + 1)).join('\n')}`)
          .join('\n');
      case 'blockquote':
        return (node.content || [])
          .map((c) => blockToText(c, depth))
          .join('\n\n')
          .split('\n')
          .map((l) => `> ${l}`)
          .join('\n');
      case 'horizontalRule':
        return '\n---\n';
      case 'codeBlock':
        return (node.content || []).map((n) => n.text || '').join('');
      case 'image': {
        const alt = String(node.attrs?.alt || '');
        const src = String(node.attrs?.src || '');
        return alt ? `[${alt}] ${src}` : `[Imagem] ${src}`;
      }
      default:
        return (node.content || []).map((c) => blockToText(c, depth)).join('\n\n');
    }
  };

  return (doc.content || [])
    .map((b) => blockToText(b))
    .filter((s) => s !== '')
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * One-shot: take an email_templates row that uses editor_type='text' and
 * return both the HTML and the plain-text alternative, with merge tags
 * left as literals so prepareEmailHtml() / the send pipeline can replace
 * them per-recipient.
 *
 * Callers that already have rendered HTML stored on the row (every save
 * does this) should prefer that and only fall through to this helper as
 * a safety net.
 */
export function renderTextTemplate(template: {
  design_json?: any;
  design?: any;
  html?: string | null;
  preview_text?: string | null;
}): { html: string; text: string } {
  const doc = (template.design_json || template.design || null) as TextDoc | null;
  const html =
    template.html && template.html.trim().length > 0
      ? template.html
      : renderTextEmailToHtml(doc, { preheader: template.preview_text || undefined });
  const text = renderTextEmailToPlain(doc);
  return { html, text };
}

/**
 * Render the text/plain version with merge tags interpolated for a
 * specific recipient. The HTML half is handled by prepareEmailHtml();
 * this is its plain-text twin so the multipart/alternative MIME has
 * both halves personalized identically.
 */
export function renderPlainWithMergeData(
  plain: string,
  mergeData: Record<string, string>
): string {
  // renderMergeTags HTML-escapes by default — we don't want &amp; in a
  // text/plain body, so we run the same regex with raw replacement.
  // This duplicates ~15 lines from render.ts but keeps the plain path
  // independent of HTML escaping rules.
  if (!plain) return '';
  const now = new Date();
  // Provide date helpers as defaults — don't clobber a value the caller
  // already set for current_date/current_year.
  const dateData: Record<string, string> = {
    current_date: now.toLocaleDateString('pt-BR'),
    current_year: String(now.getFullYear()),
    ...mergeData,
  };
  const resolve = (tag: string, fallback = ''): string => {
    if (tag.startsWith('custom.')) {
      const k = tag.slice(7);
      return dateData[`custom_${k}`] ?? dateData[`custom.${k}`] ?? fallback;
    }
    return dateData[tag] ?? fallback;
  };
  let out = plain.replace(
    /\{\{\s*([a-zA-Z0-9_.\[\]]+)\s*\|\s*([^}]*?)\s*\}\}/g,
    (_, tag: string, fb: string) => resolve(tag, fb)
  );
  out = out.replace(
    /\{\{\s*([a-zA-Z0-9_.\[\]]+)\s*\}\}/g,
    (_, tag: string) => resolve(tag, '')
  );
  return out;
}
