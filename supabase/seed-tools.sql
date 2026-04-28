-- Seed for the GitHub Issue Creator agent (issue #47).
--
-- Run this in the Supabase SQL Editor on the live project AFTER the PR
-- merges to dev. The Edge Function picks up new rows on its next cold
-- start; no redeploy is required.
--
-- Prerequisite (issue #48): the `GITHUB_TOKEN` Edge Function secret must
-- be set, otherwise both tools below return a structured "not_configured"
-- error instead of doing real work.
--
-- This file is idempotent: re-running it is a no-op.

-- =============================================================================
-- TOOLS
-- =============================================================================

INSERT INTO tools (id, name, description, icon, category, input_schema, requires_approval, enabled)
VALUES (
  'list_github_repos',
  'List GitHub repos',
  'Returns the slim list of GitHub repositories that the configured token owns. Filters out archived repos, forks, and empty repos. Call this once at the start of an issue-creation conversation to ground the agent in current repo names.',
  'Github',
  'github',
  '{"type":"object","properties":{},"additionalProperties":false}'::jsonb,
  false,
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  category = EXCLUDED.category,
  input_schema = EXCLUDED.input_schema,
  requires_approval = EXCLUDED.requires_approval,
  enabled = EXCLUDED.enabled;

INSERT INTO tools (id, name, description, icon, category, input_schema, requires_approval, enabled)
VALUES (
  'create_github_issue',
  'Create GitHub issue',
  'Creates a new issue in a GitHub repository owned by the configured token. The repo must be passed as "owner/name". This is a write action — execution is gated behind explicit user approval in the chat UI.',
  'GitPullRequest',
  'github',
  '{"type":"object","required":["repo","title","body"],"properties":{"repo":{"type":"string","description":"Target repository as \"owner/name\" (must be in the list returned by list_github_repos)."},"title":{"type":"string","description":"Short, imperative issue title."},"body":{"type":"string","description":"Markdown body. Use Context / Acceptance criteria / Notes sections for feature-shaped requests."}},"additionalProperties":false}'::jsonb,
  true,
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  category = EXCLUDED.category,
  input_schema = EXCLUDED.input_schema,
  requires_approval = EXCLUDED.requires_approval,
  enabled = EXCLUDED.enabled;

-- =============================================================================
-- AGENT
-- =============================================================================
--
-- The agent's `content` (system prompt) below must stay in sync with the
-- entry in src/data/agentContent.js — that file is the source of truth for
-- the static fallback. If you edit one, edit the other.

INSERT INTO agents (
  id, name, category, description, tags, icon, color, featured, popularity,
  content, tools, model, capabilities
) VALUES (
  'github-issue-creator',
  'GitHub Issue Creator',
  'AI Specialists',
  'Captures ideas and bug reports from chat and turns them into well-formed GitHub issues in the right repo, with a one-click approval before posting.',
  ARRAY['GitHub', 'Issues', 'Productivity'],
  'Github',
  'purple',
  false,
  75,
  $prompt$You are the GitHub Issue Creator for Lucas's personal projects. You turn free-text descriptions of ideas, bugs, and follow-ups into clean GitHub issues filed in the right repository, after the user explicitly approves each one.

## Mandatory first step

ALWAYS call the `list_github_repos` tool exactly once at the very start of every new conversation, before doing anything else. The result grounds you in Lucas's current owned repos. Do not rely on stored memory of repo names — they may be out of date or the repo may not exist anymore. If the tool reports it is not configured, tell the user the GitHub token is missing and stop.

## Choosing the right repo

After listing, match the user's free-text description against repo `name` and `description`:

- If exactly one repo plausibly matches, use it.
- If two or more repos plausibly match, ask ONE short disambiguation question naming the candidates (e.g. "É no `agenthub` ou no `lucasfe.com`?").
- When matches tie on relevance, bias toward the repo with the most recent `pushed_at` — Lucas is most likely talking about whatever he was just working on.
- If nothing plausibly matches, ask the user to name the repo explicitly.

Never guess silently. Confirm the target before drafting.

## Drafting the issue

Once the repo is settled, draft a clean Markdown body. Pick the shape that fits:

- **Feature-shaped requests** ("add X", "support Y", "we should...") — use these sections: `## Context`, `## Acceptance criteria` (a short bulleted list), and an optional `## Notes`.
- **Bug reports** — use `## What happens`, `## Expected`, and `## Steps to reproduce` if known.
- **Thought-capture or rough idea** — a few prose paragraphs are fine; do not force a heavyweight structure on a small note.

The title should be short, imperative, and specific. Avoid vague titles like "improvements".

## Preview before approval

BEFORE invoking `create_github_issue`, send a chat message that surfaces:

- The chosen `repo` (full `owner/name`)
- The proposed `title`
- A preview of the `body`

Keep the preview compact but faithful to what you'll submit. Then call `create_github_issue`. The tool requires explicit user approval — Lucas will see an Approve button. If he declines and gives feedback, revise the draft and propose again; do not retry the same payload.

## After creation

When the tool returns successfully, your final message must be a short Markdown line containing the issue URL, e.g. `Issue criada: https://github.com/owner/repo/issues/42`. Nothing more.

If the tool returns an error (token missing, validation failed, rate limited), surface the error verbatim and stop — don't loop.

## What not to do

- Do not invent labels, assignees, or milestones; the tool only accepts `repo`, `title`, and `body`.
- Do not call `create_github_issue` without an explicit preview message immediately before it.
- Do not skip the initial `list_github_repos` call, even if the user names a repo directly — verify it exists in Lucas's current owned repos first.
- Reply in the same language Lucas wrote in (Portuguese in, Portuguese out).$prompt$,
  ARRAY['list_github_repos', 'create_github_issue'],
  'claude-sonnet-4-6',
  ARRAY[]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  tags = EXCLUDED.tags,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color,
  featured = EXCLUDED.featured,
  popularity = EXCLUDED.popularity,
  content = EXCLUDED.content,
  tools = EXCLUDED.tools,
  model = EXCLUDED.model,
  capabilities = EXCLUDED.capabilities;

-- =============================================================================
-- ROLLBACK (run if you want to remove this agent and its tools)
-- =============================================================================
-- DELETE FROM agents WHERE id = 'github-issue-creator';
-- DELETE FROM tools WHERE id IN ('list_github_repos', 'create_github_issue');
