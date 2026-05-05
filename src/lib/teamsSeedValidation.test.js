import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..')
const TEAMS_PATH = join(REPO_ROOT, 'src', 'data', 'teams.json')
const SEED_MIGRATION_PATH = join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260504120000_seed_agents.sql',
)

// Pulls the leading id literal from each tuple in the agents INSERT block.
// The pattern matches a tuple opener "(\n  '<kebab-id>',\n  '<name>',"
// which is the deterministic shape of the seed migration. The teams INSERT
// uses the same shape, but we slice it out explicitly to keep the regex tight.
function extractAgentIdsFromMigration(sql) {
  const teamsMarker = sql.indexOf('INSERT INTO teams')
  const agentsSection = teamsMarker === -1 ? sql : sql.slice(0, teamsMarker)
  const ids = []
  const re = /\(\n\s+'([a-z0-9-]+)',\n\s+'/g
  let m
  while ((m = re.exec(agentsSection)) !== null) {
    ids.push(m[1])
  }
  return ids
}

describe('teams.json <-> seed migration', () => {
  const teamsRaw = readFileSync(TEAMS_PATH, 'utf-8')
  const teams = JSON.parse(teamsRaw)
  const seedSql = readFileSync(SEED_MIGRATION_PATH, 'utf-8')
  const seedAgentIds = new Set(extractAgentIdsFromMigration(seedSql))

  it('parses at least one agent row from the seed migration', () => {
    // Sanity check: if the regex breaks, every team test below would also fail
    // for the wrong reason. This makes the cause obvious.
    expect(seedAgentIds.size).toBeGreaterThan(0)
  })

  it('every team references at least one agent', () => {
    for (const team of teams) {
      expect(team.agents.length).toBeGreaterThan(0)
    }
  })

  it.each(teams)(
    'every agent referenced in team "$id" exists in the seed migration',
    (team) => {
      const missing = team.agents.filter((id) => !seedAgentIds.has(id))
      expect(missing).toEqual([])
    },
  )
})
