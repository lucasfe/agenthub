# CLAUDE.md — Lucas AI Hub

Guidance for any AI assistant working on this codebase. This file holds **steering rules only** — the rules you must follow on every task. Detailed reference documentation lives under [`docs/`](docs/); read the relevant file when you start work in that area.

Lucas AI Hub is an internal React 19 + Vite 8 + Tailwind 4 web app for browsing, creating, and managing AI agent templates. Data is in Supabase (agents) and static JSON (teams). No backend beyond Supabase Edge Functions.

## Steering rules (always apply)

### Fix bugs test-first
When fixing a bug, **write a failing test that reproduces it first**, then make the change that turns it green. Do not fix a bug without a test that would have caught it. Put the test next to its source (`Component.test.jsx`, `module.test.ts`) per the suite conventions in [docs/testing.md](docs/testing.md).

### Validate your own work before declaring done
Before you claim a task is complete, run the relevant checks and **report the actual results** — never assume green:
- `npm run lint` — ESLint
- `npm test` — frontend (Vitest)
- `npm run build` — production build
- `npm run test:functions` — only if you touched `supabase/functions/**`

If something fails, say so with the output. If you skipped a check, say that. Don't hedge when it genuinely passes.

### Honor the stack constraints
These are hard constraints, not preferences:
- **React functional components + hooks only** — no class components.
- **No TypeScript** in the app — plain JavaScript (`.jsx`). (Edge Functions under `supabase/functions/` are TypeScript/Deno.)
- **Tailwind utility-first** — no CSS modules; theme via CSS custom properties.
- **Default exports** for every component.
- **Icons come from lucide-react** only.

See [docs/architecture.md](docs/architecture.md) for the full conventions, naming table, and component patterns.

### Mind the auto-commit + branch flow
Every file edit is auto-committed and pushed to **`dev`** by a hook — assume your edits ship to `dev` immediately. **`main`** is protected and takes PRs only, and each `dev → main` PR title **must be a Conventional Commit** (`feat:`, `fix:`, `chore:`, etc.) or CI blocks the merge (the `pr-title` gate). This keeps `main`'s history clean — it no longer drives any release-please versioning in agenthub (Ralph is released from its own [`lucasfe/ralph`](https://github.com/lucasfe/ralph) repo). Details in [docs/releasing.md](docs/releasing.md).

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
npm run test:functions # Run Edge Function tests (deno, mocked fetch)
npm run test:functions:integration # Run real-API integration tests (deno, hits GitHub)
```

## Documentation map

| Topic | File |
|---|---|
| Project overview, tech stack, directory layout, routing, conventions, component patterns, styling, data schemas, key features, adding agents/teams | [docs/architecture.md](docs/architecture.md) |
| Supabase Google OAuth + email allowlist gate, env vars, onboarding/revoking access | [docs/auth.md](docs/auth.md) |
| GitHub Issue Creator agent, Skills catalog, Skill Creator agent, AI Assistant ↔ board sync, native web research tools | [docs/features.md](docs/features.md) |
| Three test suites, conventions, integration-test secrets | [docs/testing.md](docs/testing.md) |
| Branching, CI/CD, branch protection, how Ralph is consumed/released | [docs/releasing.md](docs/releasing.md) |
| The `/project:*` AI dev-team slash commands and workflow | [docs/ai-dev-team.md](docs/ai-dev-team.md) |
