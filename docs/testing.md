# Testing

The repo has three distinct test suites:

- **Frontend (`npm test`)** — Vitest 2 + @testing-library/react against React components, contexts, and pure JS modules under `src/`. Config: `vitest.config.js` (jsdom environment, automatic JSX). Setup: `src/test/setup.js` (jest-dom matchers, matchMedia mock, stubbed `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` so tests run without `.env.local`). Utils: `src/test/test-utils.jsx` — `renderWithProviders()` wraps components with BrowserRouter + ThemeProvider + StackProvider. Convention: test files live next to their source as `Component.test.jsx`.
- **Edge Functions (`npm run test:functions`)** — Deno's built-in test runner against TypeScript modules under `supabase/functions/`. Mocked `fetch`, no network. Edge Functions run in Deno at the Supabase edge, so they need a Deno-native suite (vitest cannot import `Deno.*` APIs or `jsr:` modules). Convention: test files live next to their source as `module.test.ts`. Requires Deno installed locally (`brew install deno`). Vitest's `exclude` skips `supabase/functions/**` so the two suites do not collide.
- **Integration (`npm run test:functions:integration`)** — Deno tests under `supabase/integration/` that hit real external APIs (currently GitHub). Catches contract regressions that mocked unit tests cannot detect (e.g. mutually-exclusive query params, header changes, response shape drift) — exactly the kind of bug that produced a runtime 422 on `GET /user/repos?affiliation=owner&type=owner` because the unit test asserted the wrong contract. Auto-skips per test when the required env var is absent, so devs without secrets stay green. CI runs this in a dedicated `Integration Tests` job, gated on the `GH_TEST_TOKEN` repo secret.

## Required env / secrets for integration tests

GitHub Actions reserves the `GITHUB_` secret/variable prefix, so the keys here are `GH_*` rather than `GITHUB_*`.

| Variable | Where | Notes |
|---|---|---|
| `GH_TEST_TOKEN` | Local shell or GitHub Actions secret | Fine-grained PAT with **Issues read+write** on the test repo and **Metadata read**. Separate from `GITHUB_TOKEN` (the runtime Edge Function secret) so a CI test failure cannot expose the production token. Tests skip cleanly when this is missing. |
| `GH_TEST_REPO` | Optional GitHub Actions variable (or local env) | `owner/name` of the sandbox repo. Defaults to `lucasfe/agenthub`. The `createIssue` test creates an issue here and immediately closes it (REST cannot delete issues — the closed issue stays in the repo's history as cleanup). |
