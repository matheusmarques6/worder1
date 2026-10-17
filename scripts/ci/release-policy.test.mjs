import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./release-policy.mjs', import.meta.url))
const good = Object.fromEntries(['app', 'runtime', 'ui', 'journeys'].map(name => [name, { result: 'success' }]))
function run(needs) {
  return spawnSync(process.execPath, [script], {
    encoding: 'utf8', env: { ...process.env, NEEDS_JSON: typeof needs === 'string' ? needs : JSON.stringify(needs) },
  })
}

test('release approves only when every required job succeeded', () => {
  const result = run(good)
  assert.equal(result.status, 0, result.stderr)
})

for (const state of ['failure', 'cancelled', 'skipped', 'neutral', '', null]) {
  test(`release refuses a required job with result ${JSON.stringify(state)}`, () => {
    const result = run({ ...good, journeys: { result: state } })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /journeys/)
  })
}

test('release refuses an absent required job even if all other jobs passed', () => {
  const { journeys, ...incomplete } = good
  const result = run(incomplete)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /journeys/)
})

for (const input of ['{}', '[]', 'null', 'not json']) {
  test(`release refuses missing or malformed evidence: ${input}`, () => {
    const result = run(input)
    assert.equal(result.status, 1)
  })
}
