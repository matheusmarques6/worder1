import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { expect, it } from 'vitest'

it('permite somente os builds nativos necessários aos testes', () => {
  const args = ['config', 'get', 'allowBuilds', '--json']
  const pnpmScript = process.env.npm_execpath ?? (
    process.platform === 'win32'
      ? join(process.env.APPDATA!, 'npm', 'node_modules', 'pnpm', 'bin', 'pnpm.mjs')
      : undefined
  )
  const output = pnpmScript
    ? execFileSync(process.execPath, [pnpmScript, ...args], { encoding: 'utf8' })
    : execFileSync('pnpm', args, { encoding: 'utf8' })
  expect(JSON.parse(output)).toEqual({ esbuild: true, 'unrs-resolver': true })
})
