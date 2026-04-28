import { assertEquals } from 'jsr:@std/assert@1'
import { filterAndSlim } from './githubFilters.ts'

const baseRepo = {
  name: 'project',
  full_name: 'lucasfe/project',
  description: 'A project',
  pushed_at: '2026-04-01T00:00:00Z',
  archived: false,
  fork: false,
  size: 100,
  // Extra fields that must be dropped:
  owner: { login: 'lucasfe' },
  default_branch: 'main',
  topics: ['ai'],
  license: null,
}

Deno.test('filterAndSlim — excludes archived repos', () => {
  const out = filterAndSlim([{ ...baseRepo, archived: true }])
  assertEquals(out, [])
})

Deno.test('filterAndSlim — excludes fork repos', () => {
  const out = filterAndSlim([{ ...baseRepo, fork: true }])
  assertEquals(out, [])
})

Deno.test('filterAndSlim — excludes empty repos with size 0', () => {
  const out = filterAndSlim([{ ...baseRepo, size: 0 }])
  assertEquals(out, [])
})

Deno.test('filterAndSlim — keeps healthy repos', () => {
  const out = filterAndSlim([baseRepo])
  assertEquals(out, [
    {
      name: 'project',
      full_name: 'lucasfe/project',
      description: 'A project',
      pushed_at: '2026-04-01T00:00:00Z',
    },
  ])
})

Deno.test('filterAndSlim — strips extra fields, keeps only slim shape', () => {
  const [out] = filterAndSlim([baseRepo])
  assertEquals(Object.keys(out).sort(), [
    'description',
    'full_name',
    'name',
    'pushed_at',
  ])
})

Deno.test('filterAndSlim — preserves null description', () => {
  const out = filterAndSlim([{ ...baseRepo, description: null }])
  assertEquals(out[0].description, null)
})

Deno.test('filterAndSlim — coerces non-string description to null', () => {
  const out = filterAndSlim([{ ...baseRepo, description: undefined }])
  assertEquals(out[0].description, null)
})

Deno.test('filterAndSlim — drops entries without name or full_name', () => {
  const out = filterAndSlim([
    { ...baseRepo, name: undefined },
    { ...baseRepo, full_name: undefined },
  ])
  assertEquals(out, [])
})

Deno.test('filterAndSlim — mixed input keeps only the survivors in order', () => {
  const repos = [
    { ...baseRepo, name: 'alpha', full_name: 'lucasfe/alpha' },
    { ...baseRepo, name: 'archived-one', full_name: 'lucasfe/archived-one', archived: true },
    { ...baseRepo, name: 'beta', full_name: 'lucasfe/beta' },
    { ...baseRepo, name: 'forked', full_name: 'lucasfe/forked', fork: true },
    { ...baseRepo, name: 'empty', full_name: 'lucasfe/empty', size: 0 },
    { ...baseRepo, name: 'gamma', full_name: 'lucasfe/gamma' },
  ]
  const out = filterAndSlim(repos)
  assertEquals(
    out.map((r) => r.full_name),
    ['lucasfe/alpha', 'lucasfe/beta', 'lucasfe/gamma'],
  )
})

Deno.test('filterAndSlim — empty array returns empty array', () => {
  assertEquals(filterAndSlim([]), [])
})

Deno.test('filterAndSlim — non-array input returns empty array', () => {
  // deno-lint-ignore no-explicit-any
  assertEquals(filterAndSlim(null as any), [])
  // deno-lint-ignore no-explicit-any
  assertEquals(filterAndSlim(undefined as any), [])
})

Deno.test('filterAndSlim — skips null / non-object entries', () => {
  // deno-lint-ignore no-explicit-any
  const out = filterAndSlim([null as any, baseRepo])
  assertEquals(out.length, 1)
})
