import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { isSupported, startRecognition, stopRecognition } from './voice'

class SpeechRecognitionStub {
  static instances = []

  static reset() {
    SpeechRecognitionStub.instances = []
  }

  constructor() {
    this.lang = ''
    this.continuous = null
    this.interimResults = null
    this.onresult = null
    this.onerror = null
    this.onend = null
    this.started = false
    this.start = vi.fn(() => {
      this.started = true
    })
    this.stop = vi.fn(() => {
      this.started = false
      if (this.onend) this.onend()
    })
    SpeechRecognitionStub.instances.push(this)
  }

  emitResult(items) {
    const results = items.map(({ transcript, isFinal }) => {
      const result = [{ transcript }]
      result.isFinal = isFinal
      return result
    })
    if (this.onresult) this.onresult({ results })
  }

  emitError(error, message = '') {
    if (this.onerror) this.onerror({ error, message })
  }

  emitEnd() {
    if (this.onend) this.onend()
  }
}

beforeEach(() => {
  stopRecognition()
  SpeechRecognitionStub.reset()
  delete window.SpeechRecognition
  delete window.webkitSpeechRecognition
})

afterEach(() => {
  stopRecognition()
  delete window.SpeechRecognition
  delete window.webkitSpeechRecognition
})

describe('isSupported', () => {
  it('returns false when neither SpeechRecognition nor webkitSpeechRecognition exists', () => {
    expect(isSupported()).toBe(false)
  })

  it('returns true when window.SpeechRecognition exists', () => {
    window.SpeechRecognition = SpeechRecognitionStub
    expect(isSupported()).toBe(true)
  })

  it('returns true when window.webkitSpeechRecognition exists', () => {
    window.webkitSpeechRecognition = SpeechRecognitionStub
    expect(isSupported()).toBe(true)
  })
})

describe('startRecognition', () => {
  beforeEach(() => {
    window.SpeechRecognition = SpeechRecognitionStub
  })

  it('instantiates with default lang pt-BR, continuous=false, interimResults=true', () => {
    startRecognition({})
    const rec = SpeechRecognitionStub.instances[0]
    expect(rec).toBeDefined()
    expect(rec.lang).toBe('pt-BR')
    expect(rec.continuous).toBe(false)
    expect(rec.interimResults).toBe(true)
    expect(rec.start).toHaveBeenCalledTimes(1)
  })

  it('honors a custom lang and interimResults=false', () => {
    startRecognition({ lang: 'en-US', interimResults: false })
    const rec = SpeechRecognitionStub.instances[0]
    expect(rec.lang).toBe('en-US')
    expect(rec.interimResults).toBe(false)
  })

  it('uses webkitSpeechRecognition when SpeechRecognition is absent', () => {
    delete window.SpeechRecognition
    window.webkitSpeechRecognition = SpeechRecognitionStub
    startRecognition({})
    expect(SpeechRecognitionStub.instances).toHaveLength(1)
  })

  it('returns a no-op handle and reports unsupported via onError when not supported', () => {
    delete window.SpeechRecognition
    delete window.webkitSpeechRecognition
    const onError = vi.fn()
    const handle = startRecognition({ onError })
    expect(handle).toBeDefined()
    expect(typeof handle.stop).toBe('function')
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'unsupported' })
    )
    expect(SpeechRecognitionStub.instances).toHaveLength(0)
  })

  it('fires onResult with concatenated transcript and isFinal=true on a final result', () => {
    const onResult = vi.fn()
    startRecognition({ onResult })
    const rec = SpeechRecognitionStub.instances[0]
    rec.emitResult([
      { transcript: 'hello ', isFinal: true },
      { transcript: 'world', isFinal: true },
    ])
    expect(onResult).toHaveBeenCalledWith({ transcript: 'hello world', isFinal: true })
  })

  it('fires onResult with isFinal=false on interim results', () => {
    const onResult = vi.fn()
    startRecognition({ onResult })
    const rec = SpeechRecognitionStub.instances[0]
    rec.emitResult([{ transcript: 'partial', isFinal: false }])
    expect(onResult).toHaveBeenCalledWith({ transcript: 'partial', isFinal: false })
  })

  it('treats isFinal as the final flag of the latest result when results mix interim and final', () => {
    const onResult = vi.fn()
    startRecognition({ onResult })
    const rec = SpeechRecognitionStub.instances[0]
    rec.emitResult([
      { transcript: 'hello ', isFinal: true },
      { transcript: 'wor', isFinal: false },
    ])
    expect(onResult).toHaveBeenCalledWith({ transcript: 'hello wor', isFinal: false })
  })

  it('fires onError with code and message when recognition errors', () => {
    const onError = vi.fn()
    startRecognition({ onError })
    const rec = SpeechRecognitionStub.instances[0]
    rec.emitError('not-allowed', 'mic blocked')
    expect(onError).toHaveBeenCalledWith({ code: 'not-allowed', message: 'mic blocked' })
  })

  it('forwards each documented error code to onError', () => {
    const onError = vi.fn()
    startRecognition({ onError })
    const rec = SpeechRecognitionStub.instances[0]
    for (const code of ['nomatch', 'network', 'aborted', 'service-not-allowed']) {
      rec.emitError(code)
      expect(onError).toHaveBeenLastCalledWith({ code, message: '' })
    }
  })

  it('fires onEnd when recognition ends', () => {
    const onEnd = vi.fn()
    startRecognition({ onEnd })
    const rec = SpeechRecognitionStub.instances[0]
    rec.emitEnd()
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it('returns the existing handle when called concurrently and does not create a second recognition', () => {
    const handle1 = startRecognition({})
    const handle2 = startRecognition({})
    expect(SpeechRecognitionStub.instances).toHaveLength(1)
    expect(handle2).toBe(handle1)
  })
})

describe('stopRecognition', () => {
  beforeEach(() => {
    window.SpeechRecognition = SpeechRecognitionStub
  })

  it('calls recognition.stop() when active', () => {
    startRecognition({})
    const rec = SpeechRecognitionStub.instances[0]
    stopRecognition()
    expect(rec.stop).toHaveBeenCalledTimes(1)
  })

  it('is idempotent — safe to call when nothing is running', () => {
    expect(() => stopRecognition()).not.toThrow()
  })

  it('is idempotent — safe to call multiple times after start', () => {
    startRecognition({})
    stopRecognition()
    expect(() => stopRecognition()).not.toThrow()
  })

  it('clears active state so a new startRecognition creates a new instance', () => {
    startRecognition({})
    stopRecognition()
    startRecognition({})
    expect(SpeechRecognitionStub.instances).toHaveLength(2)
  })

  it('the handle returned by startRecognition exposes a working stop()', () => {
    const handle = startRecognition({})
    const rec = SpeechRecognitionStub.instances[0]
    handle.stop()
    expect(rec.stop).toHaveBeenCalledTimes(1)
  })
})
