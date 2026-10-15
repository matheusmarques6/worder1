import { describe, expect, it } from 'vitest'
import { appendAnswer, backlinks, buildGraph, buildTree, noteFromGap, renameLinks, usageByDay } from '../notes'
import { markdownToChunks } from '../../processors/markdown-processor'

describe('buildTree', () => {
  it('agrupa por pasta com "geral" primeiro e notas por nome', () => {
    const tree = buildTree(
      [
        { id: '1', name: 'Trocas', folder: 'politicas', kind: 'note', status: 'ready' },
        { id: '2', name: 'Frete', folder: null, kind: 'note', status: 'ready' },
        { id: '3', name: 'Devolução', folder: 'politicas', kind: 'note', status: 'ready' },
      ],
      new Map([['1', ['agent-a']]]),
    )
    expect(tree.map((f) => f.folder)).toEqual(['geral', 'politicas'])
    expect(tree[1].notes.map((n) => n.name)).toEqual(['Devolução', 'Trocas'])
    expect(tree[1].notes[1].readers).toEqual(['agent-a'])
  })
})

describe('renameLinks', () => {
  it('reescreve [[Antigo]] e [[Antigo|rótulo]] sem tocar em outros títulos', () => {
    const body = 'ver [[Política de trocas]], [[política de trocas|aqui]] e [[Frete]]'
    expect(renameLinks(body, 'Política de trocas', 'Trocas e devoluções')).toBe(
      'ver [[Trocas e devoluções]], [[Trocas e devoluções|aqui]] e [[Frete]]',
    )
  })
})

describe('appendAnswer / noteFromGap', () => {
  it('acrescenta uma seção com resposta pronta que o parser reconhece', () => {
    const body = appendAnswer('# FAQ\n\nTexto.', 'Aceita pix?', 'Sim, com 5% de desconto.')
    const chunks = markdownToChunks(body)
    expect(chunks.find((c) => c.chunk_kind === 'resposta')?.content).toContain('Sim, com 5% de desconto.')
    expect(noteFromGap('Tem loja física?', 'Não, só online.')).toMatch(/^# Tem loja física\?/)
  })
})

describe('buildGraph', () => {
  it('liga notas por título, agentes às notas que leem e lacunas aos agentes', () => {
    const graph = buildGraph({
      notes: [
        { id: 'n1', name: 'Trocas', folder: 'geral', links: ['Frete', 'Inexistente'] },
        { id: 'n2', name: 'Frete', folder: 'geral', links: [], body_markdown: 'ver [[trocas]]' },
      ],
      readers: [{ source_id: 'n1', agent_id: 'a1' }, { source_id: 'n9', agent_id: 'a1' }],
      agents: [{ id: 'a1', name: 'Duda' }],
      gaps: [{ id: 'g1', question: 'Tem pix?', agent_ids: ['a1', 'a-alheio'] }],
    })
    expect(graph.edges).toEqual([
      { from: 'n1', to: 'n2', type: 'link' },
      { from: 'n2', to: 'n1', type: 'link' },
      { from: 'a1', to: 'n1', type: 'reads' },
      { from: 'g1', to: 'a1', type: 'gap' },
    ])
    expect(graph.nodes.map((n) => n.type)).toEqual(['note', 'note', 'agent', 'gap'])
  })
})

describe('backlinks', () => {
  it('acha quem aponta para o título', () => {
    expect(backlinks('frete', [{ id: '1', name: 'Trocas', links: ['Frete'] }, { id: '2', name: 'X', links: [] }]))
      .toEqual([{ id: '1', name: 'Trocas' }])
  })
})

describe('usageByDay', () => {
  it('conta por dia as buscas que devolveram a nota', () => {
    const now = new Date('2026-10-15T12:00:00Z')
    const hit = (day: string, conv: string) => ({
      created_at: `2026-10-${day}T10:00:00Z`, conversation_id: conv,
      output: { chunks: [{ source_id: 's1' }] },
    })
    const usage = usageByDay(
      [hit('15', 'c1'), hit('15', 'c2'), hit('09', 'c3'), hit('01', 'c4'),
       { created_at: '2026-10-14T10:00:00Z', output: { chunks: [{ source_id: 'outra' }] } }],
      's1', now,
    )
    expect(usage.series).toEqual([1, 0, 0, 0, 0, 0, 2])
    expect(usage.total).toBe(3)
    expect(usage.conversations.sort()).toEqual(['c1', 'c2', 'c3'])
  })
})
