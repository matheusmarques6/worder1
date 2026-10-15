// Comparação visual da aba IA com o protótipo.
//   node scripts/ui-compare/run.mjs proto            fotos do HTML
//   node scripts/ui-compare/run.mjs app [base-url]   fotos do app (API simulada)
//   node scripts/ui-compare/run.mjs report           HTML lado a lado
//   node scripts/ui-compare/run.mjs all [base-url]
// O app precisa estar de pé em modo dev com IA_UI_COMPARE=1 (ver README).
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { SCREENS } from './screens.mjs'
import { mock } from './mock-api.mjs'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(DIR, '../..')
const OUT = path.join(DIR, 'out')
const PROTO = process.env.PROTO_HTML || path.join(ROOT, 'docs/prototipo/Worder_Completo_offline_1.html')
const VIEW = { width: 1440, height: 900 }
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null
const list = SCREENS.filter((s) => !only || only.has(s.name))

async function browser() {
  const pw = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs')
  return pw.chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--allow-file-access-from-files'] })
}

async function shootProto() {
  const b = await browser()
  fs.mkdirSync(path.join(OUT, 'proto'), { recursive: true })
  for (const s of list) {
    // Contexto novo por tela: o protótipo lê a rota só ao carregar e guarda
    // estado no localStorage.
    const ctx = await b.newContext({ viewport: VIEW })
    const p = await ctx.newPage()
    await p.goto('file://' + PROTO + '#' + s.proto.hash)
    await p.waitForTimeout(9000)
    const f = p.frameLocator(s.proto.frame)
    if (s.proto.act) { try { await s.proto.act(f); await p.waitForTimeout(1500) } catch (e) { console.log('proto act falhou', s.name, e.message.slice(0, 80)) } }
    await p.screenshot({ path: path.join(OUT, 'proto', s.name + '.png') })
    console.log('proto ok', s.name)
    await ctx.close()
  }
  await b.close()
}

async function shootApp(base) {
  const b = await browser()
  const ctx = await b.newContext({ viewport: VIEW })
  await ctx.route('**/api/**', async (route) => {
    const r = route.request()
    const d = mock(r.url(), r.method())
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d ?? {}) })
  })
  fs.mkdirSync(path.join(OUT, 'app'), { recursive: true })
  for (const s of list) {
    const p = await ctx.newPage()
    p.on('pageerror', (e) => console.log('erro de página', s.name, e.message.slice(0, 160)))
    await p.goto(base + s.app.path, { waitUntil: 'domcontentloaded', timeout: 240000 })
    await p.waitForTimeout(8000)
    if (s.app.act) { try { await s.app.act(p); await p.waitForTimeout(1500) } catch (e) { console.log('app act falhou', s.name, e.message.slice(0, 80)) } }
    await p.screenshot({ path: path.join(OUT, 'app', s.name + '.png') })
    console.log('app ok', s.name)
    await p.close()
  }
  await b.close()
}

function report() {
  const img = (f) => (fs.existsSync(f) ? 'data:image/png;base64,' + fs.readFileSync(f).toString('base64') : '')
  const rows = list.map((s) => `<h2>${s.name}</h2><div class="g"><figure><figcaption>Protótipo</figcaption><img src="${img(path.join(OUT, 'proto', s.name + '.png'))}"></figure><figure><figcaption>App</figcaption><img src="${img(path.join(OUT, 'app', s.name + '.png'))}"></figure></div>`).join('')
  const html = `<!doctype html><meta charset="utf-8"><title>Comparação IA</title><style>body{font-family:system-ui;margin:20px;background:#f4f5f7}.g{display:grid;grid-template-columns:1fr 1fr;gap:12px}img{width:100%;border:1px solid #ddd;border-radius:6px}figure{margin:0}figcaption{font-weight:700;margin:0 0 4px}</style>${rows}`
  fs.writeFileSync(path.join(OUT, 'comparacao.html'), html)
  console.log('relatório:', path.join(OUT, 'comparacao.html'))
}

const [mode = 'all', base = 'http://localhost:3100'] = process.argv.slice(2)
if (mode === 'proto' || mode === 'all') await shootProto()
if (mode === 'app' || mode === 'all') await shootApp(base)
if (mode === 'report' || mode === 'all') report()
