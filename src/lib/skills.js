// GitHub Contents API client for the `lucasfe/skills` catalog.
//
// Deep, narrow module: knows everything about reaching the skills repo (URL
// building, accept headers, listing folders, fetching SKILL.md, and surfacing
// rate-limit / server errors as a typed error). Returns the slim shape the
// `/skills` page renders — no caller needs to understand the GitHub API or the
// frontmatter format.
//
// v1 is unauthenticated (the repo is public, the 60 req/hr limit is fine for a
// single-user catalog). The internal `requestJson` / `requestText` helpers
// already attach an `Authorization` header when a token is provided, so a
// future migration to an Edge Function proxy that forwards the existing
// `GITHUB_TOKEN` secret is a one-line change at the call sites.

import { parseFrontmatter } from './skillFrontmatter.js'

const GITHUB_API_BASE = 'https://api.github.com'
const REPO_OWNER = 'lucasfe'
const REPO_NAME = 'skills'
const REPO = `${REPO_OWNER}/${REPO_NAME}`
const ACCEPT_JSON = 'application/vnd.github+json'
const ACCEPT_RAW = 'application/vnd.github.raw'

export class SkillsApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'SkillsApiError'
    this.status = status
  }
}

export async function listSkills(options = {}) {
  const { token } = options
  const entries = await requestJson(
    `${GITHUB_API_BASE}/repos/${REPO}/contents`,
    token,
    'list skills',
  )
  if (!Array.isArray(entries)) {
    throw new SkillsApiError('GitHub returned an unexpected response shape.', 502)
  }
  const folders = entries.filter(
    (entry) => entry && entry.type === 'dir' && typeof entry.name === 'string',
  )
  const skills = []
  for (const folder of folders) {
    const skill = await fetchSkillForFolder(folder.name, token)
    if (skill) skills.push(skill)
  }
  return skills
}

async function fetchSkillForFolder(slug, token) {
  const url = `${GITHUB_API_BASE}/repos/${REPO}/contents/${encodeURIComponent(slug)}/SKILL.md`
  const res = await fetch(url, { headers: buildHeaders(ACCEPT_RAW, token) })
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
  const { token } = options
  const url = `${GITHUB_API_BASE}/repos/${REPO}/contents/${encodeURIComponent(slug)}/SKILL.md`
  const res = await fetch(url, { headers: buildHeaders(ACCEPT_RAW, token) })
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

async function requestJson(url, token, label) {
  const res = await fetch(url, { headers: buildHeaders(ACCEPT_JSON, token) })
  if (!res.ok) {
    if (res.status === 403 || res.status >= 500) {
      throw new SkillsApiError(
        `Failed to ${label} (${res.status}).`,
        res.status,
      )
    }
    throw new SkillsApiError(
      `Failed to ${label} (${res.status}).`,
      res.status,
    )
  }
  return res.json()
}

function buildHeaders(accept, token) {
  const headers = { Accept: accept }
  if (typeof token === 'string' && token.length > 0) {
    headers.Authorization = `Bearer ${token}`
  }
  return headers
}
