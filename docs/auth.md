# Authentication & Authorization

The app is gated behind Supabase Google OAuth + an email allowlist. **Every route except `/login` requires both an authenticated Supabase session AND an email present in the allowlist.** There is no anonymous mode and no way to bypass the gate from the client.

## Components of the gate

- `src/lib/supabase.js` — Supabase browser client (reads `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
- `src/lib/auth.js` — pure helper. `isAllowed(email)` reads `VITE_ALLOWED_EMAILS`, splits by comma, trims whitespace, lowercases each entry, and checks membership against the user's lowercased email. **Matching is case-insensitive** on both sides.
- `src/context/AuthContext.jsx` — wraps the Supabase session. After every Supabase auth change, the provider checks the user's email against `isAllowed`. If unauthorized, it calls `signOut()`, clears local state, and exposes an `error` string. Exposes `{ user, session, loading, error, isAuthorized, signInWithGoogle, signOut }`.
- `src/components/RequireAuth.jsx` — route-level wrapper used in `App.jsx`. Renders a loading indicator while `loading` is true; otherwise either renders the children (when `user && isAuthorized`) or redirects to `/login`.
- `src/components/LoginPage.jsx` — the only public route. Renders the Google sign-in button and an inline error banner when the context's `error` is set (e.g. after an unauthorized sign-in attempt).

## Fail-closed invariant

`isAllowed` is intentionally strict: if `VITE_ALLOWED_EMAILS` is missing, empty, or contains only whitespace, **no email is considered allowed** and every login attempt will be rejected. This is by design — there is no "deploy without the allowlist set" mode. The check happens client-side, but combined with Supabase RLS this still effectively keeps the app private.

## Unauthorized-account UX

When a Google account that is not on the allowlist signs in:

1. Supabase completes OAuth and emits a `SIGNED_IN` event.
2. `AuthContext` detects `isAllowed(email) === false`, immediately calls `supabase.auth.signOut()`, and sets `error` to a user-readable message.
3. `RequireAuth` sees no authorized user and redirects (or keeps the user) on `/login`.
4. `LoginPage` reads the `error` from context and renders an inline banner explaining the account is not authorized.

The user never reaches a private route, even momentarily, because `RequireAuth` runs before any private page renders.

## Onboarding a new authorized email

Adding a family member, friend, or new team member is a config change — no code change required:

1. Open the Vercel project settings → **Environment Variables**.
2. Edit `VITE_ALLOWED_EMAILS`. The value is a single comma-separated string, e.g. `lucas@example.com,family@example.com,friend@example.com`. Whitespace around commas is fine; matching is case-insensitive.
3. Save and trigger a redeploy (Vercel will pick up the new value on the next build).
4. The newly allowed user can now sign in with their Google account.

To revoke access, remove the email from the same env var and redeploy. Existing sessions will fail on their next `AuthContext` re-check (e.g. on next page load) because `isAllowed` will return `false` and they'll be signed out automatically.

For local development, set the same variables in `.env.local` (see `.env.local.example`).

## Required env vars

| Variable | Required | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anon (publishable) key |
| `VITE_ALLOWED_EMAILS` | Yes | Comma-separated emails, case-insensitive. Empty/missing ⇒ no one is allowed (fail closed). Update in Vercel + redeploy to add or revoke access. |
