import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { listSkills, getSkill, SkillsApiError } from './skills'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://test.supabase.co'
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'anon-key'
const PROXY_BASE = `${SUPABASE_URL}/functions/v1/skills`
const ACCESS_TOKEN = 'test-access-token'

const LIST_URL = `${PROXY_BASE}?op=list`
const RAW_URL = (slug) => `${PROXY_BASE}?op=raw&slug=${slug}`

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

describe('listSkills — happy path', () => {
  it('lists folders, fetches each SKILL.md via the proxy, and returns the slim catalog shape', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url === LIST_URL) {
        return jsonResponse([
          { type: 'dir', name: 'grill-me' },
          { type: 'dir', name: 'to-prd' },
        ])
      }
      if (url === RAW_URL('grill-me')) {
        return textResponse(frontmatter('grill-me', 'Interview the user'))
      }
      if (url === RAW_URL('to-prd')) {
        return textResponse(frontmatter('to-prd', 'Turn context into a PRD'))
      }
      throw new Error(`unexpected url: ${url}`)
    })

    const skills = await listSkills({ accessToken: ACCESS_TOKEN })

    expect(skills).toEqual([
      {
        slug: 'grill-me',
        name: 'grill-me',
        description: 'Interview the user',
        sourceUrl: 'https://github.com/lucasfe/skills/tree/main/grill-me',
      },
      {
        slug: 'to-prd',
        name: 'to-prd',
        description: 'Turn context into a PRD',
        sourceUrl: 'https://github.com/lucasfe/skills/tree/main/to-prd',
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
  it('drops non-directory entries (e.g. a top-level README.md)', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url === LIST_URL) {
        return jsonResponse([
          { type: 'file', name: 'README.md' },
          { type: 'file', name: 'LICENSE' },
          { type: 'dir', name: 'tdd' },
        ])
      }
      if (url === RAW_URL('tdd')) {
        return textResponse(frontmatter('tdd', 'Test-driven development'))
      }
      throw new Error(`unexpected url: ${url}`)
    })

    const skills = await listSkills({ accessToken: ACCESS_TOKEN })

    expect(skills).toHaveLength(1)
    expect(skills[0].slug).toBe('tdd')
    expect(fetchMock).not.toHaveBeenCalledWith(RAW_URL('README.md'), expect.anything())
  })

  it('skips a folder without a SKILL.md (404) instead of crashing the catalog', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url === LIST_URL) {
        return jsonResponse([
          { type: 'dir', name: 'has-skill' },
          { type: 'dir', name: 'orphan' },
        ])
      }
      if (url === RAW_URL('has-skill')) {
        return textResponse(frontmatter('has-skill', 'A real skill'))
      }
      if (url === RAW_URL('orphan')) {
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
          { type: 'dir', name: 'good' },
          { type: 'dir', name: 'no-frontmatter' },
        ])
      }
      if (url === RAW_URL('good')) {
        return textResponse(frontmatter('good', 'Good skill'))
      }
      if (url === RAW_URL('no-frontmatter')) {
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
          { type: 'dir', name: 'no-name' },
          { type: 'dir', name: 'no-desc' },
        ])
      }
      if (url === RAW_URL('no-name')) {
        return textResponse('---\ndescription: only a description\n---\nbody')
      }
      if (url === RAW_URL('no-desc')) {
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
        return jsonResponse([{ type: 'dir', name: 'limited' }])
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

describe('getSkill', () => {
  it('exists as an exported function', () => {
    expect(typeof getSkill).toBe('function')
  })

  it('returns the skill with the rendered body, name, description, slug, and sourceUrl', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url === RAW_URL('grill-me')) {
        return textResponse(
          '---\nname: grill-me\ndescription: Interview the user\n---\n# Heading\n\nFull body here.',
        )
      }
      throw new Error(`unexpected url: ${url}`)
    })

    const skill = await getSkill('grill-me', { accessToken: ACCESS_TOKEN })

    expect(skill).toEqual({
      slug: 'grill-me',
      name: 'grill-me',
      description: 'Interview the user',
      body: '# Heading\n\nFull body here.',
      sourceUrl: 'https://github.com/lucasfe/skills/tree/main/grill-me',
    })
  })

  it('returns null when the slug is missing on the remote (404)', async () => {
    fetchMock.mockResolvedValue(new Response('Not Found', { status: 404 }))

    const skill = await getSkill('does-not-exist', { accessToken: ACCESS_TOKEN })

    expect(skill).toBeNull()
  })

  it('returns null for empty or non-string slugs without making a request', async () => {
    expect(await getSkill('', { accessToken: ACCESS_TOKEN })).toBeNull()
    expect(await getSkill(undefined, { accessToken: ACCESS_TOKEN })).toBeNull()
    expect(await getSkill(null, { accessToken: ACCESS_TOKEN })).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns null when SKILL.md exists but has no frontmatter', async () => {
    fetchMock.mockImplementation(async () =>
      textResponse('# just a heading\n\nbody only, no frontmatter'),
    )

    const skill = await getSkill('no-frontmatter', { accessToken: ACCESS_TOKEN })

    expect(skill).toBeNull()
  })

  it('returns null when the frontmatter is missing name or description', async () => {
    fetchMock.mockImplementation(async () =>
      textResponse('---\nname: only-a-name\n---\nbody'),
    )

    const skill = await getSkill('no-desc', { accessToken: ACCESS_TOKEN })

    expect(skill).toBeNull()
  })

  it('throws a SkillsApiError on 403', async () => {
    fetchMock.mockResolvedValue(new Response('rate limited', { status: 403 }))

    await expect(
      getSkill('grill-me', { accessToken: ACCESS_TOKEN }),
    ).rejects.toBeInstanceOf(SkillsApiError)
    await expect(
      getSkill('grill-me', { accessToken: ACCESS_TOKEN }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('throws a SkillsApiError on 5xx', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 503 }))

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
