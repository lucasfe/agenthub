import { assertEquals } from 'jsr:@std/assert@1'
import { extractSkillEntries } from './skillsTree.ts'

Deno.test('extractSkillEntries returns category-nested SKILL.md entries', () => {
  const tree = {
    tree: [
      { path: 'development', type: 'tree' },
      { path: 'development/tdd', type: 'tree' },
      { path: 'development/tdd/SKILL.md', type: 'blob' },
      { path: 'meta', type: 'tree' },
      { path: 'meta/grill-me', type: 'tree' },
      { path: 'meta/grill-me/SKILL.md', type: 'blob' },
      { path: 'project-management', type: 'tree' },
      { path: 'project-management/to-prd', type: 'tree' },
      { path: 'project-management/to-prd/SKILL.md', type: 'blob' },
    ],
  }

  assertEquals(extractSkillEntries(tree), [
    { slug: 'tdd', category: 'development', path: 'development/tdd/SKILL.md' },
    { slug: 'grill-me', category: 'meta', path: 'meta/grill-me/SKILL.md' },
    {
      slug: 'to-prd',
      category: 'project-management',
      path: 'project-management/to-prd/SKILL.md',
    },
  ])
})

Deno.test('extractSkillEntries skips paths that are not exactly <category>/<slug>/SKILL.md', () => {
  const tree = {
    tree: [
      { path: 'SKILL.md', type: 'blob' }, // root-level: skip
      { path: 'meta/SKILL.md', type: 'blob' }, // 1-level: skip
      { path: 'meta/grill-me/SKILL.md', type: 'blob' }, // valid
      { path: 'meta/grill-me/extra/SKILL.md', type: 'blob' }, // 3-level: skip
      { path: 'meta/grill-me/REFERENCE.md', type: 'blob' }, // wrong filename: skip
      { path: 'development/tdd/SKILL.md', type: 'blob' }, // valid
    ],
  }

  assertEquals(extractSkillEntries(tree), [
    { slug: 'grill-me', category: 'meta', path: 'meta/grill-me/SKILL.md' },
    { slug: 'tdd', category: 'development', path: 'development/tdd/SKILL.md' },
  ])
})

Deno.test('extractSkillEntries skips hidden categories (folder names starting with a dot)', () => {
  const tree = {
    tree: [
      { path: '.claude/settings/SKILL.md', type: 'blob' },
      { path: '.github/workflows/SKILL.md', type: 'blob' },
      { path: 'meta/grill-me/SKILL.md', type: 'blob' },
    ],
  }

  assertEquals(extractSkillEntries(tree), [
    { slug: 'grill-me', category: 'meta', path: 'meta/grill-me/SKILL.md' },
  ])
})

Deno.test('extractSkillEntries skips hidden skill folders (slug starting with a dot)', () => {
  const tree = {
    tree: [
      { path: 'meta/.hidden-skill/SKILL.md', type: 'blob' },
      { path: 'meta/grill-me/SKILL.md', type: 'blob' },
    ],
  }

  assertEquals(extractSkillEntries(tree), [
    { slug: 'grill-me', category: 'meta', path: 'meta/grill-me/SKILL.md' },
  ])
})

Deno.test('extractSkillEntries skips non-blob entries (tree, commit, etc.)', () => {
  const tree = {
    tree: [
      { path: 'meta/grill-me/SKILL.md', type: 'tree' }, // wrong type
      { path: 'meta/tdd/SKILL.md', type: 'blob' },
    ],
  }

  assertEquals(extractSkillEntries(tree), [
    { slug: 'tdd', category: 'meta', path: 'meta/tdd/SKILL.md' },
  ])
})

Deno.test('extractSkillEntries returns [] when the tree is missing or malformed', () => {
  assertEquals(extractSkillEntries(null), [])
  assertEquals(extractSkillEntries({}), [])
  assertEquals(extractSkillEntries({ tree: 'not-an-array' }), [])
  assertEquals(extractSkillEntries({ tree: [] }), [])
})

Deno.test('extractSkillEntries handles entries with missing path or type defensively', () => {
  const tree = {
    tree: [
      { path: 'meta/grill-me/SKILL.md', type: 'blob' },
      { path: 'meta/no-type/SKILL.md' },
      { type: 'blob' },
      null,
      'garbage',
    ],
  }

  assertEquals(extractSkillEntries(tree), [
    { slug: 'grill-me', category: 'meta', path: 'meta/grill-me/SKILL.md' },
  ])
})

Deno.test('extractSkillEntries deduplicates by path defensively', () => {
  const tree = {
    tree: [
      { path: 'meta/grill-me/SKILL.md', type: 'blob' },
      { path: 'meta/grill-me/SKILL.md', type: 'blob' },
    ],
  }

  assertEquals(extractSkillEntries(tree), [
    { slug: 'grill-me', category: 'meta', path: 'meta/grill-me/SKILL.md' },
  ])
})
