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

The mobile shell at `/mobile` can send Web Push notifications to a logged-in user — for example when an executor run finishes or a tool call hits the approval gate. Push delivery uses VAPID-authenticated requests over the Web Push protocol; the helper lives in `supabase/functions/_shared/push.ts` and is consumed server-side by Edge Functions (slice 8 wires it into chat triggers).

### One-time VAPID key generation

Generate a VAPID key pair locally — you only do this once for the project:

```bash
npx web-push generate-vapid-keys
```

The command prints a public key and a private key, both base64url-encoded. Treat the private key as a credential.

### Where the keys go

| Key | Where | Notes |
|---|---|---|
| Public key | Vercel env var `VITE_VAPID_PUBLIC_KEY` (and local `.env.local`) | Bundled into the frontend so the browser's `pushManager.subscribe` call can attach it as `applicationServerKey`. Public — safe to embed. |
| Private key | Supabase Edge Function secret `VAPID_PRIVATE_KEY` | Used server-side to sign the VAPID JWT on every push delivery. Never exposed to the browser. |
| Contact subject | Supabase Edge Function secret `VAPID_SUBJECT` | A contact URL for the push service operator. Use `mailto:you@example.com`. Required by RFC 8292. |

Set the Supabase secrets via the dashboard (Project Settings → Edge Functions → Secrets) or the CLI:

```bash
supabase secrets set VAPID_PRIVATE_KEY=<base64url-private-key>
supabase secrets set VAPID_SUBJECT=mailto:you@example.com
```

After setting them, redeploy the Edge Functions that consume `_shared/push.ts` (`supabase functions deploy <name>`) so the new env is picked up.

### Rotating the keys

If the private key is ever exposed:

1. Run `npx web-push generate-vapid-keys` again.
2. Update `VITE_VAPID_PUBLIC_KEY` (Vercel) and trigger a redeploy.
3. Update `VAPID_PRIVATE_KEY` (Supabase secret) and redeploy the relevant Edge Functions.
4. All existing browser subscriptions will silently stop working because the public key changed; users will re-subscribe automatically the next time the mobile app prompts them.
