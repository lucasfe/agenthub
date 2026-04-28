import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { listSkills, SkillsApiError } from './skills'

const LIST_URL = 'https://api.github.com/repos/lucasfe/skills/contents'
const SKILL_URL = (slug) =>
  `https://api.github.com/repos/lucasfe/skills/contents/${slug}/SKILL.md`

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
  it('lists folders, fetches each SKILL.md, and returns the slim catalog shape', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url === LIST_URL) {
        return jsonResponse([
          { type: 'dir', name: 'grill-me' },
          { type: 'dir', name: 'to-prd' },
        ])
      }
      if (url === SKILL_URL('grill-me')) {
        return textResponse(frontmatter('grill-me', 'Interview the user'))
      }
      if (url === SKILL_URL('to-prd')) {
        return textResponse(frontmatter('to-prd', 'Turn context into a PRD'))
      }
      throw new Error(`unexpected url: ${url}`)
    })

    const skills = await listSkills()

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

  it('uses the GitHub Contents API URL with the JSON accept header for the listing call', async () => {
    fetchMock.mockResolvedValue(jsonResponse([]))

    await listSkills()

    expect(fetchMock).toHaveBeenCalledWith(
      LIST_URL,
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: 'application/vnd.github+json' }),
      }),
    )
  })

  it('does not send an Authorization header when no token is provided (v1)', async () => {
    fetchMock.mockResolvedValue(jsonResponse([]))

    await listSkills()

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers.Authorization).toBeUndefined()
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
      if (url === SKILL_URL('tdd')) {
        return textResponse(frontmatter('tdd', 'Test-driven development'))
      }
      throw new Error(`unexpected url: ${url}`)
    })

    const skills = await listSkills()

    expect(skills).toHaveLength(1)
    expect(skills[0].slug).toBe('tdd')
    expect(fetchMock).not.toHaveBeenCalledWith(SKILL_URL('README.md'), expect.anything())
  })

  it('skips a folder without a SKILL.md (404) instead of crashing the catalog', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url === LIST_URL) {
        return jsonResponse([
          { type: 'dir', name: 'has-skill' },
          { type: 'dir', name: 'orphan' },
        ])
      }
      if (url === SKILL_URL('has-skill')) {
        return textResponse(frontmatter('has-skill', 'A real skill'))
      }
      if (url === SKILL_URL('orphan')) {
        return new Response('Not Found', { status: 404 })
      }
      throw new Error(`unexpected url: ${url}`)
    })

    const skills = await listSkills()

    expect(skills.map((s) => s.slug)).toEqual(['has-skill'])
  })

  it('skips a SKILL.md without frontmatter (consistent with the loader behavior)', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url === LIST_URL) {
        return jsonResponse([
          { type: 'dir', name: 'good' },
          { type: 'dir', name: 'no-frontmatter' },
        ])
      }
      if (url === SKILL_URL('good')) {
        return textResponse(frontmatter('good', 'Good skill'))
      }
      if (url === SKILL_URL('no-frontmatter')) {
        return textResponse('# just a heading\n\nbody only, no frontmatter')
      }
      throw new Error(`unexpected url: ${url}`)
    })

    const skills = await listSkills()

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
      if (url === SKILL_URL('no-name')) {
        return textResponse('---\ndescription: only a description\n---\nbody')
      }
      if (url === SKILL_URL('no-desc')) {
        return textResponse('---\nname: only-a-name\n---\nbody')
      }
      throw new Error(`unexpected url: ${url}`)
    })

    const skills = await listSkills()

    expect(skills).toEqual([])
  })
})

describe('listSkills — error surfacing', () => {
  it('throws a SkillsApiError on 403 (rate limit) when listing folders', async () => {
    fetchMock.mockResolvedValue(
      new Response('rate limited', { status: 403 }),
    )

    await expect(listSkills()).rejects.toBeInstanceOf(SkillsApiError)
    await expect(listSkills()).rejects.toMatchObject({ status: 403 })
  })

  it('throws a SkillsApiError on 5xx when listing folders', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 503 }))

    await expect(listSkills()).rejects.toBeInstanceOf(SkillsApiError)
    await expect(listSkills()).rejects.toMatchObject({ status: 503 })
  })

  it('throws a SkillsApiError on 403 when fetching an individual SKILL.md', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url === LIST_URL) {
        return jsonResponse([{ type: 'dir', name: 'limited' }])
      }
      return new Response('rate limited', { status: 403 })
    })

    await expect(listSkills()).rejects.toBeInstanceOf(SkillsApiError)
  })

  it('throws a SkillsApiError when the listing response is not an array', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'unexpected' }))

    await expect(listSkills()).rejects.toBeInstanceOf(SkillsApiError)
  })
})
