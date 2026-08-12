# Branching, CI/CD & Releasing

## Branching & CI/CD

- **`main`** — production branch, protected, receives PRs only
- **`dev`** — development branch, receives auto-commits from Claude Code
- **Auto-commit hook**: Every file edit triggers `git add → commit → push dev`
- **CI pipeline** (`.github/workflows/ci.yml`): Lint → Test → Build on every push, plus a `pr-title` job that gates `dev → main` PRs on a Conventional Commits title
- **Auto-PR** (`.github/workflows/auto-pr.yml`): Creates/updates a single PR from `dev → main` on every push

### Branch protection on `main`

The `main` branch is protected by a GitHub branch protection rule that requires the `PR Title` status check (produced by the `pr-title` job in `.github/workflows/ci.yml`) to pass before merge. This is what guarantees every squash-merge into `main` carries a Conventional Commits title, which keeps `main`'s commit history conventional and clean. (agenthub no longer runs release-please, so the title no longer feeds any version-bump pipeline — see [Releasing Ralph](#releasing-ralph) below.)

The rule is configured manually (one-time) under **Settings → Branches → Branch protection rules → `main`**:

1. Branch name pattern: `main`.
2. Enable **Require status checks to pass before merging**.
3. Add `PR Title` to the list of required status checks (it appears once the `pr-title` job has run at least once on a PR).
4. Leave **Require branches to be up to date before merging** OFF (no need to force-rebase before merge).
5. Save.

Equivalent one-shot via the API (requires admin token):

```bash
gh api -X PUT repos/lucasfe/agenthub/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": { "strict": false, "contexts": ["PR Title"] },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null
}
JSON
```

To verify the rule is in place: `gh api repos/lucasfe/agenthub/branches/main/protection --jq '.required_status_checks.contexts'` should return `["PR Title"]`.

## Releasing Ralph

Ralph is **not released from agenthub**. It now lives in its own standalone repository, [`lucasfe/ralph`](https://github.com/lucasfe/ralph), and is published to npm as [`@lucasfe/ralph`](https://www.npmjs.com/package/@lucasfe/ralph). That repo owns the entire release pipeline — release-please and OIDC-based npm publish live there now.

agenthub simply **consumes** the published package: its autonomous Ralph loop runs from the globally-installed `@lucasfe/ralph` npm package. To pick up a new Ralph version, update that global install; nothing in agenthub needs to change.

As a result, **agenthub has no release pipeline at all** — no release-please config, no manifest, no npm-publish workflow, and no `packages/ralph/` package. The only remaining GitHub Actions workflows are `.github/workflows/ci.yml` (lint → test → build, plus integration/e2e jobs and the `pr-title` gate) and `.github/workflows/auto-pr.yml` (maintains the single `dev → main` rollforward PR). The Conventional Commits requirement on `dev → main` PR titles remains, but purely to keep `main`'s history clean — it no longer bumps any version.
