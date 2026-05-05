// Real-API integration test for the HTML screenshot pipeline.
//
// Hits the real Browserless `/screenshot` endpoint when `BROWSERLESS_TEST_TOKEN`
// is set. Auto-skips otherwise so unit-test-only environments stay green.
//
// Required env vars:
//   BROWSERLESS_TEST_TOKEN — token with screenshot quota on chrome.browserless.io.
//                            Separate from BROWSERLESS_TOKEN (the runtime
//                            Edge Function secret) so a CI failure cannot
//                            exhaust the production quota.
//
// Scope: this test verifies that fetchBrowserlessPng can talk to the real
// upstream and gets back a PNG payload. It deliberately does NOT exercise
// the full captureHtmlToTaskOutput path because Storage RLS would require a
// real Supabase project; the local-only deep-module unit tests cover that
// branch end-to-end with a mocked client. Adding storage integration here
// is a separate slice (track via a follow-up issue).

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { fetchBrowserlessPng } from '../functions/_shared/htmlScreenshotter.ts'

const TOKEN = Deno.env.get('BROWSERLESS_TEST_TOKEN')
const SKIP = !TOKEN

const skipReason =
  'BROWSERLESS_TEST_TOKEN not set — skipping real Browserless integration tests.'
if (SKIP) console.warn(`[integration] ${skipReason}`)

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

Deno.test({
  name: 'integration · fetchBrowserlessPng renders <h1> at 800x600 (real Browserless)',
  ignore: SKIP,
  async fn() {
    const png = await fetchBrowserlessPng(TOKEN!, {
      html: '<!doctype html><html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><h1>integration test</h1></body></html>',
      width: 800,
      height: 600,
    })
    assert(png instanceof Uint8Array, 'response must be Uint8Array')
    assert(png.byteLength > 1000, `expected non-trivial PNG, got ${png.byteLength} bytes`)

    // Verify the PNG magic header (Browserless ignored our `type: 'png'`
    // request if this fails).
    for (let i = 0; i < PNG_MAGIC.length; i++) {
      assertEquals(
        png[i],
        PNG_MAGIC[i],
        `byte ${i}: expected 0x${PNG_MAGIC[i].toString(16)} (PNG magic), got 0x${png[i].toString(16)}`,
      )
    }
  },
})
