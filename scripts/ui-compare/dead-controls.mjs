// Caça "controle que não muda nada": em cada tela da IA (API simulada), clica
// em cada botão, aba e opção e compara o TEXTO do painel onde o controle mora,
// antes e depois. Mudar só a classe (aba "on") sem mudar conteúdo é o sintoma
// da voz no Construtor: parece aba, mas a tela é a mesma.
//   node scripts/ui-compare/dead-controls.mjs [base-url]
// Precisa do app em modo dev com IA_UI_COMPARE=1 (ver README).
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { mock } from './mock-api.mjs'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(DIR, 'out')
const BASE = process.argv[2] || 'http://localhost:3100'

const PAGES = [
  { name: 'agentes', path: '/ai/agentes' },
  { name: 'novo', path: '/ai/agentes/novo' },
  { name: 'conhecimento', path: '/ai/conhecimento' },
  { name: 'atividade', path: '/ai/atividade' },
  { name: 'construtor', path: '/ai/construtor/a-duda' },
  // Barra do topo e painéis da direita (Testar, Histórico, Diagnosticar).
  { name: 'construtor-geral', path: '/ai/construtor/a-duda', scope: 'header' },
  { name: 'construtor-testar', path: '/ai/construtor/a-duda', open: /^Testar/, scope: 'aside:not(.insp)' },
  { name: 'construtor-historico', path: '/ai/construtor/a-duda', open: /Histórico/, scope: 'aside:not(.insp)' },
]
// Blocos do Construtor: cada um abre o inspector, e os controles DENTRO dele
// são testados.
const NODES = ['.w-n.t-agent', '.w-n.t-entry', '.w-n.t-kb', '.w-n.t-tool', '.w-n.t-adapt', '.w-n.t-limits', '.w-n.t-review', '.w-n.t-split', '.w-n.t-transfer', '.w-n.t-send']

async function browser() {
  const pw = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs')
  return pw.chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' })
}

async function open(ctx, p) {
  const page = await ctx.newPage()
  await page.goto(BASE + p, { waitUntil: 'networkidle' }).catch(() => {})
  await page.waitForTimeout(2500)
  return page
}

// Controles visíveis dentro de `scope`, marcados com data-dc para reencontrar.
async function mark(page, scope) {
  return page.evaluate((scope) => {
    const root = document.querySelector(scope) || document.body
    const els = [...root.querySelectorAll('button, [role=tab], a[href="#"], select')]
      .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.disabled })
    return els.map((e, i) => {
      e.setAttribute('data-dc', String(i))
      const box = e.closest('aside, [role=dialog], .card, .kr, .kx, .kb-main, .ac-ch, .cr-r, .cr-l, header') || document.body
      return {
        i, tag: e.tagName.toLowerCase(), role: e.getAttribute('role') || '',
        text: (e.innerText || e.getAttribute('aria-label') || e.title || '').trim().slice(0, 50),
        options: e.tagName === 'SELECT' ? [...e.options].map((o) => o.value) : null,
      }
    })
  }, scope)
}

const panelText = (page, i) => page.evaluate((i) => {
  const e = document.querySelector(`[data-dc="${i}"]`)
  if (!e) return null
  const box = e.closest('aside, [role=dialog], .card, .kr, .kx, .kb-main, .ac-ch, .cr-r, .cr-l, header') || document.body
  // O texto do próprio controle e o de "salvo/não salvo" não contam.
  const clone = box.cloneNode(true)
  clone.querySelectorAll('[data-dc]').forEach((x) => { if (x.getAttribute('data-dc') === String(i)) x.remove() })
  return clone.innerText.replace(/Alterações não salvas|Salvar|Salvo · versão \d+/g, '').trim()
}, i)

async function probe(page, scope, label, findings) {
  const controls = await mark(page, scope)
  for (const c of controls) {
    if (/^(Fechar|Copiar ID|Remover|Voltar|Cancelar)$/i.test(c.text)) continue
    try {
      if (c.options) {
        const before = await panelText(page, c.i)
        for (const v of c.options.slice(0, 4)) {
          await page.selectOption(`[data-dc="${c.i}"]`, v)
          await page.waitForTimeout(250)
        }
        const after = await panelText(page, c.i)
        if (before === after && c.options.length > 1) findings.push({ screen: label, control: `select (${c.options.length} opções)`, text: c.text.split('\n')[0], kind: 'opções sem efeito visível' })
        continue
      }
      const url = page.url()
      const before = await panelText(page, c.i)
      await page.click(`[data-dc="${c.i}"]`, { timeout: 1500 })
      await page.waitForTimeout(400)
      if (page.url() !== url) {
        // Navegou: é um link de verdade. Volta e remarca para seguir.
        await page.goto(url, { waitUntil: 'networkidle' }).catch(() => {})
        await page.waitForTimeout(2000)
        if (!(await page.locator(scope).count())) return
        await mark(page, scope)
        continue
      }
      const after = await panelText(page, c.i)
      if (after === null) continue
      if (before === after) findings.push({ screen: label, control: c.role || c.tag, text: c.text, kind: c.role === 'switch' ? 'interruptor (só muda o estado)' : 'clique sem mudança de conteúdo' })
    } catch { /* controle saiu da tela: segue */ }
  }
}

async function main() {
  const b = await browser()
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
  await ctx.route('**/api/**', async (route) => {
    const r = route.request()
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock(r.url(), r.method()) ?? {}) })
  })
  const findings = []
  for (const pg of PAGES) {
    if (pg.name === 'construtor') {
      for (const n of NODES) {
        const page = await open(ctx, pg.path)
        const node = page.locator(n).first()
        if (!(await node.count())) { findings.push({ screen: `construtor ${n}`, control: '-', text: '', kind: 'bloco não encontrado' }); await page.close(); continue }
        await node.click()
        await page.waitForTimeout(600)
        await probe(page, 'aside.insp', `construtor ${n.replace('.w-n.t-', '')}`, findings)
        await page.close()
      }
      continue
    }
    const page = await open(ctx, pg.path)
    if (pg.open) { await page.getByRole('button', { name: pg.open }).first().click().catch(() => {}); await page.waitForTimeout(900) }
    await probe(page, pg.scope || 'body', pg.name, findings)
    await page.close()
  }
  await b.close()
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(path.join(OUT, 'dead-controls.json'), JSON.stringify(findings, null, 2))
  for (const f of findings) console.log(`${f.screen} | ${f.kind} | ${f.control} | ${f.text}`)
}
main()
