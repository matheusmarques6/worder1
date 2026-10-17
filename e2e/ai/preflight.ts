import { spawnSync } from 'node:child_process'
import path from 'node:path'

export default function preflight() {
  const result = spawnSync(process.execPath, [path.resolve('scripts/ci/ai-e2e-preflight.mjs')], {
    env: process.env, stdio: 'inherit',
  })
  if (result.status !== 0) throw new Error('AI staging is not configured, healthy, or at the candidate revision. No test data was written.')
}
