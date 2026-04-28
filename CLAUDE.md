# CLAUDE.md — Lucas AI Hub

This file provides guidance to any AI assistant working on this codebase.

## Project Overview

Lucas AI Hub is an internal web app for browsing, creating, and managing AI agent templates. It mimics the layout and UX of [aitmpl.com/agents](https://www.aitmpl.com/agents). The app is frontend-only (no backend yet) with static JSON data. Built with React 19, Vite 8, and Tailwind CSS 4.

## Tech Stack

- **Framework**: React 19.2 (functional components, hooks only — no class components)
- **Routing**: react-router 7 (BrowserRouter, `<Link>`, `useParams`, `useNavigate`, `useLocation`)
- **Styling**: Tailwind CSS 4.2 via `@tailwindcss/vite` plugin — utility-first, no CSS modules
- **Icons**: lucide-react 1.7 — all icons come from this library
- **Build**: Vite 8 with `@vitejs/plugin-react`
- **ZIP generation**: jszip 3.10 (used in StackButton for bulk agent download)
- **No TypeScript** — the project uses plain JavaScript (.jsx)

## Directory Structure

```
src/
├── main.jsx              # Entry: BrowserRouter + ThemeProvider + App
├── App.jsx               # Routes definition + page-level components
├── index.css             # Theme variables, animations, global styles
├── components/           # All UI components (flat, no nesting)
│   ├── AgentCard.jsx
│   ├── AgentDetailPage.jsx
│   ├── CommandPalette.jsx
│   ├── CreateAgentPage.jsx
│   ├── CreateTeamPage.jsx
│   ├── Header.jsx
│   ├── HeroSection.jsx
│   ├── SearchFilterBar.jsx
│   ├── Sidebar.jsx
│   ├── StackButton.jsx
│   ├── TeamCard.jsx
│   └── TeamDetailPage.jsx
├── context/              # React Context providers
│   ├── ThemeContext.jsx   # Dark/light theme, persisted in localStorage
│   └── StackContext.jsx   # Selected agents stack (add/remove/download)
└── data/                 # Static data (editable JSON)
    ├── agents.json        # 21 agents across 2 categories
    ├── teams.json         # 6 predefined teams
    └── agentContent.js    # System prompts keyed by agent ID
```

## Routing

```
/login                          → Public login page (only public route)
/                               → Agent listing (grid/list)
/agent/:category/:agentId      → Agent detail with prompt viewer
/create                         → Create new agent form
/teams                          → Teams listing
/teams/:teamId                  → Team detail page
/teams/create                   → Create new team form
/teams/:teamId/edit             → Edit existing team
/board                          → Orchestration board
/settings                       → User settings
```

Category in URLs is derived from `agent.category.toLowerCase().replace(/\s+/g, '-')`.

Every route except `/login` is wrapped by `RequireAuth` (`src/components/RequireAuth.jsx`). Visiting any private route while unauthenticated or with an unauthorized email redirects to `/login`.

## Authentication & Authorization

The app is gated behind Supabase Google OAuth + an email allowlist. **Every route except `/login` requires both an authenticated Supabase session AND an email present in the allowlist.** There is no anonymous mode and no way to bypass the gate from the client.

### Components of the gate

- `src/lib/supabase.js` — Supabase browser client (reads `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
- `src/lib/auth.js` — pure helper. `isAllowed(email)` reads `VITE_ALLOWED_EMAILS`, splits by comma, trims whitespace, lowercases each entry, and checks membership against the user's lowercased email. **Matching is case-insensitive** on both sides.
- `src/context/AuthContext.jsx` — wraps the Supabase session. After every Supabase auth change, the provider checks the user's email against `isAllowed`. If unauthorized, it calls `signOut()`, clears local state, and exposes an `error` string. Exposes `{ user, session, loading, error, isAuthorized, signInWithGoogle, signOut }`.
- `src/components/RequireAuth.jsx` — route-level wrapper used in `App.jsx`. Renders a loading indicator while `loading` is true; otherwise either renders the children (when `user && isAuthorized`) or redirects to `/login`.
- `src/components/LoginPage.jsx` — the only public route. Renders the Google sign-in button and an inline error banner when the context's `error` is set (e.g. after an unauthorized sign-in attempt).

### Fail-closed invariant

`isAllowed` is intentionally strict: if `VITE_ALLOWED_EMAILS` is missing, empty, or contains only whitespace, **no email is considered allowed** and every login attempt will be rejected. This is by design — there is no "deploy without the allowlist set" mode. The check happens client-side, but combined with Supabase RLS this still effectively keeps the app private.

### Unauthorized-account UX

When a Google account that is not on the allowlist signs in:

1. Supabase completes OAuth and emits a `SIGNED_IN` event.
2. `AuthContext` detects `isAllowed(email) === false`, immediately calls `supabase.auth.signOut()`, and sets `error` to a user-readable message.
3. `RequireAuth` sees no authorized user and redirects (or keeps the user) on `/login`.
4. `LoginPage` reads the `error` from context and renders an inline banner explaining the account is not authorized.

The user never reaches a private route, even momentarily, because `RequireAuth` runs before any private page renders.

### Onboarding a new authorized email

Adding a family member, friend, or new team member is a config change — no code change required:

1. Open the Vercel project settings → **Environment Variables**.
2. Edit `VITE_ALLOWED_EMAILS`. The value is a single comma-separated string, e.g. `lucas@example.com,family@example.com,friend@example.com`. Whitespace around commas is fine; matching is case-insensitive.
3. Save and trigger a redeploy (Vercel will pick up the new value on the next build).
4. The newly allowed user can now sign in with their Google account.

To revoke access, remove the email from the same env var and redeploy. Existing sessions will fail on their next `AuthContext` re-check (e.g. on next page load) because `isAllowed` will return `false` and they'll be signed out automatically.

For local development, set the same variables in `.env.local` (see `.env.local.example`).

### Required env vars

| Variable | Required | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anon (publishable) key |
| `VITE_ALLOWED_EMAILS` | Yes | Comma-separated emails, case-insensitive. Empty/missing ⇒ no one is allowed (fail closed). Update in Vercel + redeploy to add or revoke access. |

## GitHub Issue Creator agent

The `github-issue-creator` agent turns a free-text chat description into a GitHub issue in one of Lucas's owned repositories, with explicit user approval before the issue is created. It lives in the **AI Specialists** catalog category and is consumed via the existing AI Assistant chat — no new UI surface.

### Tools

The agent calls two tools, both registered in `supabase/functions/chat/executor.ts`'s `TOOL_HANDLERS` registry:

- **`list_github_repos`** — read-only. No parameters. Fetches the live list of repos Lucas owns from the GitHub REST API, slimmed to `{ name, full_name, description, pushed_at }`. `requires_approval: false`. The system prompt instructs the agent to call this exactly once at the start of every new conversation so it grounds itself in the current repo set rather than stale model memory.
- **`create_github_issue`** — write. Parameters: `repo` (`owner/name` string), `title` (string), `body` (Markdown string). Creates the issue and returns `{ url, number }`. **`requires_approval: true`** on the row in the `tools` table, which makes the existing chat approval gate pause execution and render a one-click "Approve" button before the call goes out. There is no way to bypass the approval from the agent side.

The two `tools` rows and the `agents` row that wires them to `github-issue-creator` are seeded in [`supabase/seed-tools.sql`](supabase/seed-tools.sql). The catalog card definition lives in `src/data/agents.json`; the agent's system prompt is keyed by `github-issue-creator` in `src/data/agentContent.js` (and a copy is embedded in the same `seed-tools.sql` for the database-side `agents` row).

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
- Tool dependency: reuses the existing `create_github_issue` tool from the [GitHub Issue Creator agent](#github-issue-creator-agent). It is the only tool the agent declares in `src/data/agents.json` (no `list_github_repos` — there is nothing to choose). Approval gating, error handling, and the `GITHUB_TOKEN` Edge Function secret are inherited from that feature unchanged.
- Card definition in `src/data/agents.json` (`id: "skill-creator"`); system prompt keyed by `skill-creator` in `src/data/agentContent.js` (and mirrored in `supabase/seed-tools.sql` for the database-side `agents` row).

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
- The `GITHUB_TOKEN` Edge Function secret is the same one used by the GitHub Issue Creator agent — see [Required Edge Function secret](#required-edge-function-secret). No new secret to provision.

**Why a proxy and not unauthenticated public-repo fetch?** The skills repo is intentionally private (it contains personal workflow notes, not just public-skill source). Routing through the function keeps the catalog visible to authenticated app users while keeping the upstream repo private.

## Naming Conventions

| What             | Convention           | Example                          |
|------------------|----------------------|----------------------------------|
| Components       | PascalCase           | `AgentCard.jsx`, `HeroSection`   |
| Files            | Match component name | `AgentCard.jsx` → `AgentCard`    |
| Functions        | camelCase            | `toggleAgent`, `handleSubmit`    |
| Data IDs         | kebab-case           | `frontend-developer`, `web-app-squad` |
| Route paths      | lowercase + hyphens  | `/agent/development-team/code-reviewer` |
| CSS variables    | kebab-case           | `--theme-bg-primary`             |
| Icon names       | PascalCase (Lucide)  | `Monitor`, `GitPullRequest`      |

## Component Patterns

### Exports
Every component uses **default export**:
```jsx
export default function ComponentName({ prop1, prop2 }) { ... }
```

### Imports
```jsx
// Icons: wildcard import for dynamic icon resolution
import * as Icons from 'lucide-react'
const IconComponent = Icons[agent.icon] || Icons.Bot

// Icons: destructured when static
import { Search, Moon, Sun } from 'lucide-react'

// Context hooks
import { useTheme } from '../context/ThemeContext'
import { useStack } from '../context/StackContext'

// Router
import { Link, useParams, useNavigate } from 'react-router'

// Data
import agentsData from '../data/agents.json'
```

### Props
- Destructured in function parameters
- No PropTypes or TypeScript types (yet)
- Components accept a `variant` prop for multi-use layouts (e.g., HeroSection, SearchFilterBar)

### State Management
- **Local**: `useState` for UI state, form inputs
- **Derived**: `useMemo` for filtered/sorted lists
- **Global**: React Context only (ThemeContext, StackContext)
- **No external state library** (no Redux, Zustand, etc.)

## Styling System

### Theme Architecture
The app uses CSS custom properties for theming, bridged through Tailwind's `@theme` directive:

```
CSS variables (--theme-*)  →  @theme block (--color-*)  →  Tailwind classes (bg-bg-primary)
```

Theme is toggled via `data-theme` attribute on `<html>`:
- `[data-theme="dark"]` — default
- `[data-theme="light"]` — lighter variant

### Color Palette (6 accent colors)
Each agent/team has a `color` field that maps to a **colorMap** object:
```javascript
const colorMap = {
  blue:   { bg, border, icon, tag, glow },
  green:  { ... },
  purple: { ... },
  amber:  { ... },
  rose:   { ... },
  cyan:   { ... },
}
```

This colorMap is defined locally inside `AgentCard.jsx` and `TeamCard.jsx`.

### Custom CSS Classes
- `.card-glow` — hover shadow with colored glow
- `.card-icon` — icon tilt animation on group hover, with radial gradient glow
- `.hero-icon` — floating animation (4s infinite) + shake on hover

### Animation Keyframes
- `hero-float` — gentle up/down bob
- `hero-shake` — quick rotation wiggle
- `card-icon-tilt` — rotate + scale on hover

### Light Mode Overrides
White opacity utilities (`bg-white/5`, `hover:bg-white/10`) are overridden in light mode to use black opacity instead. These are explicit CSS rules in `index.css`.

## Data Schemas

### Agent (agents.json)
```json
{
  "id": "frontend-developer",
  "name": "Frontend Developer",
  "category": "Development Team",
  "description": "Expert in React, TypeScript...",
  "tags": ["React", "TypeScript", "CSS"],
  "icon": "Monitor",
  "color": "blue",
  "featured": true,
  "popularity": 98
}
```
- `id`: kebab-case, unique, used in URLs and as key
- `category`: `"Development Team"` or `"AI Specialists"`
- `icon`: must be a valid lucide-react export name
- `color`: one of `blue | green | purple | amber | rose | cyan`
- `popularity`: integer 1–100, used for sort + display (`popularity * 243` shown as downloads)

### Team (teams.json)
```json
{
  "id": "web-app-squad",
  "name": "Web App Squad",
  "description": "End-to-end web application...",
  "color": "blue",
  "agents": ["frontend-developer", "backend-developer"],
  "createdAt": "2026-02-15"
}
```
- `agents`: array of agent IDs (must match `agents.json` entries)

### Agent Content (agentContent.js)
```javascript
const agentContent = {
  'frontend-developer': `You are a senior frontend developer...`,
  // markdown-formatted system prompts
}
export default agentContent
```

## Key Features

### Stack System
Users can "stack" agents (like a shopping cart) via StackContext:
- `toggleAgent(id)` — add/remove
- `addAgents(ids)` — batch add (used by teams)
- `clearStack()` — reset
- StackButton renders a floating button + slide-out panel
- Download creates a ZIP with `{agentId}.md` files via jszip

### Command Palette
- Triggered by ⌘K or clicking the search bar
- Searches across agents and teams
- Keyboard navigation (↑↓ Enter Esc)
- Navigates to detail page on selection

### Markdown Rendering
AgentDetailPage has a custom markdown parser (no library). It supports:
- H2 (`##`), H3 (`###`) headings
- Fenced code blocks (``` ```)
- Unordered and ordered lists
- Bold (`**text**`), inline code (`` `text` ``)

## Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (localhost:5173)
npm run build        # Production build
npm run preview      # Preview production build
npm run lint         # ESLint check
npm test             # Run frontend tests (vitest)
npm run test:watch   # Run frontend tests in watch mode
npm run test:coverage # Run frontend tests with coverage report
npm run test:functions # Run Edge Function tests (deno)
```

## Testing

The repo has two distinct test suites:

- **Frontend (`npm test`)** — Vitest 2 + @testing-library/react against React components, contexts, and pure JS modules under `src/`. Config: `vitest.config.js` (jsdom environment, automatic JSX). Setup: `src/test/setup.js` (jest-dom matchers, matchMedia mock). Utils: `src/test/test-utils.jsx` — `renderWithProviders()` wraps components with BrowserRouter + ThemeProvider + StackProvider. Convention: test files live next to their source as `Component.test.jsx`.
- **Edge Functions (`npm run test:functions`)** — Deno's built-in test runner against TypeScript modules under `supabase/functions/`. Edge Functions run in Deno at the Supabase edge, so they need a Deno-native suite (vitest cannot import `Deno.*` APIs or `jsr:` modules). Convention: test files live next to their source as `module.test.ts`. Requires Deno installed locally (`brew install deno`). Vitest's `exclude` skips `supabase/functions/**` so the two suites do not collide.

## Branching & CI/CD

- **`main`** — production branch, protected, receives PRs only
- **`dev`** — development branch, receives auto-commits from Claude Code
- **Auto-commit hook**: Every file edit triggers `git add → commit → push dev`
- **CI pipeline** (`.github/workflows/ci.yml`): Lint → Test → Build on every push
- **Auto-PR** (`.github/workflows/auto-pr.yml`): Creates/updates a single PR from `dev → main` on every push

## Adding a New Agent

1. Add entry to `src/data/agents.json` following the schema above
2. Add system prompt to `src/data/agentContent.js` using the same `id` as key
3. Ensure the `icon` value exists in lucide-react
4. Use one of the 6 defined colors

## Adding a New Team

1. Add entry to `src/data/teams.json`
2. Reference existing agent IDs in the `agents` array

## AI Development Team

This project uses a team of specialized AI agents coordinated by a Manager. Agents are defined as slash commands in `.claude/commands/`.

### Usage in Claude Code

```bash
# Start with the Manager for any task:
/project:manager "Add a settings page with user preferences"

# Or call specialists directly:
/project:frontend "Create a new SettingsPage component"
/project:backend  "Design the user preferences API endpoint"
/project:qa       "Review the SettingsPage for accessibility"
/project:docs     "Update CLAUDE.md with the new route"
```

### Agent Roles

| Agent | Command | Responsibility |
|-------|---------|---------------|
| **Manager** | `/project:manager` | Orchestrates tasks, creates execution plans, delegates to specialists |
| **Frontend Dev** | `/project:frontend` | React components, Tailwind styling, routing, UI/UX |
| **Backend Dev** | `/project:backend` | API design, database, auth, integrations |
| **QA Engineer** | `/project:qa` | Code review, testing, accessibility, performance |
| **Tech Writer** | `/project:docs` | CLAUDE.md, README, .cursorrules, JSDoc |
| **GitOps Engineer** | `/project:gitops` | Commits, branches, PRs, pipeline CI/CD, GitHub Actions |

### Workflow

1. Describe the task to the **Manager**
2. Manager creates an execution plan with phases
3. Each phase is executed by the appropriate specialist
4. QA reviews the output
5. Docs updates documentation if needed

## Future Considerations

- Backend API integration (currently all data is static)
- TypeScript migration
- Shared colorMap utility (currently duplicated in components)
- Real markdown library (e.g., react-markdown) to replace custom parser
- Authentication and user-specific stacks
- Search indexing for large agent catalogs
