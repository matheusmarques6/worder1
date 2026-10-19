import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./scan-secrets.mjs', import.meta.url))
const config = fileURLToPath(new URL('../../.gitleaks.toml', import.meta.url))
const binary = process.env.GITLEAKS_BIN
assert.ok(binary, 'Set GITLEAKS_BIN to the checksum-verified executable')
const exactPath = 'src/app/api/integrations/tiktok/route.test.ts'
const fixtureKey = ['synthetic-integration-key', 'at-least-32-characters'].join('-')
const synthetic = `vi.stubEnv('ENCRYPTION_KEY', '${fixtureKey}')`

function scan(relative, source) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'worder-triage-')))
  assert.ok(dir.startsWith(realpathSync(tmpdir()) + sep))
  try {
    const file = join(dir, relative)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, source)
    return spawnSync(process.execPath, [script, '--source', dir, '--binary', binary, '--config', config], { encoding: 'utf8', timeout: 30000 })
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
test('triages only the exact known synthetic value in its exact fixture', () => {
  const result = scan(exactPath, synthetic)
  assert.equal(result.status, 0, result.stdout)
  assert.equal(JSON.parse(result.stdout).status, 'passed')
})
test('the same value remains blocked outside its fixture', () => {
  const result = scan('src/real-client.ts', synthetic)
  assert.equal(result.status, 1, result.stdout)
})
test('a different provider credential remains blocked even in that fixture', () => {
  const token = 'ghp_' + 'aB12cD34eF56gH78iJ90kL12mN34oP56qR78'
  const result = scan(exactPath, `GITHUB_TOKEN=${token}`)
  assert.equal(result.status, 1, result.stdout)
  assert.ok(!result.stdout.includes(token))
})
