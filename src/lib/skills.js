// Client for the `lucasfe/skills` catalog.
//
// The repo is private, so the browser cannot reach the GitHub API directly.
// Both calls go through the `skills` Supabase Edge Function, which injects
// the existing `GITHUB_TOKEN` secret server-side. Callers must pass the
// authenticated user's `accessToken` (Supabase session token) so the
// function's JWT gate accepts the call — there is no anonymous mode.
//
// The skills repo organizes skills under category folders at the root
// (e.g. `development/<slug>/SKILL.md`, `meta/<slug>/SKILL.md`). The proxy
// returns the flat catalog `{ slug, category, path }[]`; this module fetches
// each `SKILL.md` via `?op=raw&category=<cat>&slug=<slug>` and parses the
// frontmatter. Categories and slugs are discovered, never hard-coded.

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

function sourceUrlFor(category, slug) {
  return `https://github.com/${REPO}/tree/main/${category}/${slug}`
}

async function fetchCatalog(accessToken) {
  const headers = buildHeaders(accessToken)
  const res = await fetch(buildProxyUrl('list'), { headers })
  if (!res.ok) {
    throw new SkillsApiError(`Failed to list skills (${res.status}).`, res.status)
  }
  const entries = await res.json()
  if (!Array.isArray(entries)) {
    throw new SkillsApiError('Proxy returned an unexpected response shape.', 502)
  }
  return entries.filter(
    (entry) =>
      entry &&
      typeof entry.slug === 'string' &&
      entry.slug.length > 0 &&
      typeof entry.category === 'string' &&
      entry.category.length > 0,
  )
}

async function fetchSkillFile(category, slug, accessToken) {
  const headers = buildHeaders(accessToken)
  const res = await fetch(buildProxyUrl('raw', { category, slug }), { headers })
  if (res.status === 404) return { status: 404, parsed: null }
  if (!res.ok) {
    throw new SkillsApiError(
      `Failed to fetch SKILL.md for "${category}/${slug}" (${res.status}).`,
      res.status,
    )
  }
  const text = await res.text()
  return { status: 200, parsed: parseFrontmatter(text) }
}

function extractNameAndDescription(parsed) {
  if (!parsed) return null
  const name = typeof parsed.name === 'string' ? parsed.name.trim() : ''
  const description =
    typeof parsed.description === 'string' ? parsed.description.trim() : ''
  if (!name || !description) return null
  return { name, description }
}

export async function listSkills(options = {}) {
  const { accessToken } = options
  const entries = await fetchCatalog(accessToken)
  const skills = []
  for (const entry of entries) {
    const { slug, category } = entry
    const { parsed } = await fetchSkillFile(category, slug, accessToken)
    const meta = extractNameAndDescription(parsed)
    if (!meta) continue
    skills.push({
      slug,
      category,
      name: meta.name,
      description: meta.description,
      sourceUrl: sourceUrlFor(category, slug),
    })
  }
  return skills
}

export async function getSkill(slug, options = {}) {
  if (typeof slug !== 'string' || slug.length === 0) return null
  const { accessToken } = options
  const entries = await fetchCatalog(accessToken)
  const entry = entries.find((e) => e.slug === slug)
  if (!entry) return null
  const { parsed } = await fetchSkillFile(entry.category, slug, accessToken)
  const meta = extractNameAndDescription(parsed)
  if (!meta) return null
  return {
    slug,
    category: entry.category,
    name: meta.name,
    description: meta.description,
    body: typeof parsed.body === 'string' ? parsed.body : '',
    sourceUrl: sourceUrlFor(entry.category, slug),
  }
}
