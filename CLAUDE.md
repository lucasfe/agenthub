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
npm test             # Run all tests (vitest)
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
```

## Testing

- **Framework**: Vitest 2 + @testing-library/react
- **Config**: `vitest.config.js` (jsdom environment, automatic JSX)
- **Setup**: `src/test/setup.js` (jest-dom matchers, matchMedia mock)
- **Utils**: `src/test/test-utils.jsx` — `renderWithProviders()` wraps components with BrowserRouter + ThemeProvider + StackProvider
- **Convention**: Test files live next to their source: `Component.test.jsx`

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
