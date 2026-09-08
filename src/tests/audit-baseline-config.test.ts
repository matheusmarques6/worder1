import { execFileSync } from 'node:child_process'
import { expect, it } from 'vitest'

it('permite somente os builds nativos necessários aos testes', () => {
  const output = execFileSync('pnpm', ['config', 'get', 'allowBuilds', '--json'], {
    encoding: 'utf8',
  })
  expect(JSON.parse(output)).toEqual({ esbuild: true, 'unrs-resolver': true })
})
