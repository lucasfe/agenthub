# CLAUDE.md — Eero AIHub

This file provides guidance to any AI assistant working on this codebase.

## Project Overview

Eero AIHub is an internal web app for browsing, creating, and managing AI agent templates. It mimics the layout and UX of [aitmpl.com/agents](https://www.aitmpl.com/agents). The app is frontend-only (no backend yet) with static JSON data. Built with React 19, Vite 8, and Tailwind CSS 4.

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
/                               → Agent listing (grid/list)
/agent/:category/:agentId      → Agent detail with prompt viewer
/create                         → Create new agent form
/teams                          → Teams listing
/teams/:teamId                  → Team detail page
/teams/create                   → Create new team form
/teams/:teamId/edit             → Edit existing team
```

Category in URLs is derived from `agent.category.toLowerCase().replace(/\s+/g, '-')`.

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
npm install       # Install dependencies
npm run dev       # Start dev server (localhost:5173)
npm run build     # Production build
npm run preview   # Preview production build
npm run lint      # ESLint check
```

## Adding a New Agent

1. Add entry to `src/data/agents.json` following the schema above
2. Add system prompt to `src/data/agentContent.js` using the same `id` as key
3. Ensure the `icon` value exists in lucide-react
4. Use one of the 6 defined colors

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
