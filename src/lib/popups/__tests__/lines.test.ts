import { describe, it, expect } from 'vitest'
import { splitLines } from '../lines'

describe('lista digitada uma por linha', () => {
  it('uma linha vira um item, sem os espaços das bordas', () => {
    expect(splitLines('  primeiro \n segundo')).toEqual(['primeiro', 'segundo'])
  })

  it('linha vazia não vira item — nem no fim, nem no meio', () => {
    expect(splitLines('a\n\n\nb\n')).toEqual(['a', 'b'])
  })

  it('texto vazio vira lista vazia', () => {
    expect(splitLines('')).toEqual([])
    expect(splitLines('   \n  ')).toEqual([])
  })

  it('a transformação recebe a linha já aparada e ainda pode descartá-la', () => {
    expect(splitLines(' A \n b ', (x) => x.toUpperCase())).toEqual(['A', 'B'])
    // Uma transformação que zera a linha (um slug de "###", por exemplo)
    // não pode deixar item em branco na lista.
    expect(splitLines('ok\n###', (x) => x.replace(/#/g, ''))).toEqual(['ok'])
  })
})
