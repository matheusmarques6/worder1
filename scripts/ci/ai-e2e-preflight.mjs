// This must run before login, fixture creation or browser startup.
const required = [
  'AI_E2E_APP_URL', 'AI_E2E_RUNTIME_URL', 'AI_E2E_SUPABASE_URL',
  'AI_E2E_EMAIL', 'AI_E2E_PASSWORD', 'AI_E2E_ACCOUNT_ID', 'AI_E2E_RECIPIENT_PHONE',
  'AI_E2E_ORGANIZATION_ID', 'AI_E2E_STORE_ID', 'AI_E2E_SUPABASE_SERVICE_ROLE_KEY',
  'AI_E2E_META_APP_SECRET', 'AI_E2E_COMMIT_SHA',
]

try {
  const missing = required.filter(name => !process.env[name]?.trim())
  if (missing.length) throw new Error(`Homologation blocked; missing: ${missing.join(', ')}`)
  for (const name of ['AI_E2E_APP_URL', 'AI_E2E_RUNTIME_URL', 'AI_E2E_SUPABASE_URL']) {
    let url
    try { url = new URL(process.env[name]) } catch { throw new Error(`Invalid origin: ${name}`) }
    const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
        url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new Error(`Invalid test origin: ${name}`)
    }
    if (url.hostname === 'rqpmoavktzvxfcfsdkcc.supabase.co') throw new Error('Production Supabase is forbidden for tests')
  }
  const sha = process.env.AI_E2E_COMMIT_SHA
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('AI_E2E_COMMIT_SHA must identify one complete commit')
  if (process.env.GITHUB_SHA && sha !== process.env.GITHUB_SHA) throw new Error('Candidate commit differs from workflow commit')
  const waitSeconds = Number(process.env.AI_E2E_WAIT_SECONDS ?? 600)
  if (!Number.isInteger(waitSeconds) || waitSeconds < 0 || waitSeconds > 900) throw new Error('AI_E2E_WAIT_SECONDS must be between 0 and 900')
  if (!process.argv.includes('--configuration-only')) {
    const deadline = Date.now() + waitSeconds * 1000
    while (true) {
      try {
        for (const [name, path] of [['AI_E2E_APP_URL', '/api/health'], ['AI_E2E_RUNTIME_URL', '/healthz']]) {
          const response = await fetch(new URL(path, process.env[name]), { signal: AbortSignal.timeout(15_000) })
          if (!response.ok) throw new Error(`Candidate unavailable: ${name}`)
          const body = await response.json()
          if (!['preview', 'staging', 'test', 'development'].includes(body.environment)) {
            throw Object.assign(new Error('Explicit non-production environment is required for tests'), { fatal: true })
          }
          if (body.commit !== sha) throw new Error(`Candidate commit is absent or differs: ${name}`)
          if (name === 'AI_E2E_APP_URL' && body.ok !== true) throw new Error('Candidate app is not healthy')
          if (name === 'AI_E2E_RUNTIME_URL' && body.status !== 'ok') throw new Error('Candidate runtime is not healthy')
        }
        break
      } catch (error) {
        if (error.fatal || Date.now() >= deadline) throw error
        await new Promise(resolve => setTimeout(resolve, Math.min(1000, deadline - Date.now())))
      }
    }
  }
  console.log(process.argv.includes('--configuration-only')
    ? 'Test configuration validated; no services contacted.'
    : 'App and runtime are healthy at the exact candidate commit.')
} catch (error) {
  // Do not print response bodies, environment contents, request headers or tokens.
  console.error(error.message)
  process.exitCode = 1
}
