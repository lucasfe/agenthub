# Features — agents, skills, board sync, web research

Reference documentation for the app's tool-bound agents and chat/board features. For the agent catalog data model see [architecture.md](architecture.md).

## GitHub Issue Creator agent

The `github-issue-creator` agent turns a free-text chat description into a GitHub issue in one of Lucas's owned repositories, with explicit user approval before the issue is created. It lives in the **AI Specialists** catalog category and is consumed via the existing AI Assistant chat — no new UI surface.

### Tools

The agent calls two tools, both registered in `supabase/functions/chat/executor.ts`'s `TOOL_HANDLERS` registry:

- **`list_github_repos`** — read-only. No parameters. Fetches the live list of repos Lucas owns from the GitHub REST API, slimmed to `{ name, full_name, description, pushed_at }`. `requires_approval: false`. The system prompt instructs the agent to call this exactly once at the start of every new conversation so it grounds itself in the current repo set rather than stale model memory.
- **`create_github_issue`** — write. Parameters: `repo` (`owner/name` string), `title` (string), `body` (Markdown string). Creates the issue and returns `{ url, number }`. **`requires_approval: true`** on the row in the `tools` table, which makes the existing chat approval gate pause execution and render a one-click "Approve" button before the call goes out. There is no way to bypass the approval from the agent side.

The two `tools` rows and the `agents` row that wires them to `github-issue-creator` are seeded in [`supabase/seed-tools.sql`](../supabase/seed-tools.sql). The agent's catalog card and system prompt are stored in the Supabase `agents` table (single source of truth); seeding happens via the same `seed-tools.sql` row, which is idempotent (`ON CONFLICT DO UPDATE`).

### Module layout

The Edge Function side of the agent is split into deep modules so the executor stays thin:

- `supabase/functions/chat/github.ts` — HTTP client. Two functions (`listRepos`, `createIssue`) wrap `fetch` with the right URL, headers (`Authorization: Bearer <token>`, `Accept: application/vnd.github+json`), and error surfacing. Both take the token as the first argument; neither reads global state, so the client is straightforward to mock and easy to swap for a GitHub App or OAuth flow later.
- `supabase/functions/chat/githubFilters.ts` — pure function. Drops `archived`, `fork`, and empty (`size === 0`) repos and maps each survivor to the slim shape returned to the LLM. No side effects, fully unit-tested.
- `supabase/functions/chat/executor.ts` — registers the two tool handlers in `TOOL_HANDLERS` and reads `GITHUB_TOKEN` from the Edge Function environment. If the secret is unset, both handlers return a structured "tool unavailable" error string the LLM can surface to the user instead of producing a confusing fetch failure.

Tests for all three modules live alongside the source as `*.test.ts` and run via `npm run test:functions`.

### Required Edge Function secret

| Variable | Required | Notes |
|---|---|---|
| `GITHUB_TOKEN` | Yes (for this agent only) | Fine-grained Personal Access Token with the `repo` scope. Set as a Supabase Edge Function secret, not a Vercel env var or a frontend var. The agent is non-functional until this secret is set; both tool handlers fail fast with a clear "missing GITHUB_TOKEN" message. Setup steps live in the manual `do-not-ralph` issue [#48](https://github.com/lucasfe/agenthub/issues/48), not in code, so the token can be rotated without a redeploy. |

### Extending in v2

The v1 tool surface is intentionally minimal (`repo`, `title`, `body` only). When demand is demonstrated, follow-up PRDs can:

- add `labels`, `assignees`, or `milestones` to the `create_github_issue` input schema and handler;
- pull issue templates from `.github/ISSUE_TEMPLATE/` to scaffold the body;
- migrate from a single-user PAT to a GitHub App or per-user OAuth flow (the deep `github.ts` module is the seam — callers do not need to change);
- broaden the GitHub `affiliation` query param from `owner` to include `collaborator` and `organization_member`;
- wire the agent into the orchestration board so the plan-and-execute mode can file issues automatically.

Each of these is its own PRD; do not bundle them onto the existing surface without a fresh decision.

## Skills

The Skills section is a separate catalog (alongside Agents and Teams) for reusable Claude Code skills. Cards are rendered live from a public source-of-truth repo: [`lucasfe/skills`](https://github.com/lucasfe/skills). Each top-level folder in that repo is a skill; the folder must contain a `SKILL.md` whose YAML frontmatter declares `name` and `description`. Folders without a valid `SKILL.md` are silently skipped, so the repo can hold work-in-progress directories without breaking the catalog.

### Routes

- `/skills` — catalog page (`src/components/SkillsPage.jsx`). Lists every valid skill from the source repo as cards (`src/components/SkillCard.jsx`). Live fetch on every visit — there is no client-side cache in v1.
- `/skills/[slug]` — detail page (`src/components/SkillDetailPage.jsx`). Renders the skill's `SKILL.md` body and the install command. The `slug` segment is the folder name in the source repo, which is also the local install path under `~/.claude/skills/<slug>`.

Both routes are gated by `RequireAuth`, like every other private page.

### Deep modules

The Skills feature follows the same deep-module pattern as the GitHub Issue Creator agent — narrow, well-tested modules with clear seams:

- `src/lib/skills.js` — GitHub Contents API client. Exports `listSkills()` (returns the slim `{ slug, name, description, sourceUrl }[]` shape used by the catalog) and `getSkill(slug)` (returns the same plus `body` for the detail page). Knows everything about reaching `lucasfe/skills`: URL building, accept headers (`application/vnd.github+json` for listings, `application/vnd.github.raw` for `SKILL.md` bodies), and error surfacing as a `SkillsApiError` with the upstream HTTP status. Callers do not need to understand the GitHub API.
- `src/lib/skillFrontmatter.js` — pure parser for the YAML frontmatter block at the top of a `SKILL.md` file. Zero new dependencies, zero I/O. Returns the parsed frontmatter merged with the raw markdown body, or `null` when the block is missing or malformed. Only `name` and `description` are read by the catalog in v1; extra optional keys pass through untouched so future readers can consume them without changing the parser.

Tests live next to each module as `skills.test.js` / `skillFrontmatter.test.js` and run via `npm test`.

### Skill Creator agent

The `skill-creator` agent (catalog category **AI Specialists**, icon `Wand2`, color `cyan`) interviews the user about a new skill, then files a structured GitHub issue against `lucasfe/skills` containing a ready-to-paste `SKILL.md`. It does not commit code or open PRs — humans (or another loop) act on the issue.

- Hardcoded target repo: `lucasfe/skills`. The system prompt embeds this so the LLM cannot mis-target another repo.
- Tool dependency: reuses the existing `create_github_issue` tool from the GitHub Issue Creator agent. It is the only tool the agent declares (no `list_github_repos` — there is nothing to choose). Approval gating, error handling, and the `GITHUB_TOKEN` Edge Function secret are inherited from that feature unchanged.
- The agent's catalog card and system prompt live in the Supabase `agents` table; the row is seeded in `supabase/seed-tools.sql` (`id: "skill-creator"`).

### Install flow

The detail page renders the install command for the displayed skill:

```
npx degit --mode=git lucasfe/skills/<slug> ~/.claude/skills/<slug>
```

`degit` clones a single subfolder of the source repo into the user's local `~/.claude/skills/` directory without bringing along Git history. The `--mode=git` flag is required because `lucasfe/skills` is private — the default tarball mode is unauthenticated and 404s on private repos. With `--mode=git`, `degit` shells out to `git clone --depth 1` and reuses the user's local SSH/HTTPS git auth, then extracts the requested subfolder. There is nothing else to "install" — the skill is just the contents of that folder.

### Edge Function proxy

`lucasfe/skills` is a private repo, so the browser cannot reach the GitHub API directly. All skills traffic is proxied by the `skills` Edge Function (`supabase/functions/skills/index.ts`) which injects the existing `GITHUB_TOKEN` secret server-side. The frontend module `src/lib/skills.js` calls the proxy with the user's Supabase session token — there is no anonymous mode.

**Two operations:**

- `GET /functions/v1/skills?op=list` — returns the JSON listing of top-level entries from the repo (passes through the GitHub Contents API response verbatim).
- `GET /functions/v1/skills?op=raw&slug=<kebab>` — returns the raw text of `<slug>/SKILL.md`. The slug is validated against `^[a-zA-Z0-9_-]{1,80}$` before being forwarded.

**Auth:**

- The function is deployed with `verify_jwt: true`, so Supabase rejects unauthenticated callers before the function runs.
- `listSkills({ accessToken })` and `getSkill(slug, { accessToken })` both throw `SkillsApiError` with status 401 when no `accessToken` is passed — the frontend reads `session?.access_token` from `useAuth()` and forwards it.
- The `GITHUB_TOKEN` Edge Function secret is the same one used by the GitHub Issue Creator agent. No new secret to provision.

**Why a proxy and not unauthenticated public-repo fetch?** The skills repo is intentionally private (it contains personal workflow notes, not just public-skill source). Routing through the function keeps the catalog visible to authenticated app users while keeping the upstream repo private.

## AI Assistant ↔ Kanban board sync

Plans created inside the AI Assistant chat (the planner branch that emits `plan.proposed`) are mirrored as rows in the Supabase `tasks` table so the user sees the same work on the `/board` page. The mirror is one-directional and stateless: chat is the source of truth, the board reflects whatever the chat last reported.

### Lifecycle mapping

| Chat event                              | Board task field update                              | Board column   |
|----------------------------------------|------------------------------------------------------|----------------|
| `plan.proposed` (first time)            | `INSERT { status: 'todo', plan, title, description }` | Todo           |
| `plan.proposed` (refinement)            | `UPDATE { plan }` on the same row                     | (unchanged)    |
| User clicks Approve in chat             | `UPDATE { status: 'executing', error_message: null }` | In Progress    |
| `run.done`                              | `UPDATE { status: 'done' }`                           | Done           |
| User clicks Cancel in chat              | `UPDATE { status: 'cancelled', error_message }`       | Done           |
| `run.error`                             | `UPDATE { status: 'error', error_message }`           | Done           |
| `plan.fallback` / `plan.error` (no plan)| (no row created — there is nothing to mirror)         | —              |

The title is derived from the first line of the user's original chat message (truncated to 80 characters with an ellipsis); the description is the full original message verbatim. The `plan` field stores the full planner payload (steps, agent metadata, tools), so the board's task detail panel can render the exact same plan the chat user saw.

### Module layout

- `src/lib/planTaskSync.js` — pure async helpers: `createTaskFromPlan`, `updateTaskPlan`, `markTaskApproved`, `markTaskDone`, `markTaskCancelled`, `markTaskError`, `deriveTitle`. Each takes the Supabase client as the first argument so it can be unit-tested with a mock and tolerates a `null` client (no-ops, matching the `BoardPage.jsx` helpers).
- `src/components/AiAssistant.jsx` — calls the helpers from the lifecycle event handlers in `subscribeSession`, `handleApprovePlan`, and `handleCancelPlan`. Uses a `boardTaskRef` map keyed by message index that holds the in-flight `Promise<taskId>`. Holding a promise (not the resolved ID) avoids a race when the user approves or cancels before the initial insert has completed.

### Race handling

If the user clicks Approve or Cancel before `createTaskFromPlan` has resolved, the helper `withBoardTaskId(messageIdx, fn)` awaits the in-flight promise and only then runs the update. The board never sees a stuck "todo" task because the deferred update fires as soon as the insert completes.

### What this is NOT

- The board does not push state back into the chat. Dragging a chat-created task in the board does not pause the chat run, and the chat does not refetch the task row.
- Refining a plan multiple times keeps a single row — there is no per-revision history.
- Clearing the chat (the "Clear" button) drops the in-memory `boardTaskRef` map but leaves the rows in Supabase intact, so prior conversations still appear on the board.

## Native web research tools (`web_search` / `web_fetch`)

When an executor-branch step (the orchestrated planner path) has an agent that declares `web_search` and/or `web_fetch`, the per-step Anthropic request is built with Anthropic's **native server-side** tool definitions — `web_search_20250305` and `web_fetch_20250910` — instead of the client-side schemas. The model performs the search/fetch on Anthropic's side and returns results inline as `web_search_tool_result` / `web_fetch_tool_result` content blocks; the executor never has to round-trip the call through `TOOL_HANDLERS`. This is the **primary** research path because it is faster (one request instead of two), produces more relevant results, and does not require a Tavily key.

The Tavily-backed `web_search` handler stays in `TOOL_HANDLERS` as a **fallback** path that activates when the native call returns zero results or errors out (e.g. `max_uses_exceeded`). The fallback fires at most once per step, the same query is used, and the model gets the Tavily results re-prompted as a follow-up user message.

### Module layout

- `supabase/functions/chat/webResearchTools.ts` — pure helpers, zero I/O.
  - `buildNativeWebTools(declaredIds)` returns the native tool defs to inject. Reads `web_search` and/or `web_fetch` from the agent's declared tool ids.
  - `findFailedNativeSearches(content)` scans the response's content blocks and returns `{ tool_use_id, query, reason }[]` for `web_search_tool_result` blocks that came back empty (`reason: 'no_results'`) or errored (`reason: 'error'`). Pairs each failed result with the original query by indexing the matching `server_tool_use` blocks.
- `supabase/functions/chat/executor.ts` — wires the helpers into the per-step loop:
  - Filters `web_search` / `web_fetch` out of the client-side schema list and adds them via `buildNativeWebTools` instead, so the request never carries a duplicate `web_search` tool name.
  - When `web_fetch` is in the toolset, adds the `anthropic-beta: web-fetch-2025-09-10` request header (required while the native fetch tool is in beta).
  - After each turn, when the model emits text-only (no `tool_use` blocks), runs `findFailedNativeSearches` and if any failed, calls the local `webSearch` (Tavily) handler once per failed query, appends the results as a user message, and continues the loop. The flag `nativeFallbackUsed` ensures Tavily is invoked at most once per step.
  - Emits a structured telemetry log line whenever the fallback triggers: `console.log(JSON.stringify({ event: 'web_search.fallback.tavily', step_id, query, reason }))`. This is the contract downstream log analysis depends on — do not rename the event.

### Scope: executor branch only

The native + fallback wiring lives in the executor branch (multi-step planner runs). The **selected-agent branch** (`selectedAgentBranch.ts`, used when the user picks an agent directly from the chat composer) keeps the plain client-side `web_search` schema and goes straight to Tavily. That is intentional: the selected-agent path streams turns and is shorter; the additional latency of the native+fallback dance is not worth it for a single-shot interaction. If you ever expand the selected-agent path to use the native tool, mirror the executor's wiring rather than building a parallel one.

### Failure modes and what they look like

| Native response                                                                                          | What the executor does                                                                              |
|----------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------|
| `web_search_tool_result.content: [...non-empty results]`                                                 | No fallback. Loop continues normally — model uses the inline results.                                |
| `web_search_tool_result.content: []` (zero results)                                                      | One Tavily call per zero-result query, results re-prompted, telemetry emitted with `reason: no_results`. |
| `web_search_tool_result.content: { type: 'web_search_tool_result_error', error_code: '...' }`            | Same as zero-result path, telemetry emitted with `reason: error`.                                    |
| Native HTTP error (rare — Anthropic API itself fails)                                                    | Surfaces as the existing `step.error` event; no Tavily fallback.                                     |

### Required secrets

| Variable | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Same key the rest of the chat function already uses. The native tools have no separate key. |
| `TAVILY_API_KEY` | Optional but recommended | When unset, the Tavily fallback returns a structured "not configured" error to the model. The native path still works — only the fallback is disabled. |

### Where the tests live

- `supabase/functions/chat/webResearchTools.test.ts` — unit tests for the two pure helpers.
- `supabase/functions/chat/executor.test.ts` — covers request-shape assertions (native tool def injected when declared, omitted when not declared, beta header added for `web_fetch`), the two fallback paths (zero results, error), the no-fallback-on-success path, and the `web_search.fallback.tavily` telemetry contract.

Both run via `npm run test:functions`.
