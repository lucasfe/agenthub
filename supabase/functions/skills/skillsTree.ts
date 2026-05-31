// Pure helper for the `skills` Edge Function.
//
// Filters a GitHub git/trees recursive response down to the flat catalog
// shape `{ slug, category, path }[]` the frontend consumes. Skills live at
// `<category>/<slug>/SKILL.md` in `lucasfe/skills`; anything deeper or
// shallower, anything not named `SKILL.md`, anything not a blob, and any
// path segment starting with a dot is skipped. Categories and slugs are
// discovered, never hard-coded — adding a new category folder is picked up
// automatically on the next request.

export interface SkillEntry {
  slug: string
  category: string
  path: string
}

interface TreeNode {
  path?: unknown
  type?: unknown
}

interface TreePayload {
  tree?: unknown
}

const SKILL_FILENAME = 'SKILL.md'

export function extractSkillEntries(payload: unknown): SkillEntry[] {
  const tree = (payload as TreePayload | null)?.tree
  if (!Array.isArray(tree)) return []
  const seen = new Set<string>()
  const out: SkillEntry[] = []
  for (const node of tree as TreeNode[]) {
    if (!node || typeof node !== 'object') continue
    if (node.type !== 'blob') continue
    if (typeof node.path !== 'string') continue
    const path = node.path
    const segments = path.split('/')
    if (segments.length !== 3) continue
    const [category, slug, filename] = segments
    if (filename !== SKILL_FILENAME) continue
    if (!category || category.startsWith('.')) continue
    if (!slug || slug.startsWith('.')) continue
    if (seen.has(path)) continue
    seen.add(path)
    out.push({ slug, category, path })
  }
  return out
}
