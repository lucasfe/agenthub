import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { downloadText, safeFilename } from './download'

describe('safeFilename', () => {
  it('falls back when the input is empty or non-string', () => {
    expect(safeFilename('')).toBe('output')
    expect(safeFilename(null, 'nope')).toBe('nope')
    expect(safeFilename(undefined)).toBe('output')
  })

  it('lowercases and replaces unsafe characters', () => {
    expect(safeFilename('My Report 2026/!')).toBe('my-report-2026-')
    expect(safeFilename('  Frontend  Developer  ')).toBe('frontend-developer')
  })

  it('keeps dots and underscores', () => {
    expect(safeFilename('agent_name.v2')).toBe('agent_name.v2')
  })
})

describe('downloadText', () => {
  let originalCreateObjectURL
  let originalRevokeObjectURL
  let createSpy
  let revokeSpy
  let clickSpy

  beforeEach(() => {
    originalCreateObjectURL = URL.createObjectURL
    originalRevokeObjectURL = URL.revokeObjectURL
    createSpy = vi.fn(() => 'blob://fake')
    revokeSpy = vi.fn()
    URL.createObjectURL = createSpy
    URL.revokeObjectURL = revokeSpy
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
    clickSpy.mockRestore()
  })

  it('creates a blob URL and clicks the anchor', () => {
    downloadText('hello', 'test.md')
    expect(createSpy).toHaveBeenCalledOnce()
    const blob = createSpy.mock.calls[0][0]
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('text/markdown')
    expect(clickSpy).toHaveBeenCalledOnce()
  })

  it('guesses mime from filename when not provided', () => {
    downloadText('{}', 'data.json')
    const blob = createSpy.mock.calls[0][0]
    expect(blob.type).toBe('application/json')
  })

  it('falls back to text/plain when mime is unknown', () => {
    downloadText('raw', 'weird.xyz')
    const blob = createSpy.mock.calls[0][0]
    expect(blob.type).toBe('text/plain')
  })

  it('accepts an explicit mime override', () => {
    downloadText('hi', 'file.bin', 'application/octet-stream')
    const blob = createSpy.mock.calls[0][0]
    expect(blob.type).toBe('application/octet-stream')
  })
})
