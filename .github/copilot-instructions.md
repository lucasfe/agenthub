# Copilot Instructions — Lucas AI Hub

Refer to `CLAUDE.md` at the project root for full documentation. Key points:

## Stack
React 19 + Vite 8 + Tailwind CSS 4 + react-router 7 + lucide-react. No TypeScript.

## Patterns
- Functional components, default exports, hooks only
- Tailwind utilities for styling, CSS variables for theming (dark/light via `data-theme`)
- Agent catalog lives in the Supabase `agents` table (no static fallback). Read via `src/lib/agentsRepo.js` (`listAgents`, `getAgent`, `createAgent`, `updateAgent`, `deleteAgent`) or `useData()` for the global cached list.
- Reference data still in `src/data/`: `teams.json` only.
- Context API for global state (ThemeContext, StackContext, DataContext, AuthContext)
- Icons resolved dynamically: `Icons[agent.icon]` from `lucide-react`

## Data
- `agents` table: `{ id, name, category, description, tags, icon, color, featured, popularity, content, tools, model, capabilities, usage_count }`
- teams.json: `{ id, name, description, color, agents[], createdAt }`

## Adding Agents
1. Append a tuple to `supabase/migrations/20260504120000_seed_agents.sql` (idempotent `ON CONFLICT DO UPDATE`). For tool-bound specialists, add the row to `supabase/seed-tools.sql` instead.
2. Icon must exist in lucide-react, color must be: blue|green|purple|amber|rose|cyan
3. For UI-driven creates/updates, call `createAgent` / `updateAgent` from `src/lib/agentsRepo.js`.
