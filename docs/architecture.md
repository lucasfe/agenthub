# Architecture — Lucas AI Hub

Reference documentation for the app's structure, conventions, and data model. For agent steering rules see [`CLAUDE.md`](../CLAUDE.md).

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
└── data/                 # Reference data (teams.json only)
    └── teams.json         # 6 predefined teams (validated against the seed migration)
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

Every route except `/login` is wrapped by `RequireAuth` (`src/components/RequireAuth.jsx`). Visiting any private route while unauthenticated or with an unauthorized email redirects to `/login`. See [auth.md](auth.md).

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

// Data — agents come from Supabase via the agentsRepo deep module
import { listAgents, getAgent } from '../lib/agentsRepo'
// Or via the global DataContext, which already calls listAgents() on mount
import { useData } from '../context/DataContext'
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

### Agent (Supabase `agents` table)
The agent catalog is stored in Postgres and accessed through `src/lib/agentsRepo.js` (`listAgents`, `getAgent`, `createAgent`, `updateAgent`, `deleteAgent`). Row shape:
```
{
  id: 'frontend-developer',           -- kebab-case PK, used in URLs
  name: 'Frontend Developer',
  category: 'Development Team',       -- 'Development Team' | 'AI Specialists'
  description: 'Expert in React...',
  tags: ['React', 'TypeScript', 'CSS'],
  icon: 'Monitor',                    -- lucide-react export name
  color: 'blue',                      -- blue | green | purple | amber | rose | cyan
  featured: true,
  popularity: 98,                     -- integer 1–100 (sort + display)
  content: 'You are a senior frontend developer...',  -- markdown system prompt
  tools: [],
  model: 'claude-sonnet-4-6',
  capabilities: [],
  usage_count: 0
}
```

The seed migration that loads the catalog is `supabase/migrations/20260504120000_seed_agents.sql`. It is idempotent (`INSERT ... ON CONFLICT (id) DO UPDATE`) so re-running it on an existing DB refreshes the seeded columns without nuking new rows or `usage_count`.

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
- `agents`: array of agent IDs. Every id MUST resolve to a row in the seed migration — `src/lib/teamsSeedValidation.test.js` enforces this in CI.

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

## Adding a New Agent

The catalog lives in the Supabase `agents` table. There are two paths:

- **Permanent catalog agent** — append a tuple to the agents `INSERT` block in `supabase/migrations/20260504120000_seed_agents.sql` and add a matching `agent_id` to whatever team(s) should reference it in `src/data/teams.json`. Re-run the migration (idempotent) to apply on an existing DB.
- **Tool-bound specialist** (e.g. github-issue-creator, skill-creator) — add an `INSERT INTO agents ... ON CONFLICT DO UPDATE` block to `supabase/seed-tools.sql` alongside the relevant `tools` rows.

In both cases:
- `id` is kebab-case and must be unique.
- `category` is `"Development Team"` or `"AI Specialists"`.
- `icon` must be a valid lucide-react export name.
- `color` is one of `blue | green | purple | amber | rose | cyan`.
- For runtime UI changes without re-seeding, use `src/lib/agentsRepo.js` (`createAgent`, `updateAgent`, `deleteAgent`).

## Adding a New Team

1. Add entry to `src/data/teams.json`
2. Reference existing agent IDs in the `agents` array

## Future Considerations

- Backend API integration (currently all data is static)
- TypeScript migration
- Shared colorMap utility (currently duplicated in components)
- Real markdown library (e.g., react-markdown) to replace custom parser
- Authentication and user-specific stacks
- Search indexing for large agent catalogs
