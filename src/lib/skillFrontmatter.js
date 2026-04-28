// Pure parser for the YAML frontmatter block at the top of a SKILL.md file.
//
// Deep, narrow module: zero new dependencies, no I/O. Returns the parsed
// frontmatter merged with the raw markdown body, or `null` when the block is
// missing or malformed. The narrowness of v1 frontmatter (`name`, `description`
// are the only fields the catalog page reads) keeps the parser tiny and fully
// testable. Extra optional keys are carried through so future readers can
// consume them without touching this module.

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

export function parseFrontmatter(md) {
  if (typeof md !== 'string') return null
  const stripped = md.replace(/^﻿/, '').replace(/^\s+/, '')
  const match = stripped.match(FRONTMATTER_RE)
  if (!match) return null
  const [, yaml, body] = match
  const data = parseYaml(yaml)
  return { ...data, body: body ?? '' }
}

function parseYaml(yaml) {
  const out = {}
  const lines = yaml.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('#')) continue
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const key = line.slice(0, idx).trim()
    if (!key) continue
    let value = line.slice(idx + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}
