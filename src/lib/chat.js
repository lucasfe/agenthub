// Chat streaming client — calls the `chat` Supabase Edge Function and parses
// its SSE stream, invoking callbacks as text deltas and tool calls arrive.
//
// Usage:
//   await streamChat({
//     messages: [{ role: 'user', content: 'hi' }],
//     onDelta: (text) => appendToLastBubble(text),
//     onToolCall: ({ name, input }) => handleDraft(input),
//     onDone: () => setTyping(false),
//     onError: (err) => showError(err),
//     signal: abortController.signal,
//   })

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export function isChatConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
}

export async function streamChat({ messages, onDelta, onDone, onError, signal }) {
  if (!isChatConfigured()) {
    onError?.(new Error('Chat is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'))
    return
  }

  let response
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ messages }),
      signal,
    })
  } catch (err) {
    if (err.name !== 'AbortError') onError?.(err)
    return
  }

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => '')
    onError?.(new Error(`chat request failed: ${response.status} ${text}`))
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      const events = buffer.split('\n\n')
      buffer = events.pop() ?? ''

      for (const raw of events) {
        const line = raw.split('\n').find((l) => l.startsWith('data:'))
        if (!line) continue
        const jsonStr = line.slice(5).trim()
        if (!jsonStr) continue

        let evt
        try {
          evt = JSON.parse(jsonStr)
        } catch {
          continue
        }

        if (evt.type === 'text') {
          onDelta?.(evt.value)
        } else if (evt.type === 'done') {
          onDone?.()
          return
        } else if (evt.type === 'error') {
          onError?.(new Error(evt.value))
          return
        }
      }
    }
    // Stream ended without an explicit done event
    onDone?.()
  } catch (err) {
    if (err.name !== 'AbortError') onError?.(err)
  }
}
