import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./check-candidate.mjs', import.meta.url))
assert.ok(process.env.GITLEAKS_BIN, 'Set GITLEAKS_BIN to the verified scanner')

function repository(action) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'worder-candidate-test-')))
  assert.ok(root.startsWith(realpathSync(tmpdir()) + sep))
  const hooks = join(root, 'empty-hooks')
  mkdirSync(hooks)
  function git(...args) {
    const r = spawnSync('git', ['-c', 'core.hooksPath=' + hooks, '-c', 'user.name=Security Test', '-c', 'user.email=security@example.test', ...args], { cwd: root, encoding: 'utf8', windowsHide: true })
    assert.equal(r.status, 0, 'Synthetic repository operation failed')
    return r.stdout.trim()
  }
  function commit(content) {
    writeFileSync(join(root, 'config.txt'), content)
    git('add', 'config.txt')
    git('commit', '--no-gpg-sign', '-m', 'synthetic fixture')
    return git('rev-parse', 'HEAD')
  }
  try { git('init', '--quiet'); action({ root, commit }) }
  finally { rmSync(root, { recursive: true, force: true }) }
}

function check(root, head, base) {
  return spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 30000,
    env: { ...process.env, GITHUB_SHA: head, SECURITY_BASE_SHA: base } })
}

test('accepts a clean candidate with no previous commit', () => {
  repository(({ root, commit }) => {
    const head = commit('Ordinary source\n')
    const r = check(root, head, '0'.repeat(40))
    assert.equal(r.status, 0)
    assert.equal(JSON.parse(r.stdout).status, 'passed')
  })
})

test('blocks a token introduced and removed within the candidate range', () => {
  repository(({ root, commit }) => {
    const base = commit('Clean base\n')
    const token = 'ghp_' + 'aB12cD34eF56gH78iJ90kL12mN34oP56qR78'
    commit(`GITHUB_TOKEN=${token}\n`)
    const head = commit('Removed token\n')
    for (const start of [base, '0'.repeat(40)]) {
      const r = check(root, head, start)
      assert.equal(r.status, 1)
      assert.equal(JSON.parse(r.stdout).status, 'blocked')
      assert.equal((r.stdout + r.stderr).includes(token), false)
    }
  })
})

test('refuses an invalid revision instead of interpreting it as git options', () => {
  const r = check(process.cwd(), '--all', '')
  assert.equal(r.status, 2)
  assert.match(r.stderr, /exact candidate SHA/)
})
