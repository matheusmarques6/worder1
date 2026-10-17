// Run by the always-present release check, even when a dependency failed.
const required = ['app', 'runtime', 'ui', 'journeys']
try {
  const needs = JSON.parse(process.env.NEEDS_JSON ?? '')
  if (!needs || Array.isArray(needs) || typeof needs !== 'object') throw new Error('Invalid job evidence')
  const refused = required.filter(name => needs[name]?.result !== 'success')
  if (refused.length) throw new Error(`Release blocked: ${refused.join(', ')}`)
  console.log('All required release jobs succeeded for this workflow commit.')
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
