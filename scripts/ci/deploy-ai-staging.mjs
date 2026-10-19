import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// Only existing, separately provisioned QA services. Never creates accounts or
// promotes production. The workflow holds the shared staging lock throughout.
export async function deployStaging(env, request = fetch) {
  const required = ['AI_E2E_VERCEL_TOKEN', 'AI_E2E_VERCEL_PROJECT_ID', 'AI_E2E_VERCEL_TEAM_ID',
    'AI_E2E_RENDER_API_KEY', 'AI_E2E_RENDER_SERVICE_ID', 'AI_E2E_COMMIT_SHA', 'GITHUB_REPOSITORY']
  const missing = required.filter(name => !env[name]?.trim())
  if (missing.length) throw new Error(`Staging deploy blocked; missing: ${missing.join(', ')}`)
  const sha = env.AI_E2E_COMMIT_SHA
  if (!/^[a-f0-9]{40}$/.test(sha) || (env.GITHUB_SHA && sha !== env.GITHUB_SHA)) throw new Error('Invalid candidate commit')
  if (env.AI_E2E_VERCEL_PROJECT_ID === 'prj_qipR5dC2AayNrOMp8N2i9Or0mCMi') throw new Error('Production project forbidden')
  const [owner, repo, extra] = env.GITHUB_REPOSITORY.split('/')
  if (!owner || !repo || extra) throw new Error('Invalid Git repository')
  async function call(url, token, body) {
    const response = await request(url, { method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error(`Staging provider request failed (${response.status})`)
    return response.json()
  }
  const team = encodeURIComponent(env.AI_E2E_VERCEL_TEAM_ID)
  const project = await call(`https://api.vercel.com/v9/projects/${encodeURIComponent(env.AI_E2E_VERCEL_PROJECT_ID)}?teamId=${team}`, env.AI_E2E_VERCEL_TOKEN)
  const serviceUrl = `https://api.render.com/v1/services/${encodeURIComponent(env.AI_E2E_RENDER_SERVICE_ID)}`
  const service = await call(serviceUrl, env.AI_E2E_RENDER_API_KEY)
  // Names are explicit setup contracts, checked before either provider mutation.
  if (project.name !== 'worder-qa' || service.name !== 'worder-agents-runtime-qa') throw new Error('Dedicated QA project/service names required')
  if (service.autoDeploy !== 'no') throw new Error('QA runtime auto-deploy must be disabled; CI owns its staging lock')
  const render = await call(`${serviceUrl}/deploys`, env.AI_E2E_RENDER_API_KEY, { commitId: sha, clearCache: 'do_not_clear' })
  if (!render.id) throw new Error('Render did not identify the candidate deployment')
  const deployment = await call(`https://api.vercel.com/v13/deployments?teamId=${team}`, env.AI_E2E_VERCEL_TOKEN, {
    name: project.name, project: project.id,
    gitSource: { type: 'github', org: owner, repo, ref: sha, sha },
    // Omitted target means preview, per the official Vercel API contract.
  })
  if (deployment.target === 'production' || !deployment.id || !/^[a-zA-Z0-9.-]+\.vercel\.app$/.test(deployment.url ?? '')) throw new Error('Invalid candidate preview deployment')
  return { appUrl: `https://${deployment.url}`, appDeploymentId: deployment.id, runtimeDeploymentId: render.id }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (!process.env.GITHUB_ENV) throw new Error('GITHUB_ENV required to hand the unique preview URL to the test job')
    const result = await deployStaging(process.env)
    appendFileSync(process.env.GITHUB_ENV, `AI_E2E_APP_URL=${result.appUrl}\n`)
    console.log(`QA deployments allocated: ${result.appDeploymentId}, ${result.runtimeDeploymentId}; readiness preflight follows.`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
