// =============================================================
// Encaixar a foto do produto na caixa que o editor desenha.
//
// O bloco de produto do gatilho mostrava a imagem com `width:200px` e
// `height:auto` — sem teto nenhum de altura. Foto de produto costuma
// ser alta e estreita (um frasco, um tubo), então 200px de largura
// viravam 600, 800 pixels de altura, e o e-mail saía com um vidro
// gigante ao lado de duas linhas de texto. O editor, enquanto isso,
// desenhava uma caixa quadrada: o que se via montando não era o que
// chegava na caixa de entrada.
//
// A correção tem duas partes, porque só CSS não resolve. O CSS
// (`max-width`/`max-height`) segura no browser e nos clientes modernos,
// mas o Outlook para Windows renderiza com o motor do Word, que ignora
// `max-*` e obedece o atributo `width` do HTML. Então o arquivo precisa
// chegar já no tamanho certo.
//
// A CDN da Shopify aceita isso na própria URL: com `width` e `height` e
// SEM `crop`, ela devolve a imagem reduzida para caber na caixa,
// mantendo a proporção. É o `contain` feito no servidor deles — e de
// graça, porque a imagem menor também pesa menos no e-mail.
//
// `crop` fica de fora de propósito: cortar o centro de uma foto de
// produto alta decepa a tampa e a base do frasco. Melhor a imagem
// inteira, menor.
// =============================================================

/** Domínios da CDN da Shopify que aceitam redimensionar pela URL. */
const SHOPIFY_CDN = /(^|\.)(cdn\.shopify\.com|shopify\.com|myshopify\.com)$/i

/**
 * Densidade de tela. Servir o dobro deixa a imagem nítida em telas
 * retina sem confiar em upscale do cliente. Dois é o teto útil: acima
 * disso o ganho some e o peso do e-mail cresce.
 */
const DPR = 2

/** Teto do que se pede à CDN, para não puxar um arquivo enorme. */
const MAX_PX = 1600

/**
 * Devolve a URL da imagem já dimensionada para caber numa caixa de
 * `width` × `height`, quando a origem permite. URL de outra CDN volta
 * intacta — aí quem segura é o CSS.
 */
export function fitProductImage(
  url: string | null | undefined,
  box: { width: number; height: number }
): string {
  const src = String(url || '').trim()
  if (!src) return ''

  let parsed: URL
  try {
    parsed = new URL(src)
  } catch {
    // Caminho relativo ou lixo: não dá para reescrever com segurança.
    return src
  }

  if (!SHOPIFY_CDN.test(parsed.hostname)) return src

  const w = Math.min(Math.round(box.width * DPR), MAX_PX)
  const h = Math.min(Math.round(box.height * DPR), MAX_PX)
  if (!(w > 0) || !(h > 0)) return src

  // Sem `crop`: a Shopify encaixa dentro da caixa em vez de cortar.
  parsed.searchParams.set('width', String(w))
  parsed.searchParams.set('height', String(h))
  // O `v=` (versão do arquivo) fica onde está — é o que fura o cache
  // deles quando a foto muda.
  return parsed.toString()
}

/**
 * O CSS que acompanha: encaixa preservando proporção e centraliza o que
 * sobra. Vale para o browser e para os clientes que entendem `max-*`;
 * no Outlook quem resolve é o arquivo já vir no tamanho certo.
 */
export function fitProductImageStyle(box: { width: number | '100%'; height: number }): string {
  const maxW = box.width === '100%' ? '100%' : `${box.width}px`
  return `display:block;max-width:${maxW};max-height:${box.height}px;width:auto;height:auto;margin:0 auto;`
}
