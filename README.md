# Lucas AI Hub

Internal web app to browse, create and manage AI agent templates. React 19 + Vite 8 + Tailwind CSS 4.

See [CLAUDE.md](./CLAUDE.md) for full architecture, conventions, and development workflow.

## Quick start

```bash
npm install
npm run dev          # dev server on localhost:5173
npm run build        # production build
npm test             # run vitest suite
npm run lint         # eslint
```

## Ralph loop — autonomous issue resolver

The Ralph loop is an autonomous agent that picks up open GitHub issues one by one, resolves each in its own branch + PR, waits for the auto-merge into `dev`, and notifies you on WhatsApp when the queue is empty.

### Prerequisites

1. CLIs installed: `tmux`, `jq`, `gh`, `claude`, `curl`, `npm`, `git`.
2. `gh auth login` completed.
3. `.env.local` (gitignored) at the project root with:
   ```
   CALLMEBOT_KEY=your_callmebot_api_key
   WHATSAPP_PHONE=5511999999999
   ```
   Get the CallMeBot key by sending `I allow callmebot to send me messages` to the CallMeBot WhatsApp number ([instructions](https://www.callmebot.com/blog/free-api-whatsapp-messages/)).
4. If MCP auth (e.g. Supabase) has expired, run `claude` interactively once to re-auth before launching the loop.

### Run

From inside Claude Code:

```
/ralph
```

Or from a shell:

```bash
./start-ralph.sh
```

The wrapper performs sanity checks, creates `claude-working` and `claude-failed` labels (idempotent), offers cleanup of orphaned issues from a previous interrupted run, and launches `ralph.sh` inside a detached tmux session named `ralph`.

### What happens per iteration

For each open issue (FIFO by creation date, excluding `claude-working` and `claude-failed`):

1. `npm ci` → label `claude-working` → branch `issue-N` from fresh `dev`
2. Claude resolves the issue, runs `npm test` and `npm run lint` until green
3. Commit + push, open PR with `Closes #N`
4. `gh pr merge --auto --squash --delete-branch`
5. Poll until `MERGED` (timeout 20min, poll every 30s)
6. On failure: remove `claude-working`, add `claude-failed`, comment on issue, close PR

When the queue is empty, `ralph.sh` cleans up local merged branches, sends a WhatsApp summary, and kills the tmux session.

### Watching the loop

```bash
tmux ls                       # list sessions
tmux attach -t ralph          # attach to see live output
# inside the session: Ctrl+B then D to detach without killing
tmux kill-session -t ralph    # stop the loop
```

### Logs

Per-iteration logs land in `logs/ralph-issue-N.log` (gitignored). They are never auto-deleted; run `rm logs/*.log` when you want to clean up.

### Excluding issues from Ralph

Add the label `claude-working` or `claude-failed` to any issue manually to make Ralph skip it. Remove the label later if you want it back in the queue.

## Push notifications setup

The mobile shell at `/mobile` (PRD #224) uses Web Push to notify users when long-running agent runs need approval, finish, or error. Push delivery is handled by the `sendPush` helper in `supabase/functions/_shared/push.ts`, which signs each request with VAPID. Keys are generated **once** and never rotated unless compromised.

### One-time VAPID key generation

```bash
npx web-push generate-vapid-keys
```

Output:

```
=======================================
Public Key:
B...long-base64url-string...

Private Key:
...shorter-base64url-string...
=======================================
```

### Where the keys go

| Variable | Scope | Set in | Notes |
|---|---|---|---|
| `VITE_VAPID_PUBLIC_KEY` | Frontend bundle | Vercel project env vars (and `.env.local` for local dev) | Shipped to the browser so `pushManager.subscribe` can include it as `applicationServerKey`. Not a secret. |
| `VAPID_PRIVATE_KEY` | Edge Function only | `supabase secrets set VAPID_PRIVATE_KEY=...` | **Secret.** Used by `sendPush` to sign each Web Push request. Never expose to the frontend. |
| `VAPID_SUBJECT` | Edge Function only | `supabase secrets set VAPID_SUBJECT=mailto:lucasfe@gmail.com` | Required by VAPID. Use a `mailto:` URL the push provider can contact about delivery issues. |

### Behaviour without keys

`sendPush` is fail-safe: if any of the three values is missing it logs an error and returns `{ sent: 0, deleted: 0 }` without crashing the caller. The chat function (slice 8) can therefore be deployed before the keys are provisioned and will simply skip notifications until they exist.

### Rotation

If the keys leak, regenerate with `npx web-push generate-vapid-keys` and update both the Vercel `VITE_VAPID_PUBLIC_KEY` and the Supabase `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` secrets. The new public key invalidates every existing subscription — clients will re-subscribe on next visit.
