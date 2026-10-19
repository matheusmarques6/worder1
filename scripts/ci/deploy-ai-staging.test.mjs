import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deployStaging } from './deploy-ai-staging.mjs'

const env = { AI_E2E_VERCEL_TOKEN: 'secret-v', AI_E2E_VERCEL_PROJECT_ID: 'prj_qa', AI_E2E_VERCEL_TEAM_ID: 'team_qa',
  AI_E2E_RENDER_API_KEY: 'secret-r', AI_E2E_RENDER_SERVICE_ID: 'srv-qa', AI_E2E_COMMIT_SHA: 'a'.repeat(40), GITHUB_REPOSITORY: 'owner/repo' }
function provider(overrides = {}) {
  const calls = []
  const responses = { project: { id: 'prj_qa', name: 'worder-qa' }, service: { name: 'worder-agents-runtime-qa', autoDeploy: 'no' },
    render: { id: 'dep-qa' }, vercel: { id: 'dpl-qa', url: 'worder-qa-unique.vercel.app', target: null }, ...overrides }
  return { calls, request: async (url, options) => {
    calls.push({ url, ...options, body: options.body && JSON.parse(options.body) })
    const key = url.includes('/projects/') ? 'project' : url.includes('api.vercel.com') ? 'vercel' : options.method === 'POST' ? 'render' : 'service'
    return { ok: true, json: async () => responses[key] }
  } }
}

test('candidate uses exact SHA on both providers and returns its unique preview URL', async () => {
  const mock = provider()
  const result = await deployStaging(env, mock.request)
  assert.equal(result.appUrl, 'https://worder-qa-unique.vercel.app')
  const writes = mock.calls.filter(call => call.method === 'POST')
  assert.deepEqual(writes[0].body, { commitId: env.AI_E2E_COMMIT_SHA, clearCache: 'do_not_clear' })
  assert.deepEqual(writes[1].body.gitSource, { type: 'github', org: 'owner', repo: 'repo', ref: env.AI_E2E_COMMIT_SHA, sha: env.AI_E2E_COMMIT_SHA })
  assert.equal(Object.hasOwn(writes[1].body, 'target'), false)
})
for (const [name, values, responses] of [
  ['missing configuration', {}, {}],
  ['known production project', { ...env, AI_E2E_VERCEL_PROJECT_ID: 'prj_qipR5dC2AayNrOMp8N2i9Or0mCMi' }, {}],
  ['old workflow revision', { ...env, GITHUB_SHA: 'b'.repeat(40) }, {}],
  ['wrong Vercel service', env, { project: { name: 'worder1' } }],
  ['wrong Render service', env, { service: { name: 'worder-agents-runtime', autoDeploy: 'no' } }],
  ['uncontrolled Render auto-deploy', env, { service: { name: 'worder-agents-runtime-qa', autoDeploy: 'yes' } }],
]) {
  test(`staging refuses ${name} before provider mutations`, async () => {
    const mock = provider(responses)
    await assert.rejects(deployStaging(values, mock.request))
    assert.equal(mock.calls.filter(call => call.method === 'POST').length, 0)
  })
}
test('a provider cannot accidentally return a production deployment as evidence', async () => {
  const mock = provider({ vercel: { id: 'prod', url: 'worder.vercel.app', target: 'production' } })
  await assert.rejects(deployStaging(env, mock.request), /preview/)
})
