import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { sep } from 'node:path'

test('every browser spec is a mandatory CI shard with independent evidence', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8')
  const actual = readdirSync(new URL('../../tests/ai-ui/', import.meta.url), { recursive: true })
    .map(file => file.split(sep).join('/')).filter(file => file.endsWith('.spec.ts')).sort()
  const literal = /spec:\s*\[([^\]]+)\]/.exec(workflow)?.[1]
  assert.ok(literal, 'The required UI matrix must be explicit and reviewable')
  const configured = literal.split(',').map(value => value.trim()).sort()
  assert.ok(actual.length > 0, 'A release cannot pass with no browser specs')
  assert.deepEqual(configured, actual, 'Added or removed specs must update the mandatory matrix')
  assert.match(workflow, /fail-fast:\s*false/)
  assert.ok(workflow.includes('pnpm test:ai:ui ${{ matrix.spec }} --reporter=line,json,html'))
  assert.ok(workflow.includes('name: ai-ui-${{ matrix.spec }}-${{ github.sha }}-${{ github.run_id }}'))
})
