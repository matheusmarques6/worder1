// ═══════════════════════════════════════════════════════════════════
// O que sai para o cliente tem o universal em dia.
//
// O e-mail guarda uma cópia do universal e o envio lê essa cópia — a
// campanha pelo design_json, a automação direto pelo html renderizado.
// Salvar o universal reescreve essas cópias, mas quando aquela escrita
// não chega (falha no meio, template restaurado de uma versão antiga),
// é esta resolução que impede o rodapé velho de sair.
//
// Antes ela só olhava `_savedBlockId`. Como todo universal em uso na
// base é uma SEÇÃO, na prática não resolvia nada: dava para editar o
// rodapé e ver a mudança no editor enquanto os e-mails continuavam
// saindo com a versão antiga.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeSupabase } from '@/tests/fake-supabase'

const fake = createFakeSupabase()
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (t: string) => fake.from(t), rpc: (n: string, a: any) => fake.rpc(n, a) },
}))

import { resolveSavedBlocks, hasUniversalContent } from '../render'

const ORG = '425db1ba-99c0-4dbb-9434-27fe9cc03ec6'
const OUTRA_ORG = '99999999-9999-4999-8999-999999999999'
const RODAPE = 'ee420268-4c0d-4559-8e73-af9686f700b4'
const BOTAO = 'f9260591-cff2-4e1a-ae25-61376b6b1e4f'

const txt = (id: string, html: string) => ({ id, type: 'text', props: { contentHtml: `<p>${html}</p>` } })

/** Como o rodapé está HOJE na biblioteca. */
const rodapeAtual = {
  id: 's_lib',
  columns: [{ id: 'c_lib', width: 100, blocks: [txt('b_lib', 'Rodapé de 2026')] }],
  styles: { backgroundColor: '#111111' },
}

/** Como o e-mail guardou o rodapé quando foi salvo — desatualizado. */
function docComRodapeVelho() {
  return {
    version: 2,
    settings: {},
    sections: [
      { id: 's_topo', columns: [{ id: 'c0', width: 100, blocks: [txt('b0', 'Seu pedido saiu')] }], styles: {} },
      {
        id: 's_rodape',
        _savedSectionId: RODAPE,
        _savedSectionName: 'Rod 2',
        columns: [{ id: 'c_velho', width: 100, blocks: [txt('b_velho', 'Rodapé de 2024')] }],
        styles: { backgroundColor: '#ffffff' },
      },
    ],
  }
}

beforeEach(() => {
  fake.reset()
  fake.seed('saved_blocks', [
    { id: RODAPE, organization_id: ORG, name: 'Rod 2', category: 'section', block_json: { _kind: 'section', section: rodapeAtual } },
    { id: BOTAO, organization_id: ORG, name: 'Botão', category: 'custom', block_json: { id: 'b_lib2', type: 'button', props: { text: 'Comprar agora', bgColor: '#000' } } },
  ])
})

describe('hasUniversalContent', () => {
  it('vê a seção universal, não só o bloco', () => {
    expect(hasUniversalContent(docComRodapeVelho())).toBe(true)
  })

  it('vê o bloco universal dentro de uma seção comum', () => {
    const doc = { sections: [{ id: 's', columns: [{ id: 'c', blocks: [{ id: 'b', _savedBlockId: BOTAO }] }] }] }
    expect(hasUniversalContent(doc)).toBe(true)
  })

  it('e-mail sem nada da biblioteca não paga consulta nenhuma', () => {
    const doc = { sections: [{ id: 's', columns: [{ id: 'c', blocks: [txt('b', 'oi')] }] }] }
    expect(hasUniversalContent(doc)).toBe(false)
    expect(hasUniversalContent(null)).toBe(false)
    expect(hasUniversalContent({})).toBe(false)
  })
})

describe('resolveSavedBlocks — seção', () => {
  it('troca a seção inteira pela versão da biblioteca', async () => {
    const out = await resolveSavedBlocks(docComRodapeVelho(), ORG)
    const sec = out.sections[1]
    expect(sec.columns[0].blocks[0].props.contentHtml).toContain('Rodapé de 2026')
    expect(JSON.stringify(out)).not.toContain('Rodapé de 2024')
    // Cor e espaçamento também são da seção — vêm junto.
    expect(sec.styles.backgroundColor).toBe('#111111')
  })

  it('preserva o id da seção neste e-mail e o vínculo', async () => {
    const out = await resolveSavedBlocks(docComRodapeVelho(), ORG)
    const sec = out.sections[1]
    expect(sec.id).toBe('s_rodape')
    expect(sec._savedSectionId).toBe(RODAPE)
    expect(sec._savedSectionName).toBe('Rod 2')
  })

  it('não encosta nas outras seções', async () => {
    const out = await resolveSavedBlocks(docComRodapeVelho(), ORG)
    expect(out.sections[0].columns[0].blocks[0].props.contentHtml).toContain('Seu pedido saiu')
  })

  it('universal de outra organização não é aplicado', async () => {
    const out = await resolveSavedBlocks(docComRodapeVelho(), OUTRA_ORG)
    expect(out.sections[1].columns[0].blocks[0].props.contentHtml).toContain('Rodapé de 2024')
  })

  it('universal apagado da biblioteca deixa o e-mail como está', async () => {
    fake.seed('saved_blocks', [])
    const out = await resolveSavedBlocks(docComRodapeVelho(), ORG)
    expect(out.sections[1].columns[0].blocks[0].props.contentHtml).toContain('Rodapé de 2024')
  })

  it('não estraga o documento original', async () => {
    const doc = docComRodapeVelho()
    await resolveSavedBlocks(doc, ORG)
    expect(doc.sections[1].columns[0].blocks[0].props.contentHtml).toContain('Rodapé de 2024')
  })
})

describe('resolveSavedBlocks — bloco', () => {
  const docComBotao = () => ({
    version: 2,
    settings: {},
    sections: [{
      id: 's', styles: {},
      columns: [{ id: 'c', width: 100, blocks: [
        txt('b_texto', 'Antes do botão'),
        { id: 'b_local', type: 'button', _savedBlockId: BOTAO, _savedBlockName: 'Botão', props: { text: 'Comprar', bgColor: '#fff' } },
      ] }],
    }],
  })

  it('atualiza só o bloco vinculado', async () => {
    const out = await resolveSavedBlocks(docComBotao(), ORG)
    const blocks = out.sections[0].columns[0].blocks
    expect(blocks[1].props.text).toBe('Comprar agora')
    expect(blocks[1].props.bgColor).toBe('#000')
    expect(blocks[1].id).toBe('b_local')
    expect(blocks[1]._savedBlockId).toBe(BOTAO)
    // O vizinho fica intacto.
    expect(blocks[0].props.contentHtml).toContain('Antes do botão')
  })

  it('seção e bloco no mesmo e-mail resolvem juntos', async () => {
    const doc: any = docComRodapeVelho()
    doc.sections[0].columns[0].blocks.push({
      id: 'b_btn', type: 'button', _savedBlockId: BOTAO, props: { text: 'Velho' },
    })
    const out = await resolveSavedBlocks(doc, ORG)
    expect(out.sections[0].columns[0].blocks[1].props.text).toBe('Comprar agora')
    expect(out.sections[1].columns[0].blocks[0].props.contentHtml).toContain('Rodapé de 2026')
  })
})
