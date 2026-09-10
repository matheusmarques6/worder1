import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const workflow = readFileSync('.github/workflows/runtime.yml', 'utf8').replace(/\r\n/g, '\n')
const databaseJob = workflow.slice(workflow.indexOf('  tests-db:\n'))

it('runs the complete runtime database gate through one disposable executor', () => {
  expect(workflow.match(/- "scripts\/test-disposable-db\.ps1"/g) ?? []).toHaveLength(2)
  expect(databaseJob).toContain('uv sync --directory runtime --frozen')
  expect(databaseJob).toContain('.superpowers/sdd/auditoria-ia-disposable/$([guid]::NewGuid().ToString(\'N\'))')
  expect(databaseJob).toContain('"RUNTIME_DB_RUN_DIRECTORY=$runPath" >> $env:GITHUB_ENV')

  for (const [name, action] of [
    ['Prepare disposable database', 'Prepare'],
    ['Replay canonical migrations', 'Replay'],
    ['Run complete database gates', 'Test'],
  ]) {
    expect(databaseJob).toContain(
      `- name: ${name}\n        shell: pwsh\n        run: ./scripts/test-disposable-db.ps1 -Action ${action} -RunDirectory $env:RUNTIME_DB_RUN_DIRECTORY`,
    )
  }

  expect(databaseJob).toContain(
    '- name: Stop disposable database\n        if: always()\n        shell: pwsh\n        run: ./scripts/test-disposable-db.ps1 -Action Stop -RunDirectory $env:RUNTIME_DB_RUN_DIRECTORY',
  )
  expect(databaseJob).not.toContain('run: supabase start')
  expect(databaseJob).not.toContain('pytest -m "db or pipeline"')
  expect(workflow).not.toContain('SUPABASE_DB_URL')
  expect(workflow).not.toContain('SUPABASE_EXCLUDE')
  expect(workflow).not.toContain('continue-on-error: true')
  expect(databaseJob).not.toContain('TestTargets')
  expect(databaseJob).not.toMatch(/--(?:deselect|ignore|skip)/)
})

it('preserves the pinned blocking runtime jobs', () => {
  expect(workflow).toContain('python-version: "3.13"')
  expect(workflow).toContain('version: 2.111.0')

  for (const job of ['lint', 'boundaries', 'tests-unit', 'tests-db']) {
    expect(workflow).toContain(`  ${job}:\n`)
  }
})
