import { describe, expect, it } from 'vitest'
import { faqMarkdown, parseCsv, qaRowsFromCsv } from '../csv'
import { markdownToChunks } from '../../processors/markdown-processor'

describe('parseCsv', () => {
  it('lê aspas, aspas escapadas, quebras dentro de aspas e ponto e vírgula', () => {
    const csv = 'pergunta;resposta\n"Tem frete grátis?";"Sim, acima de R$ 199.\nSul e Sudeste."\n"Aceita ""pix""?";Sim\n'
    expect(parseCsv(csv)).toEqual([
      ['pergunta', 'resposta'],
      ['Tem frete grátis?', 'Sim, acima de R$ 199.\nSul e Sudeste.'],
      ['Aceita "pix"?', 'Sim'],
    ])
  })
})

describe('qaRowsFromCsv', () => {
  it('usa o cabeçalho quando existe e ignora linhas incompletas', () => {
    const rows = qaRowsFromCsv('resposta,pergunta\nSim,Tem loja física?\n,sem resposta\n')
    expect(rows).toEqual([{ question: 'Tem loja física?', answer: 'Sim' }])
  })
  it('sem cabeçalho, usa as duas primeiras colunas', () => {
    expect(qaRowsFromCsv('Qual o prazo?,3 dias úteis')).toEqual([{ question: 'Qual o prazo?', answer: '3 dias úteis' }])
  })
})

describe('faqMarkdown', () => {
  it('gera uma seção com resposta pronta por pergunta, que vira chunk "resposta"', () => {
    const md = faqMarkdown([{ question: 'Tem frete grátis?', answer: 'Sim, acima de 199.' }])
    const chunks = markdownToChunks(md)
    expect(chunks).toHaveLength(1)
    expect(chunks[0].chunk_kind).toBe('resposta')
    expect(chunks[0].content).toContain('Tem frete grátis?')
  })
})
