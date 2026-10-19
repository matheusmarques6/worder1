import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./playwright-report.mjs', import.meta.url))
for (const [name, stats, status] of [
  ['executed and passed', { expected: 3, skipped: 0, unexpected: 0, flaky: 0 }, 0],
  ['zero tests', { expected: 0, skipped: 0, unexpected: 0, flaky: 0 }, 1],
  ['skipped journey', { expected: 2, skipped: 1, unexpected: 0, flaky: 0 }, 1],
  ['failed journey', { expected: 2, skipped: 0, unexpected: 1, flaky: 0 }, 1],
  ['flaky journey', { expected: 2, skipped: 0, unexpected: 0, flaky: 1 }, 1],
  ['missing counts', {}, 1],
]) {
  test(`browser report refuses incomplete release evidence: ${name}`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'worder-release-report-'))
    try {
      const path = join(dir, 'report.json')
      writeFileSync(path, JSON.stringify({ stats, errors: [] }))
      const result = spawnSync(process.execPath, [script, path], { encoding: 'utf8' })
      assert.equal(result.status, status, result.stderr)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
}
