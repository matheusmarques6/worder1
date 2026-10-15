import { describe, expect, it } from 'vitest'
import { findBlock, freshTitle, headings, kbFolders, noteState, outLinks, titleFromQuestion, wordCount, type KbNote } from './kb-model'

const note = (over: Partial<KbNote>): KbNote => ({
  id: 'n', name: 'N', folder: 'geral', kind: 'note', status: 'ready', read_only: false, tags: [], links: [],
  updated_at: null, readers: [], ...over,
})

describe('kb-model', () => {
  it('pastas ganham cores na ordem do protótipo; pasta só de sincronizadas é cinza', () => {
    const f = kbFolders([
      { folder: 'políticas', notes: [note({})] },
      { folder: 'frete', notes: [note({})] },
      { folder: 'sincronizadas', notes: [note({ read_only: true })] },
    ])
    expect(f.map((x) => [x.label, x.tone, x.sync])).toEqual([['Políticas', 'blue', false], ['Frete', 'sky', false], ['Sincronizadas', 'slate', true]])
  })

  it('situação: pronta, processando, sincronizando, erro', () => {
    expect(noteState({ status: 'ready', read_only: false })).toBe('ok')
    expect(noteState({ status: 'pending', read_only: false })).toBe('proc')
    expect(noteState({ status: 'processing', read_only: true })).toBe('sync')
    expect(noteState({ status: 'error', read_only: false })).toBe('err')
  })

  it('texto: palavras, links, títulos e bloco do trecho', () => {
    const md = '# Trocas\n\nO cliente tem **30 dias** para trocar.\n\n## Como\n- Ver [[Prazos|prazos]]\n- [[Frete]]'
    expect(wordCount(md)).toBe(12)
    expect(outLinks(md)).toEqual(['Prazos', 'Frete'])
    expect(headings(md).map((h) => h.text)).toEqual(['Trocas', 'Como'])
    expect(findBlock(md, 'O cliente tem 30 dias para trocar.')).toBe(1)
    expect(findBlock(md, 'nada a ver')).toBeNull()
  })

  it('títulos novos não repetem e lacuna vira título', () => {
    expect(freshTitle('Sem título', ['Sem título', 'Sem título 2'])).toBe('Sem título 3')
    expect(titleFromQuestion('Vocês aceitam PIX parcelado?')).toBe('Aceitam PIX parcelado')
  })
})
