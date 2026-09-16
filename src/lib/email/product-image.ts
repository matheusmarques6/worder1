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
// A CDN da Shopify aceita isso na própria URL, e é preciso ser exato
// sobre o que ela faz, porque o nome intuitivo engana:
//
//   width + height, SEM crop → o arquivo volta com EXATAMENTE essas
//     medidas, e a diferença de proporção vira barra de preenchimento
//     em volta do produto. Não é um arquivo menor: é a caixa inteira,
//     com o produto dentro. Quem denuncia isso na documentação é o
//     parâmetro `pad_color`, que existe justamente para escolher a cor
//     dessa barra. Visualmente é o `contain` que se quer — produto na
//     proporção certa, centrado na caixa.
//
//   width + height, COM crop → a foto preenche a caixa e o excedente é
//     cortado. É o `cover`.
//
// Na linha de um produto só, `crop` fica de fora: cortar o centro de
// uma foto alta decepa a tampa e a base do frasco. Numa grade de
// cartões, `crop` entra: cartão de altura desigual fica torto, e ali a
// uniformidade vale mais que a borda da foto.
//
// Sobre a cor da barra: em PNG ela sai transparente e assume a cor do
// e-mail sozinha. Em JPG não há transparência, então quem sabe o fundo
// do bloco passa `padColor` e a barra some junto.
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
 * A Shopify quer a cor da barra em hexadecimal sem `#`, de três ou seis
 * dígitos. Qualquer outra coisa (um `rgb()`, um nome de cor, vazio) sai
 * como nada, e a CDN usa o padrão dela — melhor isso do que mandar um
 * parâmetro inválido e receber a imagem sem tratamento nenhum.
 */
function normalizeHex(v: string | null | undefined): string | null {
  const m = String(v || '').trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
  return m ? m[1].toLowerCase() : null
}

/**
 * Devolve a URL da imagem já dimensionada para caber numa caixa de
 * `width` × `height`, quando a origem permite. URL de outra CDN volta
 * intacta — aí quem segura é o CSS.
 */
export function fitProductImage(
  url: string | null | undefined,
  box: { width: number; height: number; crop?: boolean; padColor?: string | null }
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

  parsed.searchParams.set('width', String(w))
  parsed.searchParams.set('height', String(h))
  // Com `crop`, a foto preenche a caixa e o excedente é cortado; sem
  // ele, a caixa é preenchida com barra em volta do produto. Cortar na
  // CDN é o que faz o Outlook obedecer, já que ele ignora `object-fit`.
  if (box.crop) {
    parsed.searchParams.set('crop', 'center')
    // Com corte não sobra barra: o parâmetro de cor só confundiria.
    parsed.searchParams.delete('pad_color')
  } else {
    parsed.searchParams.delete('crop')
    // A cor da barra. Em PNG ela seria transparente e não faria falta,
    // mas em JPG não há transparência: sem isto, uma foto de produto
    // alta ganha duas faixas brancas num e-mail de fundo escuro.
    const pad = normalizeHex(box.padColor)
    if (pad) parsed.searchParams.set('pad_color', pad)
    else parsed.searchParams.delete('pad_color')
  }
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
