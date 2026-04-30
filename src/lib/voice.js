let active = null

function getRecognitionCtor() {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

export function isSupported() {
  return Boolean(getRecognitionCtor())
}

export function startRecognition({
  lang = 'pt-BR',
  interimResults = true,
  onResult,
  onError,
  onEnd,
} = {}) {
  if (active) return active

  const Ctor = getRecognitionCtor()
  if (!Ctor) {
    if (onError) {
      onError({ code: 'unsupported', message: 'Web Speech API not supported' })
    }
    return { stop: () => {} }
  }

  const recognition = new Ctor()
  recognition.lang = lang
  recognition.continuous = false
  recognition.interimResults = interimResults

  recognition.onresult = (event) => {
    if (!onResult) return
    let transcript = ''
    for (let i = 0; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript
    }
    const isFinal =
      event.results.length > 0 &&
      Boolean(event.results[event.results.length - 1].isFinal)
    onResult({ transcript, isFinal })
  }

  recognition.onerror = (event) => {
    if (onError) onError({ code: event.error, message: event.message || '' })
  }

  recognition.onend = () => {
    active = null
    if (onEnd) onEnd()
  }

  recognition.start()

  const handle = {
    recognition,
    stop() {
      try {
        recognition.stop()
      } catch {
        // already stopped — ignore
      }
    },
  }
  active = handle
  return handle
}

export function stopRecognition() {
  if (!active) return
  const handle = active
  active = null
  try {
    handle.recognition.stop()
  } catch {
    // already stopped — ignore
  }
}
