// =============================================
// Lista de itens digitada uma por linha.
//
// Mora aqui, e não na página do editor, por dois motivos. O primeiro é do
// Next: um arquivo de página só pode exportar `default` e um punhado de
// campos reservados — qualquer outro `export` derruba o build inteiro
// ("splitLines is not a valid Page export field"), e o typecheck não vê.
// O segundo é que a regra tem sutileza suficiente para merecer teste.
// =============================================

/**
 * Quebra o texto cru do textarea na lista final: uma linha por item, sem
 * espaço nas bordas e sem linha vazia.
 *
 * O campo guarda o texto cru enquanto a pessoa digita — se guardasse só o
 * resultado, "a\n" viraria ['a'], o React devolveria "a" e o Enter que ela
 * acabou de dar sumiria debaixo do cursor.
 */
export function splitLines(v: string, transform?: (s: string) => string): string[] {
  return v.split('\n').map((x) => (transform ? transform(x.trim()) : x.trim())).filter(Boolean)
}
