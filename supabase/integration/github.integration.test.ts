// Real-API integration tests for the GitHub Issue Creator agent.
//
// These tests hit `api.github.com` for real and exist to catch contract
// regressions that mocked unit tests cannot detect (e.g. mutually-exclusive
// query params, header changes, response shape drift).
//
// Run via `npm run test:functions:integration`. Auto-skips when
// `GH_TEST_TOKEN` is not set, so unit-test-only environments stay green.
//
// Required env vars:
//   GH_TEST_TOKEN — fine-grained PAT with Issues read+write on the test
//                       repo, plus Metadata read.
//   GH_TEST_REPO  — `owner/name` of a sandbox repo. Defaults to
//                       `lucasfe/agenthub`. Issues created here are auto-closed
//                       at the end of the test, but they remain in the repo's
//                       history as closed.

import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { createIssue, listRepos } from '../functions/chat/github.ts'
import { filterAndSlim } from '../functions/chat/githubFilters.ts'

const TOKEN = Deno.env.get('GH_TEST_TOKEN')
const REPO = Deno.env.get('GH_TEST_REPO') || 'lucasfe/agenthub'
const SKIP = !TOKEN

const skipReason =
  'GH_TEST_TOKEN not set — skipping real GitHub API integration tests.'
if (SKIP) console.warn(`[integration] ${skipReason}`)

Deno.test({
  name: 'integration · listRepos returns a non-empty array (real GitHub API)',
  ignore: SKIP,
  async fn() {
    const repos = await listRepos(TOKEN!)
    assert(Array.isArray(repos), 'listRepos must return an array')
    assert(repos.length > 0, 'listRepos returned an empty array — token has no owned repos?')
    // Sanity-check the upstream shape we depend on downstream.
    const first = repos[0]
    assertEquals(typeof first.name, 'string')
    assertEquals(typeof first.full_name, 'string')
    assertEquals(typeof first.pushed_at, 'string')
  },
})

Deno.test({
  name: 'integration · filterAndSlim survives the real upstream payload',
  ignore: SKIP,
  async fn() {
    const repos = await listRepos(TOKEN!)
    const slim = filterAndSlim(repos)
    // Slim list might be 0 (all archived/forks) or >0; we just want to verify
    // the filter does not throw on the live shape.
    assert(Array.isArray(slim))
    for (const r of slim) {
      assertEquals(typeof r.name, 'string')
      assertEquals(typeof r.full_name, 'string')
      assertEquals(typeof r.pushed_at, 'string')
      assert(
        r.description === null || typeof r.description === 'string',
        'description must be string or null',
      )
    }
  },
})

Deno.test({
  name: 'integration · createIssue creates a real issue and we delete it (real GitHub API)',
  ignore: SKIP,
  async fn() {
    const stamp = new Date().toISOString()
    const title = `[integration-test] github.ts createIssue smoke ${stamp}`
    const body =
      'This issue was created by the automated integration test suite ' +
      `(supabase/integration/github.integration.test.ts) at ${stamp}. ` +
      'It is hard-deleted via GraphQL at the end of the test. If you see ' +
      'this issue lingering open, the cleanup mutation failed — check that ' +
      "the test PAT has Issues: Read+Write on the test repo and that the " +
      'token owner is a repo admin (deleteIssue requires admin).'

    const created = await createIssue(TOKEN!, REPO, title, body)
    assertEquals(typeof created.number, 'number')
    assert(created.url.startsWith(`https://github.com/${REPO}/issues/`))

    // Fetch the issue's GraphQL global ID (REST `node_id`).
    const getRes = await fetch(
      `https://api.github.com/repos/${REPO}/issues/${created.number}`,
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Accept: 'application/vnd.github+json',
        },
      },
    )
    if (!getRes.ok) {
      const text = await getRes.text().catch(() => '')
      throw new Error(
        `Failed to fetch node_id for test issue #${created.number}: ${getRes.status} ${text.slice(0, 200)}`,
      )
    }
    const issue = await getRes.json()
    const nodeId: string = issue.node_id
    assertEquals(typeof nodeId, 'string')

    // Hard-delete via GraphQL `deleteIssue` mutation (REST has no delete).
    // Requires Issues:write on the repo AND the token owner being a repo
    // admin (or the repo's "Allow issue deletion" setting enabled).
    const gqlRes = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query:
          'mutation($id: ID!) { deleteIssue(input: { issueId: $id }) { repository { name } } }',
        variables: { id: nodeId },
      }),
    })
    if (!gqlRes.ok) {
      const text = await gqlRes.text().catch(() => '')
      throw new Error(
        `Failed to delete test issue #${created.number} via GraphQL: ${gqlRes.status} ${text.slice(0, 200)}`,
      )
    }
    const gqlBody = await gqlRes.json()
    if (gqlBody.errors) {
      throw new Error(
        `GraphQL deleteIssue returned errors for #${created.number}: ${JSON.stringify(gqlBody.errors).slice(0, 300)}`,
      )
    }
  },
})
