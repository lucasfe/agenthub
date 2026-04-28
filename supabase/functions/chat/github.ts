// GitHub REST API client for the chat Edge Function.
//
// Deep, narrow module: knows everything about talking to GitHub (URL building,
// auth + accept headers, JSON parsing, surfacing non-2xx as typed errors with
// the GitHub error message intact). Does NOT read tokens or any global state —
// the token is always passed in as the first argument so a future swap to a
// GitHub App or OAuth flow is a one-module change.

const GITHUB_API_BASE = 'https://api.github.com'
const ACCEPT_HEADER = 'application/vnd.github+json'

export interface GithubRepo {
  // Raw upstream shape — the filter module narrows this to the slim view the
  // LLM reasons about. Keeping the type loose here avoids drifting from
  // GitHub's actual response surface.
  name: string
  full_name: string
  description: string | null
  pushed_at: string
  archived: boolean
  fork: boolean
  size: number
  [key: string]: unknown
}

export interface CreateIssueResult {
  url: string
  number: number
}

function assertToken(token: unknown): asserts token is string {
  if (typeof token !== 'string' || token.trim().length === 0) {
    throw new Error('GitHub token is required.')
  }
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: ACCEPT_HEADER,
  }
}

async function extractGithubError(res: Response): Promise<string> {
  try {
    const data = await res.json()
    if (data && typeof data.message === 'string' && data.message.length > 0) {
      return data.message
    }
    return JSON.stringify(data)
  } catch {
    try {
      return await res.text()
    } catch {
      return ''
    }
  }
}

export async function listRepos(token: string): Promise<GithubRepo[]> {
  assertToken(token)
  const url =
    `${GITHUB_API_BASE}/user/repos` +
    `?affiliation=owner&sort=pushed&per_page=50`
  const res = await fetch(url, { headers: authHeaders(token) })
  if (!res.ok) {
    const message = await extractGithubError(res)
    throw new Error(`GitHub listRepos failed (${res.status}): ${message}`)
  }
  const data = await res.json()
  if (!Array.isArray(data)) {
    throw new Error('GitHub listRepos returned a non-array response.')
  }
  return data as GithubRepo[]
}

export async function createIssue(
  token: string,
  repo: string,
  title: string,
  body: string,
): Promise<CreateIssueResult> {
  assertToken(token)
  if (typeof repo !== 'string' || repo.trim().length === 0) {
    throw new Error('repo is required (expected "owner/name").')
  }
  if (typeof title !== 'string' || title.trim().length === 0) {
    throw new Error('title is required.')
  }
  if (typeof body !== 'string' || body.length === 0) {
    throw new Error('body is required.')
  }
  const url = `${GITHUB_API_BASE}/repos/${repo}/issues`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...authHeaders(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title, body }),
  })
  if (!res.ok) {
    const message = await extractGithubError(res)
    throw new Error(`GitHub createIssue failed (${res.status}): ${message}`)
  }
  const data = await res.json()
  if (!data || typeof data.html_url !== 'string' || typeof data.number !== 'number') {
    throw new Error('GitHub createIssue returned an unexpected response shape.')
  }
  return { url: data.html_url, number: data.number }
}
