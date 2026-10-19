import { readFileSync } from 'node:fs'

try {
  const report = JSON.parse(readFileSync(process.argv[2], 'utf8'))
  const stats = report.stats
  const keys = ['expected', 'skipped', 'unexpected', 'flaky']
  if (!stats || keys.some(key => !Number.isInteger(stats[key]) || stats[key] < 0)) {
    throw new Error('Browser report is absent or incomplete')
  }
  if (!Array.isArray(report.errors) || report.errors.length || stats.expected === 0 ||
      stats.skipped || stats.unexpected || stats.flaky) {
    throw new Error('Browser gate requires executed, passing tests without skips, failures or retries')
  }
  console.log(`Browser evidence: ${stats.expected} passed, none skipped or flaky.`)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
