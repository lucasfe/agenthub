# Copilot Instructions — Lucas AI Hub

Refer to `CLAUDE.md` at the project root for full documentation. Key points:

## Stack
React 19 + Vite 8 + Tailwind CSS 4 + react-router 7 + lucide-react. No TypeScript.

## Patterns
- Functional components, default exports, hooks only
- Tailwind utilities for styling, CSS variables for theming (dark/light via `data-theme`)
- Static JSON data in `src/data/`, no backend API yet
- Context API for global state (ThemeContext, StackContext)
- Icons resolved dynamically: `Icons[agent.icon]` from `lucide-react`

## Data
- agents.json: `{ id, name, category, description, tags, icon, color, featured, popularity }`
- teams.json: `{ id, name, description, color, agents[], createdAt }`
- agentContent.js: system prompts keyed by agent ID

## Adding Agents
1. Add to `src/data/agents.json`
2. Add system prompt to `src/data/agentContent.js`
3. Icon must exist in lucide-react, color must be: blue|green|purple|amber|rose|cyan
