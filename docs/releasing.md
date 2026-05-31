# Branching, CI/CD & Releasing

## Branching & CI/CD

- **`main`** — production branch, protected, receives PRs only
- **`dev`** — development branch, receives auto-commits from Claude Code
- **Auto-commit hook**: Every file edit triggers `git add → commit → push dev`
- **CI pipeline** (`.github/workflows/ci.yml`): Lint → Test → Build on every push, plus a `pr-title` job that gates `dev → main` PRs on a Conventional Commits title
- **Auto-PR** (`.github/workflows/auto-pr.yml`): Creates/updates a single PR from `dev → main` on every push

### Branch protection on `main`

The `main` branch is protected by a GitHub branch protection rule that requires the `PR Title` status check (produced by the `pr-title` job in `.github/workflows/ci.yml`) to pass before merge. This is what guarantees every squash-merge into `main` carries a Conventional Commits title — the precondition release-please relies on to bump the right SemVer segment.

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

`@lucasfe/ralph` (the `packages/ralph/` package) is published to npm by an automated [release-please](https://github.com/googleapis/release-please) pipeline. There is no manual version bump, no manual `CHANGELOG.md` edit, and no manual `git tag`. The flow is:

1. **Write a Conventional Commit title** on the `dev → main` PR. Allowed types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `ci`, `build`, `revert` (optional `!` for breaking change, optional `(scope)`). The `pr-title` CI job (powered by `amannn/action-semantic-pull-request@v5`) blocks the merge if the title does not match. Examples: `feat: add agent selector`, `fix(ralph): 422 in listRepos`, `chore: bump deps`.
2. **Merge the `dev → main` PR**. Squash-merge keeps the title as the squash-commit subject, which is what release-please reads.
3. **Wait for the Release PR.** The `Ralph release` workflow (`.github/workflows/ralph-release.yml`) runs on every push to `main`, asks release-please to inspect commits since the last release, and (when there is something to release) opens a single Release PR titled `chore(main): release ralph X.Y.Z`. The PR's diff bumps `packages/ralph/package.json` and prepends the auto-generated CHANGELOG entry above the existing prose `0.1.0` block.
4. **Review and merge the Release PR.** This is the human checkpoint — confirm the version bump matches what you expect (catch wrong commit types or accidental breaking-change majors here). The Release PR does NOT auto-merge.
5. **Observe the publish.** Merging the Release PR causes release-please to create the `ralph-vX.Y.Z` tag and GitHub Release; the same workflow then runs the `publish` job, which `npm ci`s, runs `npm test`, and `npm publish --access public --provenance` from `packages/ralph`. npm provenance attestation is enabled (uses GitHub OIDC, no extra secret needed).

### SemVer rules (within the `0.x` line)

`bump-minor-pre-major: true` and `bump-patch-for-minor-pre-major: false` are set, so:

- `feat:` → minor bump (`0.1.0 → 0.2.0`)
- `feat!:` (breaking change) → minor bump (`0.1.0 → 0.2.0`), NOT major. The package stays in `0.x` until you explicitly graduate to `1.0.0`.
- `fix:` → patch bump (`0.1.0 → 0.1.1`)
- `chore:`, `docs:`, `refactor:`, `test:`, `perf:`, `ci:`, `build:`, `revert:` → no version bump (they appear in the changelog only if their type is configured to surface).

### Scope: only `packages/ralph/**`

release-please is configured in manifest mode with a single entry for `packages/ralph`. Commits that do NOT touch `packages/ralph/**` are ignored by the release pipeline, so editing the React app under `src/` produces no Ralph version bump or Release PR.

### State files

- `release-please-config.json` (repo root) — manifest-mode config: `release-type: node`, `package-name: @lucasfe/ralph`, `component: ralph`, `include-component-in-tag: true`, `include-v-in-tag: true` (yields tags like `ralph-v0.2.0`), `prerelease: false`, `bump-minor-pre-major: true`, `bump-patch-for-minor-pre-major: false`.
- `.release-please-manifest.json` (repo root) — single entry `{ "packages/ralph": "0.1.0-rc.1" }`. release-please reads and updates this on every release. Do NOT edit by hand except to recover from a mis-merged Release PR.
- `packages/ralph/CHANGELOG.md` — the existing prose `## [0.1.0] - Unreleased` block is the human release note for the eventual `0.1.0` stable publish. release-please prepends new auto-generated entries (`## [0.2.0]`, `## [0.3.0]`, …) above it.

### Required secret

| Variable | Where | Notes |
|---|---|---|
| `NPM_TOKEN` | GitHub Actions secret | npm automation token with publish rights for `@lucasfe/ralph`. Reused from the prior manual workflow — no rotation needed for the bootstrap. |

### What was removed

The previous manual flow (`.github/workflows/ralph-publish.yml`, triggered by pushing a `ralph-v*` git tag) is removed. release-please now owns the tag, so do not push `ralph-v*` tags by hand — the new workflow has no listener for them.
