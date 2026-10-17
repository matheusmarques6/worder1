import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./scan-secrets.mjs', import.meta.url))
const binary = process.env.GITLEAKS_BIN
assert.ok(binary, 'Set GITLEAKS_BIN to the checksum-verified Gitleaks executable')

function fixture(content, action) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'worder-secret-test-')))
  const base = realpathSync(tmpdir()) + sep
  assert.ok(dir.startsWith(base), 'Fixture must remain inside the temporary directory')
  try {
    writeFileSync(join(dir, 'config.txt'), content)
    return action(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function run(dir, tool = binary) {
  return spawnSync(process.execPath, [script, '--source', dir, '--binary', tool], { encoding: 'utf8', timeout: 30000 })
}

test('allows clean source and reports a conclusive successful scan', () => {
  fixture('Ordinary source without credentials.\n', dir => {
    const result = run(dir)
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout), { status: 'passed', findings: [] })
  })
})

test('blocks a synthetic provider token without reproducing it in output', () => {
  const token = 'ghp_' + 'aB12cD34eF56gH78iJ90kL12mN34oP56qR78'
  fixture(`GITHUB_TOKEN=${token}\n`, dir => {
    const result = run(dir)
    assert.equal(result.status, 1)
    assert.equal(result.stdout.includes(token), false)
    assert.equal(result.stderr.includes(token), false)
    const report = JSON.parse(result.stdout)
    assert.equal(report.status, 'blocked')
    assert.ok(report.findings.some(item => item.rule === 'github-pat' && item.line === 1))
    assert.ok(report.findings.every(item => Object.keys(item).sort().join(',') === 'file,line,rule'))
  })
})

test('fails closed when the scanning tool cannot run', () => {
  fixture('Clean source\n', dir => {
    const result = run(dir, join(dir, 'missing-tool.exe'))
    assert.equal(result.status, 2)
    assert.equal(JSON.parse(result.stdout).status, 'error')
  })
})
