import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const exec = promisify(execFile)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const docker = process.env.TEST_DOCKER_BIN || 'docker'
const nonce = randomBytes(16).toString('hex')
const label = `worder.test.redis=${nonce}`
const artifacts = path.join(root, '.superpowers/sdd/redis-local', nonce)
const redisImage = 'redis@sha256:858f009f9709ce576febc734aa78b8f6d624b82571f9ddb6bda4377c833b3499'
const httpImage = 'hiett/serverless-redis-http@sha256:5b0bb9239fce53abf87b2018a7a0deb9ec7bd900c5360738fe5fbeeb426f9150'
const token = randomBytes(32).toString('hex')
let network
const containers = []
const call = async (...args) => (await exec(docker, args, { cwd: root, timeout: 120_000, maxBuffer: 2_000_000 })).stdout.trim()
await mkdir(artifacts, { recursive: true })
const journal = () => writeFile(path.join(artifacts, 'resources.json'), JSON.stringify({ nonce, network, containers }))
async function verify(id, kind = 'container') {
  assert.match(id, /^[a-f0-9]{64}$/)
  const [record] = JSON.parse(await call(kind === 'network' ? 'network' : 'container', 'inspect', id))
  assert.equal(record.Id, id)
  assert.equal((kind === 'network' ? record.Labels : record.Config.Labels)['worder.test.redis'], nonce)
  return record
}
let exit = 1
try {
  assert.ok(!process.env.DOCKER_HOST && !process.env.DOCKER_TLS_VERIFY, 'Remote Docker routing refused')
  const [context] = JSON.parse(await call('context', 'inspect'))
  assert.match(context.Endpoints.docker.Host, /^(unix:\/\/\/|npipe:\/\/\/\/\.\/pipe\/docker)/)
  for (const image of [redisImage, httpImage]) {
    try { await call('image', 'inspect', image) } catch { await call('pull', image) }
  }
  network = await call('network', 'create', '--label', label, `worder-redis-${nonce}`)
  await journal()
  await verify(network, 'network')
  const redis = await call('run', '-d', '--network', network, '--network-alias', 'redis', '--label', label,
    '--memory', '96m', '--pids-limit', '64', '--tmpfs', '/data', '--security-opt', 'no-new-privileges',
    redisImage, 'redis-server', '--save', '', '--appendonly', 'no')
  containers.push(redis)
  await journal()
  await verify(redis)
  const http = await call('run', '-d', '--network', network, '--label', label,
    '--memory', '192m', '--pids-limit', '128', '-p', '127.0.0.1::80', '--security-opt', 'no-new-privileges',
    '-e', 'SRH_MODE=env', '-e', `SRH_TOKEN=${token}`, '-e', 'SRH_CONNECTION_STRING=redis://redis:6379', '-e', 'ERL_FLAGS=+S 2:2 +SDio 1 +SDcpu 1', httpImage)
  containers.push(http)
  await journal()
  const record = await verify(http)
  if (!record.State.Running) {
    const logs = await call('logs', '--tail', '20', http).catch(() => '')
    await writeFile(path.join(artifacts, 'startup.log'), logs.replaceAll(token, '[local-token]'))
    throw new Error('RedisHttpStartupFailure')
  }
  const ports = record.NetworkSettings.Ports['80/tcp']
  assert.equal(ports.length, 1)
  assert.equal(ports[0].HostIp, '127.0.0.1')
  assert.match(ports[0].HostPort, /^[0-9]+$/)
  const url = `http://127.0.0.1:${ports[0].HostPort}`
  let ready = false
  let startupStatus = 'No response'
  for (let i = 0; i < 40 && !ready; i++) {
    const abort = new AbortController()
    const timer = setTimeout(() => abort.abort(), 2000)
    try {
      const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(['SET', `security-test-run:${nonce}`, nonce]), signal: abort.signal })
      const body = await res.text()
      startupStatus = `${res.status} ${body.slice(0, 300).replaceAll(token, '[local-token]')}`
      ready = res.ok && JSON.parse(body).result === 'OK'
    } catch (error) { startupStatus = error.name }
    finally { clearTimeout(timer) }
    if (!ready) await new Promise((resolve) => setTimeout(resolve, 250))
  }
  if (!ready) {
    await writeFile(path.join(artifacts, 'startup.log'), startupStatus)
  }
  assert.ok(ready, 'Disposable Redis HTTP endpoint did not become ready')
  const report = path.join(artifacts, 'report.json')
  console.log('Running real SDK + Redis Lua atomicity tests on owned loopback containers')
  exit = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.redis.config.ts',
      '--reporter=default', '--reporter=json', `--outputFile.json=${report}`], {
      cwd: root, stdio: 'inherit', env: { ...process.env, REDIS_TEST_NONCE: nonce,
        UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: token },
    })
    child.on('error', reject)
    child.on('exit', (code) => resolve(code ?? 1))
  })
  const results = JSON.parse(await readFile(report, 'utf8'))
  assert.equal(results.numTotalTests, 2)
  assert.equal(results.numPassedTests, 2)
  assert.equal(results.numPendingTests, 0)
  assert.equal(exit, 0)
} catch (error) {
  // Docker errors can contain the synthetic local token; omit their raw text.
  console.error(`Redis local gate failed: ${error instanceof assert.AssertionError ? error.message : error.name}`)
  exit = 1
} finally {
  for (const id of containers.reverse()) {
    try { await verify(id); await call('rm', '-f', '-v', id) } catch { exit = 1; console.error('Owned Redis container cleanup failed') }
  }
  if (network) {
    try { await verify(network, 'network'); await call('network', 'rm', network) } catch { exit = 1; console.error('Owned Redis network cleanup failed') }
  }
  await writeFile(path.join(artifacts, 'gate.json'), JSON.stringify({ exit, expectedTests: 2, passedTests: exit === 0 ? 2 : 0, finished: new Date().toISOString() }))
}
process.exitCode = exit
