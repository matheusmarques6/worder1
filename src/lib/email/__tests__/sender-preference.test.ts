import { describe, it, expect } from 'vitest'
import { chooseSender, formatSender } from '../sender-preference'

const SHARED = 'loja@worder.email'
const OWN = 'contato@sualoja.com.br'

describe('endereço guardado x identidade da loja', () => {
  it('endereço próprio guardado é escolha do lojista e vence', () => {
    const r = chooseSender({ email: OWN, name: 'Sua Loja' }, { email: 'outro@sualoja.com.br', name: 'X' })
    expect(r).toMatchObject({ email: OWN, name: 'Sua Loja', source: 'stored' })
  })

  it('o do domínio compartilhado é marcador de lugar: perde para o domínio próprio da loja', () => {
    const r = chooseSender({ email: SHARED, name: 'Sua Loja' }, { email: OWN, name: 'Sua Loja' })
    expect(r).toMatchObject({ email: OWN, source: 'live' })
  })

  it('mas segue valendo enquanto a loja também está no compartilhado', () => {
    const r = chooseSender({ email: SHARED, name: 'Sua Loja' }, { email: 'outro@worder.email', name: 'Sua Loja' })
    expect(r).toMatchObject({ email: SHARED, source: 'stored' })
  })

  it('sem endereço guardado, vale o da loja', () => {
    expect(chooseSender({}, { email: OWN, name: 'Sua Loja' })).toMatchObject({ email: OWN, source: 'live' })
    expect(chooseSender({ email: '  ' }, { email: SHARED })).toMatchObject({ email: SHARED, source: 'live' })
  })

  it('sem nenhum dos dois, não inventa endereço', () => {
    expect(chooseSender({}, {})).toEqual({ email: null, name: null, source: 'none' })
  })

  it('o nome do guardado prevalece; o da loja preenche a lacuna', () => {
    expect(chooseSender({ email: OWN }, { email: OWN, name: 'Da Loja' }).name).toBe('Da Loja')
    expect(chooseSender({ email: SHARED, name: 'Guardado' }, { email: OWN, name: 'Da Loja' }).name).toBe('Da Loja')
  })

  it('formata como Nome <email>', () => {
    expect(formatSender({ email: OWN, name: 'Sua Loja' })).toBe('Sua Loja <contato@sualoja.com.br>')
    expect(formatSender({ email: OWN, name: null })).toBe(OWN)
    expect(formatSender({ email: null, name: 'X' })).toBeNull()
  })
})
