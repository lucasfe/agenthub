// Skills proxy. The catalog repo `lucasfe/skills` is private, so the browser
// cannot reach it directly. This function injects the existing `GITHUB_TOKEN`
// secret (already provisioned for the GitHub Issue Creator agent) and forwards
// requests to the GitHub API.
//
// Skills live at `<category>/<slug>/SKILL.md` in the catalog repo (e.g.
// `development/tdd/SKILL.md`). Categories and slugs are discovered from the
// repo tree — neither is hard-coded here or in the frontend client.
//
//   GET ?op=list
//     -> JSON array `{ slug, category, path }[]`. Built from the repo's
//        recursive Git tree, filtered to entries matching
//        `<category>/<slug>/SKILL.md`. Hidden categories/slugs (segments
//        starting with `.`) are skipped.
//
//   GET ?op=raw&category=<category>&slug=<slug>
//     -> Raw text of `<category>/<slug>/SKILL.md`. Both params are required
//        and validated against the same kebab-case regex.
//
// Auth: Supabase verifies the caller's JWT (verify_jwt: true) before this
// runs, so only signed-in app users can hit the proxy. The repo never needs
// to be public to make the catalog work.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { extractSkillEntries } from './skillsTree.ts'

const GITHUB_API = 'https://api.github.com'
const REPO = 'lucasfe/skills'
const REPO_BRANCH = 'main'
const VALID_SEGMENT = /^[a-zA-Z0-9_-]{1,80}$/

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function handleList(token: string): Promise<Response> {
  const treeUrl = `${GITHUB_API}/repos/${REPO}/git/trees/${REPO_BRANCH}?recursive=1`
  const ghRes = await fetch(treeUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'agenthub-skills-proxy',
    },
  })
  if (!ghRes.ok) {
    const text = await ghRes.text()
    return new Response(text, {
      status: ghRes.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  let payload: unknown
  try {
    payload = await ghRes.json()
  } catch {
    return jsonResponse({ error: 'Upstream returned malformed JSON.' }, 502)
  }
  const entries = extractSkillEntries(payload)
  return jsonResponse(entries)
}

async function handleRaw(
  token: string,
  category: string,
  slug: string,
): Promise<Response> {
  const ghRes = await fetch(
    `${GITHUB_API}/repos/${REPO}/contents/${encodeURIComponent(category)}/${encodeURIComponent(slug)}/SKILL.md`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.raw',
        'User-Agent': 'agenthub-skills-proxy',
      },
    },
  )
  const body = await ghRes.text()
  return new Response(body, {
    status: ghRes.status,
    headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const token = Deno.env.get('GITHUB_TOKEN')
  if (!token) {
    return jsonResponse(
      { error: 'GITHUB_TOKEN is not configured in the Edge Function secrets.' },
      500,
    )
  }

  const url = new URL(req.url)
  const op = url.searchParams.get('op')

  if (op === 'list') {
    return await handleList(token)
  }

  if (op === 'raw') {
    const category = url.searchParams.get('category') || ''
    const slug = url.searchParams.get('slug') || ''
    if (!VALID_SEGMENT.test(category) || !VALID_SEGMENT.test(slug)) {
      return jsonResponse(
        {
          error:
            'Invalid params. Expected kebab-case alphanumeric for both category and slug.',
        },
        400,
      )
    }
    return await handleRaw(token, category, slug)
  }

  return jsonResponse(
    {
      error:
        'Unknown op. Use ?op=list or ?op=raw&category=<category>&slug=<slug>.',
    },
    400,
  )
})
