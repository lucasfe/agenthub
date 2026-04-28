import { describe, it, expect } from 'vitest'
import { parseFrontmatter } from './skillFrontmatter'

describe('parseFrontmatter', () => {
  it('returns null when input is not a string', () => {
    expect(parseFrontmatter(undefined)).toBeNull()
    expect(parseFrontmatter(null)).toBeNull()
    expect(parseFrontmatter(42)).toBeNull()
    expect(parseFrontmatter({})).toBeNull()
  })

  it('parses standard frontmatter with name, description, and body', () => {
    const md = [
      '---',
      'name: grill-me',
      'description: Interview the user about a plan',
      '---',
      '',
      '# Grill Me',
      '',
      'Body goes here.',
    ].join('\n')
    const parsed = parseFrontmatter(md)
    expect(parsed).not.toBeNull()
    expect(parsed.name).toBe('grill-me')
    expect(parsed.description).toBe('Interview the user about a plan')
    expect(parsed.body).toBe('\n# Grill Me\n\nBody goes here.')
  })

  it('returns null when the frontmatter block is missing', () => {
    expect(parseFrontmatter('')).toBeNull()
    expect(parseFrontmatter('# Just a heading\n\nBody only.')).toBeNull()
    expect(parseFrontmatter('not even close')).toBeNull()
  })

  it('returns null when the frontmatter is unterminated (graceful, never throws)', () => {
    const md = [
      '---',
      'name: grill-me',
      'description: never-closed',
      '',
      '# No closing fence below',
      'body content',
    ].join('\n')
    expect(() => parseFrontmatter(md)).not.toThrow()
    expect(parseFrontmatter(md)).toBeNull()
  })

  it('carries extra optional keys through in the result', () => {
    const md = [
      '---',
      'name: to-prd',
      'description: Turn context into a PRD',
      'icon: Wand2',
      'tags: planning,prd',
      '---',
      'body',
    ].join('\n')
    const parsed = parseFrontmatter(md)
    expect(parsed).not.toBeNull()
    expect(parsed.icon).toBe('Wand2')
    expect(parsed.tags).toBe('planning,prd')
  })

  it('handles CRLF line endings', () => {
    const md =
      '---\r\nname: tdd\r\ndescription: Test-driven development loop\r\n---\r\nBody.\r\n'
    const parsed = parseFrontmatter(md)
    expect(parsed).not.toBeNull()
    expect(parsed.name).toBe('tdd')
    expect(parsed.description).toBe('Test-driven development loop')
    expect(parsed.body).toBe('Body.\r\n')
  })

  it('tolerates leading whitespace and BOM before the opening fence', () => {
    const bom = String.fromCharCode(0xfeff)
    const md = `${bom}\n   \n---\nname: review\ndescription: Review a pull request\n---\nbody`
    const parsed = parseFrontmatter(md)
    expect(parsed).not.toBeNull()
    expect(parsed.name).toBe('review')
    expect(parsed.description).toBe('Review a pull request')
  })

  it('strips matching surrounding quotes from values', () => {
    const md = [
      '---',
      'name: "quoted-name"',
      "description: 'single-quoted description'",
      '---',
      'body',
    ].join('\n')
    const parsed = parseFrontmatter(md)
    expect(parsed.name).toBe('quoted-name')
    expect(parsed.description).toBe('single-quoted description')
  })

  it('ignores comment lines and blank lines inside the frontmatter', () => {
    const md = [
      '---',
      '# leading comment',
      'name: skill-creator',
      '',
      'description: Author a new SKILL.md',
      '---',
      'body',
    ].join('\n')
    const parsed = parseFrontmatter(md)
    expect(parsed.name).toBe('skill-creator')
    expect(parsed.description).toBe('Author a new SKILL.md')
  })

  it('returns an empty body when no content follows the closing fence', () => {
    const md = '---\nname: empty\ndescription: nothing after\n---\n'
    const parsed = parseFrontmatter(md)
    expect(parsed).not.toBeNull()
    expect(parsed.body).toBe('')
  })
})
