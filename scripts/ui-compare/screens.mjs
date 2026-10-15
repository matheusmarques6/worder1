// Telas comparadas. `app`: rota do Worder (API simulada). `proto`: rota do
// HTML do protótipo (docs/prototipo) e o iframe onde a tela vive.
// `act` recebe a página (app) ou o frame (proto) para abrir painéis.
export const SCREENS = [
  { name: 'agentes', app: { path: '/ai/agentes' }, proto: { hash: 'ia-agentes', frame: '.ia-frame' } },
  { name: 'novo', app: { path: '/ai/agentes/novo' },
    proto: { hash: 'ia-agentes', frame: '.ia-frame', act: async (f) => { await f.locator('a.btn.pri').first().click() } } },
  { name: 'construtor', app: { path: '/ai/construtor/a-duda' }, proto: { hash: 'ia-builder', frame: '.ia-full' } },
  { name: 'construtor-inspector',
    app: { path: '/ai/construtor/a-duda', act: async (p) => { await p.locator('.w-n.t-agent').first().click() } },
    proto: { hash: 'ia-builder', frame: '.ia-full', act: async (f) => { await f.locator('.w-n.t-agent').first().click() } } },
  { name: 'construtor-diagnostico',
    app: { path: '/ai/construtor/a-duda', act: async (p) => { await p.getByRole('button', { name: /Diagnosticar/ }).first().click() } },
    proto: { hash: 'ia-builder', frame: '.ia-full', act: async (f) => { await f.getByRole('button', { name: /Diagnosticar/ }).first().click() } } },
  { name: 'construtor-testar',
    app: { path: '/ai/construtor/a-duda', act: async (p) => { await p.getByRole('button', { name: /^Testar/ }).first().click() } },
    proto: { hash: 'ia-builder', frame: '.ia-full', act: async (f) => { await f.getByRole('button', { name: /^Testar/ }).first().click() } } },
  { name: 'conhecimento', app: { path: '/ai/conhecimento' }, proto: { hash: 'ia-conhecimento', frame: '.ia-full' } },
  { name: 'atividade', app: { path: '/ai/atividade' }, proto: { hash: 'ia-atividade', frame: '.ia-frame' } },
]
