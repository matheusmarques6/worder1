import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('permite somente os builds nativos necessários aos testes', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  expect(pkg.pnpm?.onlyBuiltDependencies).toEqual(['esbuild', 'unrs-resolver'])
})
