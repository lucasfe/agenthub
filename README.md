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
