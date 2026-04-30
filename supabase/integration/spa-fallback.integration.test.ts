// Real-deploy integration tests for the Vercel SPA fallback.
//
// Without these, the only way to know the rewrite rule in `vercel.json`
// is correct is to manually open a deep link in production. The unit-
// test surface for a routing config is zero (the regex tests itself),
// so the regression we actually want to catch — "deep links 404 because
// SPA fallback was lost or the rewrite regex over-excluded paths" — can
// only be observed against a live deployment.
//
// Run via `npm run test:functions:integration`. Opt-in: this test
// suite hits the LIVE deployment and stays skipped unless `DEPLOY_URL`
// is explicitly set. That way CI on `dev` does not red-flag the suite
// while a fix is mid-flight (the prod deploy happens after `main`
// merges), and unit-test-only environments stay green.
//
// To run: `DEPLOY_URL=https://agenthub.lucasfe.com npm run test:functions:integration`.

import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts'

const DEPLOY_URL = Deno.env.get('DEPLOY_URL')
const SKIP = !DEPLOY_URL

const skipReason = 'DEPLOY_URL not set — skipping live SPA fallback tests.'
if (SKIP) console.warn(`[integration] ${skipReason}`)

async function head(path: string) {
  const res = await fetch(`${DEPLOY_URL}${path}`, {
    method: 'GET',
    redirect: 'manual',
    headers: { Accept: 'text/html,*/*' },
  })
  // Drain the body so the connection can close cleanly.
  await res.text()
  return { status: res.status, contentType: res.headers.get('content-type') || '' }
}

// ─── Client-side routes must be served as the SPA shell ─────────────────────
// Each of these should return 200 with text/html (the Vite-built index.html).
// If any returns 404, the SPA fallback rewrite is missing or the regex is
// excluding too much.

const SPA_ROUTES = [
  '/board',
  '/teams',
  '/skills',
  '/templates',
  '/mobile/chat',
  '/mobile/settings',
  '/mobile/login',
  '/agent/development-team/frontend-developer',
]

for (const route of SPA_ROUTES) {
  Deno.test({
    name: `integration · SPA fallback serves index.html for ${route}`,
    ignore: SKIP,
    async fn() {
      const { status, contentType } = await head(route)
      assertEquals(status, 200, `${route} returned ${status}; expected 200 from SPA fallback`)
      assertStringIncludes(
        contentType,
        'text/html',
        `${route} returned content-type "${contentType}"; expected text/html`,
      )
    },
  })
}

// ─── Static assets must NOT be rewritten ────────────────────────────────────
// These paths exist as real files in the build output and must be served
// directly with their proper content-type. If the rewrite regex catches
// them, the browser would receive index.html instead of the actual asset
// (manifest, icon, service worker, JS bundle), silently breaking the PWA.

Deno.test({
  name: 'integration · /manifest.webmanifest is served as JSON, not rewritten to HTML',
  ignore: SKIP,
  async fn() {
    const { status, contentType } = await head('/manifest.webmanifest')
    assertEquals(status, 200)
    assert(
      !contentType.includes('text/html'),
      `manifest.webmanifest returned content-type "${contentType}"; the rewrite regex is over-matching dotfiles`,
    )
  },
})

Deno.test({
  name: 'integration · /sw.js is served as JavaScript, not rewritten to HTML',
  ignore: SKIP,
  async fn() {
    const { status, contentType } = await head('/sw.js')
    assertEquals(status, 200)
    assert(
      !contentType.includes('text/html'),
      `sw.js returned content-type "${contentType}"; the service worker would break in production`,
    )
  },
})

Deno.test({
  name: 'integration · /icons/icon-192.png is served as PNG, not rewritten to HTML',
  ignore: SKIP,
  async fn() {
    const { status, contentType } = await head('/icons/icon-192.png')
    assertEquals(status, 200)
    assert(
      !contentType.includes('text/html'),
      `icon-192.png returned content-type "${contentType}"; the icons/ folder must be excluded from the rewrite`,
    )
  },
})

Deno.test({
  name: 'integration · /favicon.svg is served as SVG, not rewritten to HTML',
  ignore: SKIP,
  async fn() {
    const { status, contentType } = await head('/favicon.svg')
    assertEquals(status, 200)
    assert(
      !contentType.includes('text/html'),
      `favicon.svg returned content-type "${contentType}"; the rewrite regex is over-matching dotfiles`,
    )
  },
})
