import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..')
const SEED_MIGRATION_PATH = join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260506000000_seed_luiza_agents.sql',
)

const EXPECTED_AGENTS = [
  { id: 'pedro-pesquisa', name: 'Pedro Pesquisa', icon: 'Search', color: 'blue', tools: ['web_search', 'web_fetch'] },
  { id: 'iago-instagram', name: 'Iago Instagram', icon: 'Camera', color: 'rose', tools: [] },
  { id: 'renata-reels', name: 'Renata Reels', icon: 'Clapperboard', color: 'purple', tools: [] },
  { id: 'sofia-stories', name: 'Sofia Stories', icon: 'Smartphone', color: 'cyan', tools: [] },
  { id: 'diana-design', name: 'Diana Design', icon: 'Palette', color: 'amber', tools: ['render_html_to_image'] },
  { id: 'vera-veredito', name: 'Vera Veredito', icon: 'BadgeCheck', color: 'green', tools: [] },
  { id: 'paula-publicacao', name: 'Paula Publicação', icon: 'Send', color: 'blue', tools: ['zernio_publish'] },
]

describe('Luiza agents seed migration', () => {
  it('migration file exists', () => {
    expect(existsSync(SEED_MIGRATION_PATH)).toBe(true)
  })

  const sql = existsSync(SEED_MIGRATION_PATH)
    ? readFileSync(SEED_MIGRATION_PATH, 'utf-8')
    : ''

  it.each(EXPECTED_AGENTS)('seeds the $id agent', (agent) => {
    expect(sql).toContain(`'${agent.id}'`)
    expect(sql).toContain(agent.name)
  })

  it('every agent is categorized as Content Creators', () => {
    const matches = sql.match(/'Content Creators'/g) || []
    expect(matches.length).toBe(EXPECTED_AGENTS.length)
  })

  it('declares the documented icon for every agent', () => {
    for (const agent of EXPECTED_AGENTS) {
      const tupleStart = sql.indexOf(`'${agent.id}'`)
      expect(tupleStart, `agent ${agent.id} not found`).toBeGreaterThan(-1)
      const tupleSlice = sql.slice(tupleStart, tupleStart + 600)
      expect(tupleSlice, `icon for ${agent.id}`).toContain(`'${agent.icon}'`)
      expect(tupleSlice, `color for ${agent.id}`).toContain(`'${agent.color}'`)
    }
  })

  it('declares the documented tools array for every agent', () => {
    for (const agent of EXPECTED_AGENTS) {
      const tupleStart = sql.indexOf(`'${agent.id}'`)
      const nextTupleMarker = sql.indexOf('ON CONFLICT', tupleStart)
      const tupleSlice = sql.slice(tupleStart, nextTupleMarker > -1 ? nextTupleMarker : tupleStart + 8000)
      if (agent.tools.length === 0) {
        expect(tupleSlice, `${agent.id} should declare empty tools array`).toMatch(/ARRAY\[\]::text\[\]/)
      } else {
        for (const tool of agent.tools) {
          expect(tupleSlice, `${agent.id} should declare tool ${tool}`).toContain(`'${tool}'`)
        }
      }
    }
  })

  it('contains no leftover Opensquad filesystem paths', () => {
    expect(sql).not.toMatch(/squads\/luiza-instagram\//)
    expect(sql).not.toMatch(/_opensquad\//)
  })

  it('uses ON CONFLICT DO UPDATE so re-runs are idempotent', () => {
    expect(sql).toMatch(/ON CONFLICT \(id\) DO UPDATE/)
  })
})
