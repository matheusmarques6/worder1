import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'

const script = fileURLToPath(new URL('./ai-e2e-preflight.mjs', import.meta.url))
const valid = {
  AI_E2E_APP_URL: 'https://candidate.example.test',
  AI_E2E_RUNTIME_URL: 'https://runtime.example.test',
  AI_E2E_SUPABASE_URL: 'https://staging-project.supabase.co',
  AI_E2E_EMAIL: 'merchant@example.test', AI_E2E_PASSWORD: 'secret-must-not-be-printed',
  AI_E2E_ACCOUNT_ID: 'test-account', AI_E2E_RECIPIENT_PHONE: '5511999990000',
  AI_E2E_ORGANIZATION_ID: 'test-org', AI_E2E_STORE_ID: 'test-store',
  AI_E2E_SUPABASE_SERVICE_ROLE_KEY: 'service-secret-must-not-be-printed',
  AI_E2E_META_APP_SECRET: 'meta-secret-must-not-be-printed',
  AI_E2E_COMMIT_SHA: 'a'.repeat(40),
  GITHUB_SHA: 'a'.repeat(40),
}
function run(overrides = {}) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('AI_E2E_')))
  return spawnSync(process.execPath, [script, '--configuration-only'], { encoding: 'utf8', env: { ...env, ...overrides } })
}

test('homologation refuses missing configuration and only names missing variables', () => {
  const result = run()
  assert.equal(result.status, 1)
  assert.match(result.stderr, /AI_E2E_APP_URL/)
  assert.match(result.stderr, /AI_E2E_SUPABASE_SERVICE_ROLE_KEY/)
})
test('a complete staging configuration passes validation without contacting any service', () => {
  const result = run(valid)
  assert.equal(result.status, 0, result.stderr)
  assert.doesNotMatch(result.stdout + result.stderr, /secret-must-not-be-printed/)
})
test('known production Supabase project is refused even with complete credentials', () => {
  const result = run({ ...valid, AI_E2E_SUPABASE_URL: 'https://rqpmoavktzvxfcfsdkcc.supabase.co' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /production|produção/i)
  assert.doesNotMatch(result.stderr, /secret-must-not-be-printed/)
})
for (const url of ['not-a-url', 'file:///C:/test', 'https://username:password@example.test', 'https://example.test/path?secret=value']) {
  test(`invalid/credential-bearing app URL is refused: ${url.split(':')[0]}`, () => {
    const result = run({ ...valid, AI_E2E_APP_URL: url })
    assert.equal(result.status, 1)
    assert.doesNotMatch(result.stderr, /password@example|secret=value/)
  })
}
test('a release requires a complete commit SHA', () => {
  assert.equal(run({ ...valid, AI_E2E_COMMIT_SHA: 'main' }).status, 1)
})
test('a different workflow commit cannot borrow staging evidence', () => {
  assert.equal(run({ ...valid, GITHUB_SHA: 'b'.repeat(40) }).status, 1)
})

async function healthRun(app, runtime, overrides = {}) {
  const server = createServer((request, response) => {
    response.setHeader('content-type', 'application/json')
    const value = request.url === '/api/health' ? app : runtime
    response.end(JSON.stringify(typeof value === 'function' ? value() : value))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const origin = `http://127.0.0.1:${server.address().port}`
    return await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [script], { env: { ...process.env, ...valid, AI_E2E_WAIT_SECONDS: '0', AI_E2E_APP_URL: origin, AI_E2E_RUNTIME_URL: origin, ...overrides } })
      let stdout = '', stderr = ''
      child.stdout.on('data', data => { stdout += data })
      child.stderr.on('data', data => { stderr += data })
      child.on('error', reject)
      child.on('close', status => resolve({ status, stdout, stderr }))
    })
  } finally { await new Promise(resolve => server.close(resolve)) }
}
const app = { ok: true, commit: valid.AI_E2E_COMMIT_SHA, environment: 'preview' }
const runtime = { status: 'ok', commit: valid.AI_E2E_COMMIT_SHA, environment: 'staging' }

test('candidate readiness waits for asynchronous staging to report the new SHA', async () => {
  let attempts = 0
  const result = await healthRun(() => ++attempts === 1 ? { ...app, commit: 'b'.repeat(40) } : app, runtime, { AI_E2E_WAIT_SECONDS: '2' })
  assert.equal(result.status, 0, result.stderr)
  assert.ok(attempts > 1)
})

test('healthy staging services at the candidate SHA pass the real network preflight', async () => {
  const result = await healthRun(app, runtime)
  assert.equal(result.status, 0, result.stderr)
})
for (const [label, candidateApp, candidateRuntime] of [
  ['old app revision', { ...app, commit: 'b'.repeat(40) }, runtime],
  ['old runtime revision', app, { ...runtime, commit: 'b'.repeat(40) }],
  ['unhealthy runtime', app, { ...runtime, status: 'stale' }],
  ['production app', { ...app, environment: 'production' }, runtime],
  ['missing runtime environment', app, { ...runtime, environment: null }],
  ['unhealthy app', { ...app, ok: false }, runtime],
]) {
  test(`network preflight refuses ${label}`, async () => {
    const result = await healthRun(candidateApp, candidateRuntime)
    assert.equal(result.status, 1)
    assert.doesNotMatch(result.stderr, /secret-must-not-be-printed/)
  })
}
