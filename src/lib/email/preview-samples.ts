// =============================================
// WORDER: Sample data for email preview
// /src/lib/email/preview-samples.ts
//
// Substitui placeholders dinâmicos (WORDER_PRODUCT_BLOCK, WORDER_CART_BLOCK)
// por dados sample para preview no editor/modal.
// =============================================

const SAMPLE_PRODUCTS = [
  {
    title: 'Camiseta Premium',
    image_url: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=300',
    price: 99.90,
    compare_at_price: 149.90,
    url: '#product-1',
  },
  {
    title: 'Moletom Oversized',
    image_url: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=300',
    price: 179.90,
    compare_at_price: null,
    url: '#product-2',
  },
  {
    title: 'Tênis Runner',
    image_url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=300',
    price: 299.90,
    compare_at_price: 399.90,
    url: '#product-3',
  },
  {
    title: 'Mochila Urban',
    image_url: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=300',
    price: 249.90,
    compare_at_price: null,
    url: '#product-4',
  },
  {
    title: 'Relógio Clássico',
    image_url: 'https://images.unsplash.com/photo-1524592094714-0f0654e20314?w=300',
    price: 459.90,
    compare_at_price: 599.90,
    url: '#product-5',
  },
  {
    title: 'Boné Esportivo',
    image_url: 'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=300',
    price: 79.90,
    compare_at_price: null,
    url: '#product-6',
  },
]

function renderProductCard(p: any, opts: {
  showPrice?: boolean
  showComparePrice?: boolean
  showButton?: boolean
  buttonText?: string
}) {
  const img = `<img src="${p.image_url}" alt="${p.title}" width="100%" style="display:block;width:100%;height:auto;max-height:220px;object-fit:cover;border-radius:8px 8px 0 0;" />`
  const name = `<p style="margin:0;font-weight:600;font-size:14px;color:#111827;">${p.title}</p>`
  const priceLine =
    opts.showPrice !== false
      ? `<p style="margin:4px 0 0;">${
          opts.showComparePrice && p.compare_at_price
            ? `<span style="font-size:13px;color:#9CA3AF;text-decoration:line-through;margin-right:6px;">R$ ${p.compare_at_price.toFixed(2)}</span>`
            : ''
        }<span style="font-weight:700;font-size:16px;color:#F97316;">R$ ${p.price.toFixed(2)}</span></p>`
      : ''
  const button =
    opts.showButton !== false
      ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px auto 0;"><tr><td style="background-color:#F97316;border-radius:6px;padding:6px 16px;text-align:center;"><a href="${p.url}" style="color:#fff;font-size:12px;font-weight:600;text-decoration:none;display:block;">${opts.buttonText || 'Comprar'}</a></td></tr></table>`
      : ''
  return `<td width="50%" valign="top" style="vertical-align:top;padding:4px;"><div style="border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;background:#fff;text-align:center;">${img}<div style="padding:8px;">${name}${priceLine}${button}</div></div></td>`
}

/**
 * Substitui WORDER_PRODUCT_BLOCK pelo grid sample.
 */
export function resolveProductPlaceholders(html: string): string {
  return html.replace(
    /<!-- WORDER_PRODUCT_BLOCK:([^:]+):(\d+):(\d+):(true|false):(true|false):(true|false):([^-]+) -->/g,
    (_, _feedType, totalStr, colsStr, showPrice, showComparePrice, showButton, buttonText) => {
      const total = Math.min(Number(totalStr) || 4, SAMPLE_PRODUCTS.length)
      const cols = Math.max(1, Math.min(Number(colsStr) || 2, 4))
      const prods = SAMPLE_PRODUCTS.slice(0, total)
      const rows: string[] = []
      for (let r = 0; r < Math.ceil(prods.length / cols); r++) {
        const rowProds = prods.slice(r * cols, r * cols + cols)
        const cells = rowProds
          .map((p) =>
            renderProductCard(p, {
              showPrice: showPrice === 'true',
              showComparePrice: showComparePrice === 'true',
              showButton: showButton === 'true',
              buttonText: decodeURIComponent(buttonText || 'Comprar').trim(),
            })
          )
          .join('')
        rows.push(`<tr>${cells}</tr>`)
      }
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${rows.join('')}</table>`
    }
  )
}

/**
 * Substitui WORDER_CART_BLOCK:... por sample abandoned cart.
 */
export function resolveCartPlaceholders(html: string): string {
  return html.replace(
    /<!-- WORDER_CART_BLOCK:[^-]+ -->/g,
    () => {
      const items = SAMPLE_PRODUCTS.slice(0, 2)
        .map(
          (p) => `
          <tr>
            <td width="100" style="padding:8px;"><img src="${p.image_url}" alt="${p.title}" width="90" style="display:block;border-radius:8px;" /></td>
            <td style="padding:8px;vertical-align:top;">
              <p style="margin:0;font-weight:600;font-size:15px;color:#111827;">${p.title}</p>
              <p style="margin:2px 0 0;color:#6B7280;font-size:13px;">Quantidade: 1</p>
              <p style="margin:4px 0 0;font-weight:700;color:#F97316;">R$ ${p.price.toFixed(2)}</p>
            </td>
          </tr>`
        )
        .join('')
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #E5E7EB;border-radius:8px;background:#fff;">${items}</table>`
    }
  )
}

/**
 * Aplica todos os resolvers de placeholder para preview.
 */
export function resolvePreviewPlaceholders(html: string, origin?: string): string {
  let out = html
  out = resolveProductPlaceholders(out)
  out = resolveCartPlaceholders(out)
  // countdown: aponta pro endpoint real
  if (origin) {
    out = out.replace(/\{\{countdown_base_url\}\}/g, origin)
  }
  return out
}
