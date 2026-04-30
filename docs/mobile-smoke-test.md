# Mobile smoke test (manual, real-device)

Playwright covers the wiring inside `MobileApp` (auth gate, chat send, voice
result handling, push opt-in card, agent picker, approval card). The
behaviors below cannot be faked by Playwright/Chromium — they require real
iOS Safari, real microphone permission, and real APNs delivery — and must
be verified manually before any release that touches `/mobile`.

## Setup

- Real iPhone (iOS 16+). The Playwright suite uses an iPhone 13 viewport,
  so any iPhone 13 or newer matches the automated coverage.
- A Google account that appears in `VITE_ALLOWED_EMAILS`.
- The production deploy (or a Vercel preview) reachable from the device.

## Checklist

1. **Open the production URL in iOS Safari**
   - Visit `https://agenthub.vercel.app/mobile`.
   - Confirm the address bar uses the configured theme color (no system
     fallback).
   - Confirm the tab favicon resolves (no broken-icon glyph).

2. **Add to Home Screen**
   - Share menu → "Add to Home Screen" → keep the suggested name.
   - Launch from the home-screen icon. The app must open in standalone
     mode (no Safari chrome). Status bar tint should match the app theme.

3. **Auth gate**
   - On a fresh launch, you land on `/mobile/login`.
   - Tap "Continue with Google" and complete the OAuth flow with an
     allowlisted account → redirect to `/mobile/chat`.
   - Sign out (or reset Safari data) and try again with a non-allowlisted
     Google account → land back on `/mobile/login` with a visible error
     banner naming the rejected email.

4. **Send a text message**
   - Type a short message and tap Send.
   - Response streams in (text appears progressively, not in a single
     chunk).
   - The "Thinking…" placeholder is visible until the first text token
     arrives.

5. **Voice dictation**
   - Tap the mic button.
   - iOS Safari prompts for microphone permission. Allow.
   - Speak a short sentence. The final transcript should populate the
     input.
   - Tap Send. The streaming response should arrive as in step 4.

6. **Tool approval card**
   - Send a message that triggers an approval-required tool (e.g. "Open
     a GitHub issue saying: real-device approval test").
   - The approval card with Approve / Reject buttons must appear.
   - Tap Approve. The agent should resume and stream the rest of the
     response.

7. **Push opt-in card**
   - On the first chat visit, the "Get notified…" card appears under the
     header.
   - Tap "Enable". iOS Safari prompts for notification permission. Allow.
   - The card disappears.
   - Reload the page. The card stays hidden.

8. **Push: approval-required notification**
   - From a desktop tab, trigger an approval-required tool call against
     the same account.
   - Within a few seconds, the iPhone receives a push notification.
   - Tap the notification. The app deep-links back to the relevant
     session and shows the pending approval card.

9. **Push: `run.done` notification**
   - Trigger a planned/execute run that takes more than ~10 seconds (so
     the app likely backgrounds before completion).
   - When the run completes, a push with the run summary should arrive.
   - Tap the notification. The app opens the same session.

10. **Push: `run.error` notification**
    - Trigger a run you expect to fail (e.g. invalid target repo for
      `create_github_issue`).
    - A push describing the failure should arrive.
    - Tap the notification. The app deep-links to the relevant session.

11. **Background / foreground resilience**
    - Background the app (swipe home), wait 60 seconds, reopen from the
      home-screen icon.
    - The session state and message history should be intact (or, if the
      session was discarded, the empty state should render cleanly with
      no stuck spinners).

If any step fails, file an issue tagged `mobile` with the device, iOS
version, and reproduction steps.
