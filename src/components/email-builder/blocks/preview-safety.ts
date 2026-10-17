import sanitizeHtml from 'sanitize-html'

// This policy protects the panel DOM, not the exported email. Keep arbitrary
// email HTML in a sandbox; only this small rich-text vocabulary may render here.
export function sanitizeRichText(value: unknown): string {
  return sanitizeHtml(typeof value === 'string' ? value : '', {
    allowedTags: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del',
      'h1', 'h2', 'h3', 'h4', 'ol', 'ul', 'li', 'blockquote', 'pre',
      'code', 'span', 'div', 'a', 'img', 'hr', 'sub', 'sup',
    ],
    allowedAttributes: {
      '*': ['style'],
      a: ['href', 'title', 'rel', { name: 'target', values: ['_blank', '_self'] }],
      img: ['src', 'alt', 'width', 'height'],
      ol: ['start'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, rel: 'noopener noreferrer' } }),
    },
    allowedStyles: {
      '*': {
        'text-align': [/^(left|center|right|justify|start|end)$/],
        color: [/^#[\da-f]{3,8}$/i, /^[a-z]+$/i, /^rgba?\([\d\s.,%]+\)$/i],
        'background-color': [/^#[\da-f]{3,8}$/i, /^[a-z]+$/i, /^rgba?\([\d\s.,%]+\)$/i],
        'font-size': [/^\d+(\.\d+)?(px|em|rem|%)$/],
        'font-family': [/^[\w\s,'"-]+$/],
        'font-weight': [/^(normal|bold|bolder|lighter|[1-9]00)$/],
        'font-style': [/^(normal|italic|oblique)$/],
        'text-decoration': [/^(none|underline|line-through|overline)$/],
        'line-height': [/^\d+(\.\d+)?(px|em|rem|%)?$/],
      },
    },
  })
}

export function previewTextAlign(value: unknown): string {
  return typeof value === 'string' && /^(left|center|right|justify|start|end)$/.test(value) ? value : 'left'
}
