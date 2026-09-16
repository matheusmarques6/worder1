// =============================================================
// A grade de produtos, escrita uma vez só.
//
// Existiam duas. Uma em `render-html.ts`, usada quando os produtos já
// são conhecidos na hora de montar — é a que o editor mostra, e é a
// caprichada: respeita cor, raio, fonte e teto de altura da imagem. A
// outra em `render.ts`, que resolve o feed dinâmico na hora do envio —
// e era laranja fixo, sem teto de altura, sem classe de empilhar no
// celular e com `R$` cravado.
//
// Quer dizer: o e-mail que a pessoa montava e o e-mail que saía eram
// dois. Quem configurasse a altura da imagem, a cor do preço ou o raio
// do cartão via tudo isso no editor e nada disso no envio — e numa loja
// em dólar o preço saía com cifrão errado.
//
// Aqui elas viram uma função. Os dois caminhos chamam esta, então não
// há mais como divergirem.
// =============================================================

import { fitProductImage } from './product-image'

/** Largura útil do corpo do e-mail, usada para estimar a caixa da foto. */
const EMAIL_WIDTH = 600

const LOCALE_BY_CURRENCY: Record<string, string> = {
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

/**
 * Preço no formato da moeda da loja. A grade antiga cravava `R$`, então
 * uma loja em dólar anunciava "R$ 23.51" para um produto de US$ 23,51.
 */
export function formatMoney(value: unknown, currency = 'BRL'): string {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? '0'))
  const safe = Number.isFinite(n) ? n : 0
  const cur = (currency || 'BRL').toUpperCase()
  try {
    return new Intl.NumberFormat(LOCALE_BY_CURRENCY[cur] || 'en-US', {
      style: 'currency',
      currency: cur,
      minimumFractionDigits: 2,
    }).format(safe)
  } catch {
    return `${cur} ${safe.toFixed(2)}`
  }
}

/**
 * Altura da foto no cartão, a partir do teto e da proporção escolhida.
 *
 * O editor já fazia essa conta (retrato mais alto, paisagem mais baixa)
 * e o envio não: quem escolhia "Retrato" via alto na tela e recebia
 * quadrado. A conta mora aqui para os dois usarem a mesma.
 */
export function productImageHeight(
  maxImageHeight: number | undefined,
  imageRatio: 'square' | 'portrait' | 'landscape' | undefined | null
): number {
  const base = maxImageHeight || 300
  if (imageRatio === 'portrait') return Math.round(base * 1.3)
  if (imageRatio === 'landscape') return Math.round(base * 0.65)
  return base
}

export interface ProductGridProduct {
  title?: string | null
  name?: string | null
  price?: unknown
  compare_at_price?: unknown
  compare_price?: unknown
  image_url?: string | null
  images?: Array<{ src?: string | null; url?: string | null }> | null
  url?: string | null
}

export interface ProductGridConfig {
  cols?: number
  font?: string
  currency?: string
  showName?: boolean
  showPrice?: boolean
  showComparePrice?: boolean
  showButton?: boolean
  buttonText?: string
  maxImageHeight?: number
  imageRatio?: 'square' | 'portrait' | 'landscape'
  productBorderRadius?: number
  productBorderColor?: string
  productPadding?: number
  nameFontSize?: number
  nameWeight?: string
  nameColor?: string
  priceFontSize?: number
  priceWeight?: string
  priceColor?: string
  comparePriceColor?: string
  buttonColor?: string
  buttonTextColor?: string
  buttonRadius?: number
  buttonFontSize?: number
  buttonPaddingV?: number
  buttonPaddingH?: number
  buttonFullWidth?: boolean
}

/** Escapa o que vai para dentro de um atributo HTML. */
function attr(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Escapa o que vai para o corpo do HTML. */
function text(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Monta a grade de cartões de produto. `class="worder-product-grid"` é o
 * que a folha de estilo do e-mail usa para empilhar os cartões no
 * celular — a grade dinâmica não tinha, e no telefone os cartões saíam
 * espremidos lado a lado.
 */
export function buildProductGrid(
  products: ProductGridProduct[],
  cfg: ProductGridConfig = {}
): string {
  const list = (products || []).filter(Boolean)
  if (list.length === 0) return ''

  const cols = Math.max(1, Math.min(4, Number(cfg.cols) || 2))
  const font = cfg.font || 'Arial, sans-serif'
  const pad = cfg.productPadding ?? 4
  const innerPad = cfg.productPadding ?? 8
  const radius = cfg.productBorderRadius ?? 8
  const maxImgH = productImageHeight(cfg.maxImageHeight, cfg.imageRatio)
  // A caixa da foto: a largura do cartão, descontado o respiro.
  const cellW = Math.max(80, Math.round(EMAIL_WIDTH / cols) - pad * 2)

  const cellWidthPct = Math.floor(100 / cols)
  const rows: string[] = []

  for (let r = 0; r < Math.ceil(list.length / cols); r++) {
    const slice = list.slice(r * cols, r * cols + cols)
    const cells = slice
      .map((prod) => {
        const title = prod.title || prod.name || ''
        const url = prod.url || '#'
        const rawImg =
          prod.image_url || prod.images?.[0]?.src || prod.images?.[0]?.url || ''

        // Cartão de grade quer altura igual, então a foto preenche e
        // corta. Cortar na CDN (e não com `object-fit`) é o que faz o
        // Outlook obedecer — ele ignora `object-fit`.
        const fitted = fitProductImage(rawImg, {
          width: cellW,
          height: maxImgH,
          crop: true,
        })

        const imgHtml = rawImg
          ? `<img src="${attr(fitted)}" alt="${attr(title)}" width="${cellW}" style="display:block;width:100%;height:${maxImgH}px;max-height:${maxImgH}px;object-fit:cover;border-radius:${radius}px ${radius}px 0 0;border:0;" />`
          : `<div style="height:${maxImgH}px;background:#f3f4f6;"></div>`

        const nameHtml =
          cfg.showName !== false
            ? `<p style="margin:0;font-weight:${cfg.nameWeight || '600'};font-size:${cfg.nameFontSize || 14}px;color:${cfg.nameColor || '#111827'};font-family:${font};">${text(title)}</p>`
            : ''

        const compare = prod.compare_at_price ?? prod.compare_price
        const showCompare =
          cfg.showComparePrice !== false && compare != null && String(compare) !== ''
        const priceHtml =
          cfg.showPrice !== false
            ? `<p style="margin:4px 0 0;">${
                showCompare
                  ? `<span style="font-size:${(cfg.priceFontSize || 16) - 3}px;color:${cfg.comparePriceColor || '#9CA3AF'};text-decoration:line-through;margin-right:6px;">${text(formatMoney(compare, cfg.currency))}</span>`
                  : ''
              }<span style="font-weight:${cfg.priceWeight || '700'};font-size:${cfg.priceFontSize || 16}px;color:${cfg.priceColor || '#18181B'};">${text(formatMoney(prod.price, cfg.currency))}</span></p>`
            : ''

        const btnHtml =
          cfg.showButton !== false
            ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px ${cfg.buttonFullWidth ? '0' : 'auto'} 0;${cfg.buttonFullWidth ? 'width:100%;' : ''}"><tr><td style="background-color:${cfg.buttonColor || '#18181B'};border-radius:${cfg.buttonRadius ?? 6}px;padding:${cfg.buttonPaddingV ?? 6}px ${cfg.buttonPaddingH ?? 16}px;text-align:center;"><a href="${attr(url)}" style="color:${cfg.buttonTextColor || '#FFFFFF'};font-size:${cfg.buttonFontSize || 12}px;font-weight:600;text-decoration:none;display:block;font-family:${font};">${text(cfg.buttonText || 'Comprar')}</a></td></tr></table>`
            : ''

        return `<td width="${cellWidthPct}%" valign="top" class="worder-product-cell" style="vertical-align:top;padding:${pad}px;"><div style="border:1px solid ${cfg.productBorderColor || '#E5E7EB'};border-radius:${radius}px;overflow:hidden;background:#fff;text-align:center;">${imgHtml}<div style="padding:${innerPad}px;">${nameHtml}${priceHtml}${btnHtml}</div></div></td>`
      })
      .join('')

    const faltam = cols - slice.length
    const empty =
      faltam > 0
        ? `<td width="${cellWidthPct}%" class="worder-product-cell" style="padding:${pad}px;"></td>`.repeat(faltam)
        : ''
    rows.push(`<tr>${cells}${empty}</tr>`)
  }

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="worder-product-grid">${rows.join('')}</table>`
}
