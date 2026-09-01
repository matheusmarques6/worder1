// Fix round 1 (review do item 19): o guard distingue "não foi possível
// resolver o host" de "o host resolve para uma rede interna" — útil no log,
// mas um oráculo de DNS interno se voltar pro lojista (autenticado, mas não
// deveria conseguir mapear hostnames internos testando endpoints). Uma
// mensagem só pro caller; a mensagem específica do guard vai pro log.
//
// Vive fora do route.ts porque rota Next.js não aceita export extra
// (quebrava o `next build`) e o teste precisa importar a constante.
export const GENERIC_REFUSAL_MESSAGE =
  'endpoint recusado: use uma URL pública e válida'
