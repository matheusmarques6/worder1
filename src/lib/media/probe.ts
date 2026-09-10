// =============================================================
// As imagens do e-mail estão carregando?
//
// Uma imagem quebrada num e-mail é a falha mais cara e mais calada que
// existe aqui: o envio "deu certo" (o Resend aceitou, o log diz enviado),
// a tela não muda de cor, e quem recebe vê um retângulo vazio. Foi
// exatamente o que aconteceu com um e-mail que saiu com TODAS as imagens
// do editor quebradas — as do Shopify, que vêm de outro host, apareceram.
//
// A URL das imagens tem duas partes que podem falhar sozinhas:
//
//   host   cdn.worder.email (CDN_IMAGES_DOMAIN), um CNAME para o projeto
//          Supabase. Se o DNS/proxy sair do ar, ou o Host não for
//          reconhecido pela borda do Supabase, TUDO que sai por ele
//          quebra — /render e /object.
//   rota   /storage/v1/render/image/... é o transformador de imagens do
//          Supabase, um recurso PAGO. Onde ele não está habilitado, todo
//          /render responde 400 e todo /object continua servindo.
//
// Sondar os quatro cruzamentos (CDN×Supabase, render×object) separa as
// duas causas sem adivinhação, e cada uma tem conserto diferente:
//
//   render falha nos dois hosts, object funciona → transformador desligado
//     → CDN_IMAGE_TRANSFORM=off no ambiente conserta TODO e-mail sem
//       tocar em imagem nenhuma (as URLs passam a sair em /object).
//   tudo no host da CDN falha e o Supabase responde → a CDN está fora
//     → é DNS/proxy; enquanto não volta, CDN_IMAGES_DOMAIN vazio faz as
//       imagens saírem pelo host do Supabase.
// =============================================================

export type MediaRota = 'cdn_render' | 'cdn_object' | 'supabase_render' | 'supabase_object'

export interface SondaResultado {
  url: string
  ok: boolean
  status: number | null
  erro?: string
}

export type MediaDiagnostico =
  | 'ok'
  | 'transformacao_desligada'
  | 'cdn_fora'
  | 'storage_fora'
  | 'sem_imagens'
  | 'sem_host'

export interface MediaVeredito {
  diagnostico: MediaDiagnostico
  ok: boolean
  titulo: string
  detalhe: string
  acao: string
}

/**
 * A regra, sem rede: o que os quatro resultados querem dizer.
 * Separada para ser testável — é aqui que mora o diagnóstico.
 */
export function classificarMedia(
  sondas: Partial<Record<MediaRota, SondaResultado>>
): MediaVeredito {
  const cdnRender = sondas.cdn_render
  const cdnObject = sondas.cdn_object
  const sbRender = sondas.supabase_render
  const sbObject = sondas.supabase_object

  // Sem nenhuma sonda não há o que dizer.
  if (!cdnRender && !cdnObject && !sbRender && !sbObject) {
    return {
      diagnostico: 'sem_host',
      ok: false,
      titulo: 'Não foi possível verificar as imagens',
      detalhe: 'Nenhum host de imagens está configurado.',
      acao: 'Configure CDN_IMAGES_DOMAIN ou NEXT_PUBLIC_SUPABASE_URL.',
    }
  }

  // O caminho que o e-mail usa hoje é o primeiro que existir.
  const emUso = cdnRender || sbRender || cdnObject || sbObject
  if (emUso?.ok) {
    return {
      diagnostico: 'ok',
      ok: true,
      titulo: 'As imagens do e-mail estão carregando',
      detalhe: `O host respondeu ${emUso.status} para a imagem de teste.`,
      acao: '',
    }
  }

  // A ordem importa: "a CDN inteira está fora" é mais específico do que
  // "o /render falhou". Testar o transformador primeiro daria o
  // diagnóstico errado (e o conserto errado) quando o host está fora.
  const cdnTodaFora = Boolean(cdnRender && !cdnRender.ok && cdnObject && !cdnObject.ok)
  const supabaseFunciona = Boolean(sbObject?.ok || sbRender?.ok)
  if (cdnTodaFora && supabaseFunciona) {
    return {
      diagnostico: 'cdn_fora',
      ok: false,
      titulo: 'As imagens dos e-mails não estão carregando',
      detalhe:
        'O arquivo responde no host do Supabase, mas nada responde pelo host da ' +
        'CDN — é DNS ou proxy da CDN, não a imagem. Todo e-mail com imagem do ' +
        'editor sai quebrado.',
      acao:
        'Verifique o CNAME de CDN_IMAGES_DOMAIN. Enquanto não volta, deixar a ' +
        'variável vazia faz as imagens saírem pelo host do Supabase.',
    }
  }

  // Transformador desligado é render falhando NO MESMO host em que o
  // caminho direto serve — a comparação tem de ser par a par.
  const renderFalhaComObjectOk =
    (Boolean(cdnRender && !cdnRender.ok) && Boolean(cdnObject?.ok)) ||
    (Boolean(sbRender && !sbRender.ok) && Boolean(sbObject?.ok))

  if (renderFalhaComObjectOk) {
    return {
      diagnostico: 'transformacao_desligada',
      ok: false,
      titulo: 'As imagens dos e-mails não estão carregando',
      detalhe:
        'O arquivo existe e responde no caminho direto, mas o transformador de ' +
        'imagens (/render/image, recurso pago do Supabase) recusa a requisição. ' +
        'Todo e-mail com imagem do editor sai quebrado.',
      acao:
        'Habilite Image Transformation no projeto Supabase, ou defina ' +
        'CDN_IMAGE_TRANSFORM=off para as imagens saírem pelo caminho direto.',
    }
  }

  return {
    diagnostico: 'storage_fora',
    ok: false,
    titulo: 'As imagens dos e-mails não estão carregando',
    detalhe: 'Nenhum caminho respondeu para a imagem de teste (CDN nem Supabase).',
    acao: 'Verifique o status do Supabase Storage e o bucket email-images.',
  }
}
