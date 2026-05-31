import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { listSkills, getSkill, SkillsApiError } from './skills'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://test.supabase.co'
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'anon-key'
const PROXY_BASE = `${SUPABASE_URL}/functions/v1/skills`
const ACCESS_TOKEN = 'test-access-token'

const LIST_URL = `${PROXY_BASE}?op=list`
const RAW_URL = (category, slug) =>
  `${PROXY_BASE}?op=raw&category=${category}&slug=${slug}`

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

function textResponse(body, init = {}) {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/plain' },
    ...init,
  })
}

function frontmatter(name, description) {
  return `---\nname: ${name}\ndescription: ${description}\n---\nbody`
}

let fetchMock

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('listSkills — happy path (nested category layout)', () => {
  it('lists every skill across categories, exposes the category, and points sourceUrl at the category-nested path', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url === LIST_URL) {
        return jsonResponse([
          { slug: 'grill-me', category: 'meta', path: 'meta/grill-me/SKILL.md' },
          { slug: 'tdd', category: 'development', path: 'development/tdd/SKILL.md' },
          {
            slug: 'to-prd',
            category: 'project-management',
            path: 'project-management/to-prd/SKILL.md',
          },
        ])
      }
      if (url === RAW_URL('meta', 'grill-me')) {
        return textResponse(frontmatter('grill-me', 'Interview the user'))
      }
      if (url === RAW_URL('development', 'tdd')) {
        return textResponse(frontmatter('tdd', 'Test-driven development'))
      }
      if (url === RAW_URL('project-management', 'to-prd')) {
        return textResponse(frontmatter('to-prd', 'Turn context into a PRD'))
      }
      throw new Error(`unexpected url: ${url}`)
    })

    const skills = await listSkills({ accessToken: ACCESS_TOKEN })

    expect(skills).toEqual([
      {
        slug: 'grill-me',
        category: 'meta',
        name: 'grill-me',
        description: 'Interview the user',
        sourceUrl: 'https://github.com/lucasfe/skills/tree/main/meta/grill-me',
      },
      {
        slug: 'tdd',
        category: 'development',
        name: 'tdd',
        description: 'Test-driven development',
        sourceUrl: 'https://github.com/lucasfe/skills/tree/main/development/tdd',
      },
      {
        slug: 'to-prd',
        category: 'project-management',
        name: 'to-prd',
        description: 'Turn context into a PRD',
        sourceUrl:
          'https://github.com/lucasfe/skills/tree/main/project-management/to-prd',
      },
    ])
  })

  it('attaches the Supabase auth headers (Authorization Bearer + apikey) on every call', async () => {
    fetchMock.mockResolvedValue(jsonResponse([]))

    await listSkills({ accessToken: ACCESS_TOKEN })

    expect(fetchMock).toHaveBeenCalledWith(
      LIST_URL,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          apikey: ANON_KEY,
        }),
      }),
    )
  })

  it('throws SkillsApiError with status 401 when no accessToken is passed', async () => {
    await expect(listSkills()).rejects.toBeInstanceOf(SkillsApiError)
    await expect(listSkills()).rejects.toMatchObject({ status: 401 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('listSkills — filtering', () => {
  it('ignores list entries that are missing slug or category', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url === LIST_URL) {
        return jsonResponse([
          { slug: 'tdd', category: 'development', path: 'development/tdd/SKILL.md' },
          { slug: 'no-category', path: 'no-category/SKILL.md' },
          { category: 'meta' },
          null,
        ])
      }
      if (url === RAW_URL('development', 'tdd')) {
        return textResponse(frontmatter('tdd', 'Test-driven development'))
      }
      throw new Error(`unexpected url: ${url}`)
    })

    const skills = await listSkills({ accessToken: ACCESS_TOKEN })

    expect(skills.map((s) => s.slug)).toEqual(['tdd'])
  })

  it('skips a folder without a SKILL.md (404) instead of crashing the catalog', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url === LIST_URL) {
        return jsonResponse([
          { slug: 'has-skill', category: 'meta', path: 'meta/has-skill/SKILL.md' },
          { slug: 'orphan', category: 'meta', path: 'meta/orphan/SKILL.md' },
        ])
      }
      if (url === RAW_URL('meta', 'has-skill')) {
        return textResponse(frontmatter('has-skill', 'A real skill'))
      }
      if (url === RAW_URL('meta', 'orphan')) {
        return new Response('Not Found', { status: 404 })
      }
      throw new Error(`unexpected url: ${url}`)
    })

    const skills = await listSkills({ accessToken: ACCESS_TOKEN })

    expect(skills.map((s) => s.slug)).toEqual(['has-skill'])
  })

  it('skips a SKILL.md without frontmatter', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url === LIST_URL) {
        return jsonResponse([
          { slug: 'good', category: 'meta', path: 'meta/good/SKILL.md' },
          {
            slug: 'no-frontmatter',
            category: 'meta',
            path: 'meta/no-frontmatter/SKILL.md',
          },
        ])
      }
      if (url === RAW_URL('meta', 'good')) {
        return textResponse(frontmatter('good', 'Good skill'))
      }
      if (url === RAW_URL('meta', 'no-frontmatter')) {
        return textResponse('# just a heading\n\nbody only, no frontmatter')
      }
      throw new Error(`unexpected url: ${url}`)
    })

    const skills = await listSkills({ accessToken: ACCESS_TOKEN })

    expect(skills.map((s) => s.slug)).toEqual(['good'])
  })

  it('skips a SKILL.md whose frontmatter is missing name or description', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url === LIST_URL) {
        return jsonResponse([
          { slug: 'no-name', category: 'meta', path: 'meta/no-name/SKILL.md' },
          { slug: 'no-desc', category: 'meta', path: 'meta/no-desc/SKILL.md' },
        ])
      }
      if (url === RAW_URL('meta', 'no-name')) {
        return textResponse('---\ndescription: only a description\n---\nbody')
      }
      if (url === RAW_URL('meta', 'no-desc')) {
        return textResponse('---\nname: only-a-name\n---\nbody')
      }
      throw new Error(`unexpected url: ${url}`)
    })

    const skills = await listSkills({ accessToken: ACCESS_TOKEN })

    expect(skills).toEqual([])
  })
})

describe('listSkills — error surfacing', () => {
  it('throws a SkillsApiError on 403 when listing folders', async () => {
    fetchMock.mockResolvedValue(new Response('rate limited', { status: 403 }))

    await expect(listSkills({ accessToken: ACCESS_TOKEN })).rejects.toBeInstanceOf(
      SkillsApiError,
    )
    await expect(listSkills({ accessToken: ACCESS_TOKEN })).rejects.toMatchObject({
      status: 403,
    })
  })

  it('throws a SkillsApiError on 5xx when listing folders', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 503 }))

    await expect(listSkills({ accessToken: ACCESS_TOKEN })).rejects.toBeInstanceOf(
      SkillsApiError,
    )
    await expect(listSkills({ accessToken: ACCESS_TOKEN })).rejects.toMatchObject({
      status: 503,
    })
  })

  it('throws a SkillsApiError when an individual SKILL.md returns 403', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url === LIST_URL) {
        return jsonResponse([
          { slug: 'limited', category: 'meta', path: 'meta/limited/SKILL.md' },
        ])
      }
      return new Response('rate limited', { status: 403 })
    })

    await expect(listSkills({ accessToken: ACCESS_TOKEN })).rejects.toBeInstanceOf(
      SkillsApiError,
    )
  })

  it('throws a SkillsApiError when the listing response is not an array', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'unexpected' }))

    await expect(listSkills({ accessToken: ACCESS_TOKEN })).rejects.toBeInstanceOf(
      SkillsApiError,
    )
  })
})

describe('getSkill — nested category layout', () => {
  it('exists as an exported function', () => {
    expect(typeof getSkill).toBe('function')
  })

  it('looks up the category via the catalog, then fetches the SKILL.md and returns the full shape', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url === LIST_URL) {
        return jsonResponse([
          { slug: 'grill-me', category: 'meta', path: 'meta/grill-me/SKILL.md' },
          { slug: 'tdd', category: 'development', path: 'development/tdd/SKILL.md' },
        ])
      }
      if (url === RAW_URL('meta', 'grill-me')) {
        return textResponse(
          '---\nname: grill-me\ndescription: Interview the user\n---\n# Heading\n\nFull body here.',
        )
      }
      throw new Error(`unexpected url: ${url}`)
    })

    const skill = await getSkill('grill-me', { accessToken: ACCESS_TOKEN })

    expect(skill).toEqual({
      slug: 'grill-me',
      category: 'meta',
      name: 'grill-me',
      description: 'Interview the user',
      body: '# Heading\n\nFull body here.',
      sourceUrl: 'https://github.com/lucasfe/skills/tree/main/meta/grill-me',
    })
  })

  it('returns null when the slug is not in the catalog', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url === LIST_URL) {
        return jsonResponse([
          { slug: 'tdd', category: 'development', path: 'development/tdd/SKILL.md' },
        ])
      }
      throw new Error(`unexpected url: ${url}`)
    })

    const skill = await getSkill('does-not-exist', { accessToken: ACCESS_TOKEN })

    expect(skill).toBeNull()
  })

  it('returns null when the SKILL.md vanished between listing and fetching (404)', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url === LIST_URL) {
        return jsonResponse([
          { slug: 'gone', category: 'meta', path: 'meta/gone/SKILL.md' },
        ])
      }
      if (url === RAW_URL('meta', 'gone')) {
        return new Response('Not Found', { status: 404 })
      }
      throw new Error(`unexpected url: ${url}`)
    })

    const skill = await getSkill('gone', { accessToken: ACCESS_TOKEN })

    expect(skill).toBeNull()
  })

  it('returns null for empty or non-string slugs without making a request', async () => {
    expect(await getSkill('', { accessToken: ACCESS_TOKEN })).toBeNull()
    expect(await getSkill(undefined, { accessToken: ACCESS_TOKEN })).toBeNull()
    expect(await getSkill(null, { accessToken: ACCESS_TOKEN })).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns null when SKILL.md exists but has no frontmatter', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url === LIST_URL) {
        return jsonResponse([
          {
            slug: 'no-frontmatter',
            category: 'meta',
            path: 'meta/no-frontmatter/SKILL.md',
          },
        ])
      }
      if (url === RAW_URL('meta', 'no-frontmatter')) {
        return textResponse('# just a heading\n\nbody only, no frontmatter')
      }
      throw new Error(`unexpected url: ${url}`)
    })

    const skill = await getSkill('no-frontmatter', { accessToken: ACCESS_TOKEN })

    expect(skill).toBeNull()
  })

  it('returns null when the frontmatter is missing name or description', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url === LIST_URL) {
        return jsonResponse([
          { slug: 'no-desc', category: 'meta', path: 'meta/no-desc/SKILL.md' },
        ])
      }
      if (url === RAW_URL('meta', 'no-desc')) {
        return textResponse('---\nname: only-a-name\n---\nbody')
      }
      throw new Error(`unexpected url: ${url}`)
    })

    const skill = await getSkill('no-desc', { accessToken: ACCESS_TOKEN })

    expect(skill).toBeNull()
  })

  it('throws a SkillsApiError on 403 from the listing', async () => {
    fetchMock.mockResolvedValue(new Response('rate limited', { status: 403 }))

    await expect(
      getSkill('grill-me', { accessToken: ACCESS_TOKEN }),
    ).rejects.toBeInstanceOf(SkillsApiError)
    await expect(
      getSkill('grill-me', { accessToken: ACCESS_TOKEN }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('throws a SkillsApiError on 5xx from the raw fetch', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url === LIST_URL) {
        return jsonResponse([
          { slug: 'grill-me', category: 'meta', path: 'meta/grill-me/SKILL.md' },
        ])
      }
      return new Response('boom', { status: 503 })
    })

    await expect(
      getSkill('grill-me', { accessToken: ACCESS_TOKEN }),
    ).rejects.toBeInstanceOf(SkillsApiError)
  })

  it('throws SkillsApiError with status 401 when no accessToken is passed', async () => {
    await expect(getSkill('grill-me')).rejects.toBeInstanceOf(SkillsApiError)
    await expect(getSkill('grill-me')).rejects.toMatchObject({ status: 401 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
