import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const sha = /^[a-f0-9]{40}$/i
const head = process.env.GITHUB_SHA
let base = process.env.SECURITY_BASE_SHA
if (!sha.test(head ?? '')) {
  console.error('Security check requires an exact candidate SHA.')
  process.exit(2)
}
if (!base || /^0+$/.test(base)) {
  base = null
}
if (base !== null && !sha.test(base ?? '')) {
  console.error('Security check requires a valid base SHA.')
  process.exit(2)
}
// Every commit in a PR/push is scanned, including a secret later deleted in
// that same range. Initial root commits scan their entire available history.
const result = spawnSync(process.execPath, [
  fileURLToPath(new URL('./scan-secrets.mjs', import.meta.url)),
  '--source', process.cwd(), '--binary', process.env.GITLEAKS_BIN || 'gitleaks',
  '--mode', 'git', '--range', base ? `${base}..${head}` : head,
], { stdio: 'inherit', windowsHide: true })
process.exitCode = result.error ? 2 : (result.status ?? 2)
