// Skills proxy. The catalog repo `lucasfe/skills` is private, so the browser
// cannot reach it directly. This function injects the existing `GITHUB_TOKEN`
// secret (already provisioned for the GitHub Issue Creator agent) and forwards
// requests to the GitHub Contents API. Two operations:
//
//   GET ?op=list                  -> JSON listing of top-level entries
//   GET ?op=raw&slug=<kebab>      -> raw text of <slug>/SKILL.md
//
// The frontend (`src/lib/skills.js`) parses listings and frontmatter — this
// function stays a thin HTTP forwarder.
//
// Auth: Supabase verifies the caller's JWT (verify_jwt: true) before this
// runs, so only signed-in app users can hit the proxy. The repo never needs
// to be public to make the catalog work.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const GITHUB_API = 'https://api.github.com'
const REPO = 'lucasfe/skills'
const VALID_SLUG = /^[a-zA-Z0-9_-]{1,80}$/

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
    const ghRes = await fetch(`${GITHUB_API}/repos/${REPO}/contents`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'agenthub-skills-proxy',
      },
    })
    const body = await ghRes.text()
    return new Response(body, {
      status: ghRes.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (op === 'raw') {
    const slug = url.searchParams.get('slug') || ''
    if (!VALID_SLUG.test(slug)) {
      return jsonResponse(
        { error: 'Invalid slug. Expected kebab-case alphanumeric.' },
        400,
      )
    }
    const ghRes = await fetch(
      `${GITHUB_API}/repos/${REPO}/contents/${encodeURIComponent(slug)}/SKILL.md`,
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

  return jsonResponse(
    { error: 'Unknown op. Use ?op=list or ?op=raw&slug=<slug>.' },
    400,
  )
})
