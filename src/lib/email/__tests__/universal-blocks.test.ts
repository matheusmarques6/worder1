// ═══════════════════════════════════════════════════════════════════
// Conteúdo universal: quem usa, e o que sobra quando ele é apagado.
//
// O caso que estes testes seguram é o do banco real: um rodapé em 23
// e-mails. Errar a conta é ruim, mas apagar o rodapé e deixar 23 e-mails
// com um buraco é pior — e era o que acontecia. A regra agora é a da
// Omnisend: apagar da biblioteca escreve o conteúdo por extenso em cada
// e-mail antes de sumir. Os e-mails continuam iguais; só param de
// receber as próximas alterações.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeSupabase } from '@/tests/fake-supabase'

const fake = createFakeSupabase()
vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: (t: string) => fake.from(t) } }))

import {
  savedKind, savedContent, wrapContent, stripLinks,
  loadUsage, usageCounts, inlineIntoTemplates,
} from '../universal-blocks'

const ORG = '425db1ba-99c0-4dbb-9434-27fe9cc03ec6'
const OUTRA_ORG = '99999999-9999-4999-8999-999999999999'
const RODAPE = 'ee420268-4c0d-4559-8e73-af9686f700b4'
const BOTAO = 'f9260591-cff2-4e1a-ae25-61376b6b1e4f'
const SEM_USO = 'c4cbb1fa-33c6-40ad-8505-8fcde61f7b2e'

const T_CAMPANHA = 'a0000000-0000-4000-8000-000000000001'
const T_FLUXO = 'a0000000-0000-4000-8000-000000000002'
const T_SOLTO = 'a0000000-0000-4000-8000-000000000003'
const T_ALHEIO = 'a0000000-0000-4000-8000-000000000004'

const rodapeContent = {
  id: 's_lib', columns: [{ id: 'c1', width: 100, blocks: [{ id: 'b1', type: 'text', props: { text: 'Rodapé novo' } }] }],
  styles: { backgroundColor: '#000', padding: { top: 0, right: 0, bottom: 0, left: 0 }, stackOnMobile: true },
}

/** Um e-mail com a seção universal dentro, como fica no design_json. */
function emailComRodape(templateId: string) {
  return {
    id: templateId,
    design_json: {
      version: 2,
      settings: {},
      sections: [
        { id: 's_topo', columns: [{ id: 'c0', width: 100, blocks: [{ id: 'b0', type: 'text', props: { text: 'Oi' } }] }], styles: {} },
        {
          id: 's_rodape',
          _savedSectionId: RODAPE,
          _savedSectionName: 'Rod 2',
          columns: [{ id: 'c9', width: 100, blocks: [{ id: 'b9', type: 'text', props: { text: 'Rodapé velho' } }] }],
          styles: { backgroundColor: '#fff' },
        },
      ],
    },
  }
}

function seed() {
  fake.seed('saved_blocks', [
    { id: RODAPE, organization_id: ORG, name: 'Rod 2', category: 'section', block_json: { _kind: 'section', section: rodapeContent } },
    { id: BOTAO, organization_id: ORG, name: 'Botão da marca', category: 'custom', block_json: { id: 'b_lib', type: 'button', props: { text: 'Comprar' } } },
    { id: SEM_USO, organization_id: ORG, name: 'Nunca usado', category: 'section', block_json: { _kind: 'section', section: rodapeContent } },
  ])
  fake.seed('email_templates', [
    { ...emailComRodape(T_CAMPANHA), organization_id: ORG, name: 'Black Friday' },
    { ...emailComRodape(T_FLUXO), organization_id: ORG, name: 'Boas-vindas 1' },
    { ...emailComRodape(T_SOLTO), organization_id: ORG, name: 'Rascunho' },
    { ...emailComRodape(T_ALHEIO), organization_id: OUTRA_ORG, name: 'De outra org' },
  ])
  // A visão do banco: um par (universal, e-mail) por vínculo.
  fake.seed('email_universal_usage', [
    { organization_id: ORG, saved_block_id: RODAPE, template_id: T_CAMPANHA, template_name: 'Black Friday', kind: 'section' },
    { organization_id: ORG, saved_block_id: RODAPE, template_id: T_FLUXO, template_name: 'Boas-vindas 1', kind: 'section' },
    { organization_id: ORG, saved_block_id: RODAPE, template_id: T_SOLTO, template_name: 'Rascunho', kind: 'section' },
    // O mesmo e-mail com o rodapé duas vezes — conta como um e-mail só.
    { organization_id: ORG, saved_block_id: RODAPE, template_id: T_SOLTO, template_name: 'Rascunho', kind: 'section' },
    { organization_id: ORG, saved_block_id: BOTAO, template_id: T_CAMPANHA, template_name: 'Black Friday', kind: 'block' },
    { organization_id: OUTRA_ORG, saved_block_id: RODAPE, template_id: T_ALHEIO, template_name: 'De outra org', kind: 'section' },
  ])
  fake.seed('email_campaigns', [
    { id: 'camp-1', organization_id: ORG, name: 'Black Friday 2026', status: 'sent', template_id: T_CAMPANHA },
  ])
  fake.seed('automations', [
    {
      id: 'auto-1', organization_id: ORG, name: 'Boas-vindas', status: 'active',
      nodes: [
        { id: 'n1', data: { nodeType: 'trigger_subscribe', config: {} } },
        { id: 'n2', data: { nodeType: 'email', config: { templateId: T_FLUXO, emailName: 'E-mail 1' } } },
      ],
    },
  ])
}

beforeEach(() => { fake.reset(); seed() })

describe('forma do que está guardado', () => {
  it('sabe distinguir seção de bloco', () => {
    expect(savedKind({ block_json: { _kind: 'section', section: {} } })).toBe('section')
    expect(savedKind({ block_json: {}, category: 'section' })).toBe('section')
    expect(savedKind({ block_json: { type: 'button' }, category: 'custom' })).toBe('block')
  })

  it('tira e põe o envelope da seção sem perder o conteúdo', () => {
    const sec = { id: 's1', columns: [] }
    expect(savedContent({ block_json: { _kind: 'section', section: sec } })).toEqual(sec)
    expect(wrapContent('section', sec)).toEqual({ _kind: 'section', section: sec })
    expect(wrapContent('block', { type: 'text' })).toEqual({ type: 'text' })
  })

  it('o vínculo nunca entra no corpo guardado, nem nos blocos de dentro', () => {
    const dirty = {
      id: 's1', _savedSectionId: 'x', _savedSectionName: 'y',
      columns: [{ id: 'c', blocks: [{ id: 'b', _savedBlockId: 'z', _savedBlockName: 'w', props: {} }] }],
    }
    const clean: any = stripLinks(dirty)
    expect(clean._savedSectionId).toBeUndefined()
    expect(clean._savedSectionName).toBeUndefined()
    expect(clean.columns[0].blocks[0]._savedBlockId).toBeUndefined()
    expect(clean.columns[0].blocks[0]._savedBlockName).toBeUndefined()
    // E não estraga o original.
    expect((dirty as any)._savedSectionId).toBe('x')
  })
})

describe('onde é usado', () => {
  it('conta e-mails, não vínculos: o mesmo e-mail duas vezes conta uma', async () => {
    const u = await loadUsage(ORG, RODAPE)
    expect(u.count).toBe(3)
    expect(u.emails.map(e => e.templateId).sort()).toEqual([T_CAMPANHA, T_FLUXO, T_SOLTO].sort())
  })

  it('diz de onde vem cada e-mail: campanha, automação ou nenhum', async () => {
    const u = await loadUsage(ORG, RODAPE)
    const byId = new Map(u.emails.map(e => [e.templateId, e]))
    expect(byId.get(T_CAMPANHA)!.origin).toMatchObject({ type: 'campaign', name: 'Black Friday 2026' })
    expect(byId.get(T_FLUXO)!.origin).toMatchObject({ type: 'automation', name: 'Boas-vindas' })
    expect(byId.get(T_SOLTO)!.origin).toBeNull()
    expect(u.campaigns).toBe(1)
    expect(u.automations).toBe(1)
    expect(u.loose).toBe(1)
  })

  it('campanha vem antes de automação, e o solto por último', async () => {
    const u = await loadUsage(ORG, RODAPE)
    expect(u.emails.map(e => e.origin?.type ?? 'none')).toEqual(['campaign', 'automation', 'none'])
  })

  it('universal sem uso devolve zero, sem inventar', async () => {
    const u = await loadUsage(ORG, SEM_USO)
    expect(u.count).toBe(0)
    expect(u.emails).toEqual([])
  })

  it('não enxerga o uso de outra organização', async () => {
    const u = await loadUsage(ORG, RODAPE)
    expect(u.emails.some(e => e.templateId === T_ALHEIO)).toBe(false)
  })

  it('id que não é uuid não vira consulta', async () => {
    expect((await loadUsage(ORG, 'nao-e-uuid')).count).toBe(0)
    expect((await loadUsage('', RODAPE)).count).toBe(0)
  })

  it('a contagem da biblioteca inteira sai numa consulta', async () => {
    const counts = await usageCounts(ORG)
    // Aqui os vínculos contam, não os e-mails: é o selo da lista.
    expect(counts[RODAPE]).toBe(4)
    expect(counts[BOTAO]).toBe(1)
    expect(counts[SEM_USO]).toBeUndefined()
  })
})

describe('apagar embute o conteúdo em vez de deixar buraco', () => {
  it('escreve a seção por extenso em cada e-mail e solta o vínculo', async () => {
    const row = fake.tables['saved_blocks'].find(r => r.id === RODAPE)!
    const escritos = await inlineIntoTemplates(ORG, RODAPE, row as any)
    expect(escritos).toBe(3)

    for (const id of [T_CAMPANHA, T_FLUXO, T_SOLTO]) {
      const t = fake.tables['email_templates'].find(r => r.id === id)!
      const sec = t.design_json.sections[1]
      expect(sec._savedSectionId).toBeUndefined()
      expect(sec._savedSectionName).toBeUndefined()
      // O conteúdo é o da biblioteca, não o snapshot velho do e-mail.
      expect(sec.columns[0].blocks[0].props.text).toBe('Rodapé novo')
      // E o id da seção neste e-mail é preservado.
      expect(sec.id).toBe('s_rodape')
    }
  })

  it('não encosta em e-mail de outra organização', async () => {
    const row = fake.tables['saved_blocks'].find(r => r.id === RODAPE)!
    await inlineIntoTemplates(ORG, RODAPE, row as any)
    const alheio = fake.tables['email_templates'].find(r => r.id === T_ALHEIO)!
    expect(alheio.design_json.sections[1]._savedSectionId).toBe(RODAPE)
  })

  it('as outras seções do e-mail ficam intactas', async () => {
    const row = fake.tables['saved_blocks'].find(r => r.id === RODAPE)!
    await inlineIntoTemplates(ORG, RODAPE, row as any)
    const t = fake.tables['email_templates'].find(r => r.id === T_CAMPANHA)!
    expect(t.design_json.sections[0].columns[0].blocks[0].props.text).toBe('Oi')
  })

  it('universal sem uso não escreve em ninguém', async () => {
    const row = fake.tables['saved_blocks'].find(r => r.id === SEM_USO)!
    expect(await inlineIntoTemplates(ORG, SEM_USO, row as any)).toBe(0)
  })

  it('bloco universal: troca só o bloco, não a seção que o contém', async () => {
    fake.seed('email_universal_usage', [
      { organization_id: ORG, saved_block_id: BOTAO, template_id: T_CAMPANHA, template_name: 'Black Friday', kind: 'block' },
    ])
    // O e-mail passa a ter o botão vinculado dentro da primeira seção.
    const t = fake.tables['email_templates'].find(r => r.id === T_CAMPANHA)!
    t.design_json.sections[0].columns[0].blocks.push({
      id: 'b_local', type: 'button', _savedBlockId: BOTAO, _savedBlockName: 'Botão da marca', props: { text: 'Antigo' },
    })

    const row = fake.tables['saved_blocks'].find(r => r.id === BOTAO)!
    expect(await inlineIntoTemplates(ORG, BOTAO, row as any)).toBe(1)

    const depois = fake.tables['email_templates'].find(r => r.id === T_CAMPANHA)!
    const blocos = depois.design_json.sections[0].columns[0].blocks
    const botao = blocos.find((b: any) => b.id === 'b_local')
    expect(botao.props.text).toBe('Comprar')
    expect(botao._savedBlockId).toBeUndefined()
    // A seção segue sendo seção, e o texto vizinho não mudou.
    expect(blocos[0].props.text).toBe('Oi')
  })
})
