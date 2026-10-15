import { describe, expect, it } from 'vitest'
import { extractLinks, extractRules, markdownToChunks, parseMd, stripLinkSyntax } from '../markdown-processor'

// Notas no formato do protótipo (seção 10 da correlação): títulos, listas,
// callouts [!regra] / [!resposta] / [!atencao] e links [[Título]].
const TROCAS = `# Política de trocas

Trocas em até 7 dias após o recebimento, com a etiqueta.

[!regra]
Nunca prometer troca depois de 7 dias sem falar com a equipe.

## Como pedir

- Mandar foto do produto
- Informar o número do pedido

> [!resposta] Prazo
> Você tem 7 dias para pedir a troca. Me manda o número do pedido que eu já abro.

[!atencao] Produtos íntimos
Não têm troca por higiene — ver [[Produtos sem troca]].
`

describe('parseMd', () => {
  it('reconhece títulos, parágrafos, listas e os três callouts', () => {
    const blocks = parseMd(TROCAS)
    expect(blocks.map((b) => b.type)).toEqual([
      'heading', 'paragraph', 'callout', 'heading', 'list', 'callout', 'callout',
    ])
    const callouts = blocks.filter((b) => b.type === 'callout') as any[]
    expect(callouts.map((c) => c.kind)).toEqual(['regra', 'resposta', 'atencao'])
    expect(callouts[1]).toMatchObject({ title: 'Prazo', text: 'Você tem 7 dias para pedir a troca. Me manda o número do pedido que eu já abro.' })
    expect(callouts[2]).toMatchObject({ title: 'Produtos íntimos' })
    expect((blocks[4] as any).items).toEqual(['Mandar foto do produto', 'Informar o número do pedido'])
  })

  it('aceita "atenção" com acento e listas numeradas', () => {
    const blocks = parseMd('[!atenção]\nCuidado.\n\n1. um\n2. dois')
    expect(blocks[0]).toMatchObject({ type: 'callout', kind: 'atencao' })
    expect(blocks[1]).toMatchObject({ type: 'list', ordered: true, items: ['um', 'dois'] })
  })
})

describe('links', () => {
  it('extrai títulos de [[Título]] e [[Título|rótulo]] sem repetir', () => {
    expect(extractLinks('ver [[A]] e [[B|rótulo]] e de novo [[A]]')).toEqual(['A', 'B'])
    expect(stripLinkSyntax('ver [[A]] e [[B|rótulo]]')).toBe('ver A e rótulo')
  })
})

describe('markdownToChunks', () => {
  it('cada callout vira chunk próprio com o seu tipo; o texto corrido fica em chunks de texto', () => {
    const chunks = markdownToChunks(TROCAS)
    const kinds = chunks.map((c) => c.chunk_kind)
    expect(kinds.filter((k) => k !== 'text')).toEqual(['regra', 'resposta', 'atencao'])
    expect(kinds.filter((k) => k === 'text').length).toBeGreaterThanOrEqual(2)
    expect(chunks.map((c) => c.position)).toEqual(chunks.map((_, i) => i))
    const resposta = chunks.find((c) => c.chunk_kind === 'resposta')!
    expect(resposta.content).toMatch(/^Resposta pronta \(Como pedir · Prazo\): Você tem 7 dias/)
    const atencao = chunks.find((c) => c.chunk_kind === 'atencao')!
    expect(atencao.content).not.toContain('[[')
    expect(atencao.metadata.links).toEqual(['Produtos sem troca'])
  })

  it('o texto de uma seção leva o título como contexto', () => {
    const chunks = markdownToChunks('# Frete\n\nEnviamos para todo o Brasil.')
    expect(chunks).toHaveLength(1)
    expect(chunks[0].content).toBe('Frete\n\nEnviamos para todo o Brasil.')
    expect(chunks[0].metadata.heading).toBe('Frete')
  })
})

describe('extractRules', () => {
  it('devolve só os callouts de regra, sem a sintaxe de link', () => {
    expect(extractRules(TROCAS)).toEqual(['Nunca prometer troca depois de 7 dias sem falar com a equipe.'])
  })
})
