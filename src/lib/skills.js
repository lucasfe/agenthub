// Client for the `lucasfe/skills` catalog.
//
// The repo is private, so the browser cannot reach the GitHub API directly.
// Both calls go through the `skills` Supabase Edge Function, which injects
// the existing `GITHUB_TOKEN` secret server-side. Callers must pass the
// authenticated user's `accessToken` (Supabase session token) so the
// function's JWT gate accepts the call — there is no anonymous mode.
//
// This module only knows about reaching the proxy and parsing what comes
// back. Frontmatter parsing is delegated to `./skillFrontmatter.js`.

import { parseFrontmatter } from './skillFrontmatter.js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const PROXY_PATH = '/functions/v1/skills'
const REPO_OWNER = 'lucasfe'
const REPO_NAME = 'skills'
const REPO = `${REPO_OWNER}/${REPO_NAME}`

export class SkillsApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'SkillsApiError'
    this.status = status
  }
}

function buildProxyUrl(op, params = {}) {
  const url = new URL(`${SUPABASE_URL}${PROXY_PATH}`)
  url.searchParams.set('op', op)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return url.toString()
}

function buildHeaders(accessToken) {
  if (!accessToken) {
    throw new SkillsApiError(
      'Skills proxy requires an authenticated session. Sign in first.',
      401,
    )
  }
  return {
    Authorization: `Bearer ${accessToken}`,
    apikey: ANON_KEY,
  }
}

export async function listSkills(options = {}) {
  const { accessToken } = options
  const headers = buildHeaders(accessToken)
  const res = await fetch(buildProxyUrl('list'), { headers })
  if (!res.ok) {
    throw new SkillsApiError(`Failed to list skills (${res.status}).`, res.status)
  }
  const entries = await res.json()
  if (!Array.isArray(entries)) {
    throw new SkillsApiError('Proxy returned an unexpected response shape.', 502)
  }
  const folders = entries.filter(
    (entry) => entry && entry.type === 'dir' && typeof entry.name === 'string',
  )
  const skills = []
  for (const folder of folders) {
    const skill = await fetchSkillForFolder(folder.name, accessToken)
    if (skill) skills.push(skill)
  }
  return skills
}

async function fetchSkillForFolder(slug, accessToken) {
  const headers = buildHeaders(accessToken)
  const res = await fetch(buildProxyUrl('raw', { slug }), { headers })
  if (res.status === 404) return null
  if (!res.ok) {
    if (res.status === 403 || res.status >= 500) {
      throw new SkillsApiError(
        `Failed to fetch SKILL.md for "${slug}" (${res.status}).`,
        res.status,
      )
    }
    return null
  }
  const text = await res.text()
  const parsed = parseFrontmatter(text)
  if (!parsed) return null
  const name = typeof parsed.name === 'string' ? parsed.name.trim() : ''
  const description = typeof parsed.description === 'string' ? parsed.description.trim() : ''
  if (!name || !description) return null
  return {
    slug,
    name,
    description,
    sourceUrl: `https://github.com/${REPO}/tree/main/${slug}`,
  }
}

export async function getSkill(slug, options = {}) {
  if (typeof slug !== 'string' || slug.length === 0) return null
  const { accessToken } = options
  const headers = buildHeaders(accessToken)
  const res = await fetch(buildProxyUrl('raw', { slug }), { headers })
  if (res.status === 404) return null
  if (!res.ok) {
    throw new SkillsApiError(
      `Failed to fetch SKILL.md for "${slug}" (${res.status}).`,
      res.status,
    )
  }
  const text = await res.text()
  const parsed = parseFrontmatter(text)
  if (!parsed) return null
  const name = typeof parsed.name === 'string' ? parsed.name.trim() : ''
  const description = typeof parsed.description === 'string' ? parsed.description.trim() : ''
  if (!name || !description) return null
  return {
    slug,
    name,
    description,
    body: typeof parsed.body === 'string' ? parsed.body : '',
    sourceUrl: `https://github.com/${REPO}/tree/main/${slug}`,
  }
}
