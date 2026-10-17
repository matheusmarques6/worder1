import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'

// Capture every scanner byte. Only explicit non-secret metadata reaches stdout.
// A tool/configuration failure is a failed gate, never an empty successful scan.
export function scanSecrets({ source, binary = 'gitleaks', config, mode = 'dir', range }) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'worder-secret-scan-')))
  const base = realpathSync(tmpdir()) + sep
  if (!dir.startsWith(base)) throw new Error('Invalid temporary scan directory')
  try {
    if (!['dir', 'git'].includes(mode)) throw new Error('Invalid scan mode')
    const report = join(dir, 'redacted.json')
    const args = [mode, resolve(source), '--redact=100', '--no-banner', '--no-color', '--ignore-gitleaks-allow', '--gitleaks-ignore-path', join(dir, 'no-ignore'), '--report-format=json', '--report-path', report]
    if (config) args.push('--config', resolve(config))
    if (range) {
      if (mode !== 'git' || !/^[a-f0-9]{40}(?:\.\.[a-f0-9]{40})?$/i.test(range)) throw new Error('Invalid revision range')
      args.push('--log-opts', range)
    }
    const result = spawnSync(binary, args, { encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024, windowsHide: true })
    if (result.error || ![0, 1].includes(result.status)) return { code: 2, report: { status: 'error', findings: [] } }
    const raw = JSON.parse(readFileSync(report, 'utf8'))
    if (!Array.isArray(raw)) throw new Error('Invalid scan report')
    const findings = raw.map(item => {
      if (typeof item.RuleID !== 'string' || typeof item.File !== 'string' || !Number.isInteger(item.StartLine)) throw new Error('Incomplete scan finding')
      return { rule: item.RuleID, file: item.File, line: item.StartLine }
    })
    if (result.status === 1 && !findings.length) throw new Error('Inconclusive scan')
    return { code: findings.length ? 1 : 0, report: { status: findings.length ? 'blocked' : 'passed', findings } }
  } catch {
    return { code: 2, report: { status: 'error', findings: [] } }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const args = process.argv.slice(2)
const options = {}
let invalid = false
for (let i = 0; i < args.length; i += 2) {
  const name = { '--source': 'source', '--binary': 'binary', '--config': 'config', '--mode': 'mode', '--range': 'range' }[args[i]]
  if (!name || !args[i + 1] || options[name]) { invalid = true; break }
  options[name] = args[i + 1]
}
const result = invalid || !options.source
  ? { code: 2, report: { status: 'error', findings: [] } }
  : scanSecrets(options)
process.stdout.write(JSON.stringify(result.report) + '\n')
process.exitCode = result.code
