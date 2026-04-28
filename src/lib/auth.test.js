import { describe, it, expect } from 'vitest'
import { isAllowed, parseAllowlist } from './auth'

describe('parseAllowlist', () => {
  it('returns an empty array when the input is not a string', () => {
    expect(parseAllowlist(undefined)).toEqual([])
    expect(parseAllowlist(null)).toEqual([])
    expect(parseAllowlist(42)).toEqual([])
  })

  it('returns an empty array for an empty or whitespace-only string', () => {
    expect(parseAllowlist('')).toEqual([])
    expect(parseAllowlist('   ')).toEqual([])
  })

  it('lowercases, trims, and drops empty entries', () => {
    expect(parseAllowlist(' Foo@Example.COM ,bar@x.com,, ,baz@x.com,'))
      .toEqual(['foo@example.com', 'bar@x.com', 'baz@x.com'])
  })
})

describe('isAllowed', () => {
  it('returns false when the env value is undefined, empty, or whitespace', () => {
    expect(isAllowed('lucasfe@gmail.com', undefined)).toBe(false)
    expect(isAllowed('lucasfe@gmail.com', '')).toBe(false)
    expect(isAllowed('lucasfe@gmail.com', '   ')).toBe(false)
  })

  it('returns false for an email not on the list', () => {
    expect(isAllowed('intruder@x.com', 'lucasfe@gmail.com')).toBe(false)
  })

  it('returns true for an email on the list', () => {
    expect(isAllowed('lucasfe@gmail.com', 'lucasfe@gmail.com')).toBe(true)
  })

  it('compares case-insensitively on both sides', () => {
    expect(isAllowed('Lucasfe@Gmail.COM', 'lucasfe@gmail.com')).toBe(true)
    expect(isAllowed('lucasfe@gmail.com', 'LUCASFE@GMAIL.COM')).toBe(true)
  })

  it('trims surrounding whitespace on the email and the list entries', () => {
    expect(isAllowed('  lucasfe@gmail.com  ', ' a@x.com, lucasfe@gmail.com ')).toBe(true)
  })

  it('skips empty entries from a malformed list', () => {
    expect(isAllowed('a@x.com', ',a@x.com,,')).toBe(true)
  })

  it('returns false when the email is not a string or is empty', () => {
    expect(isAllowed(undefined, 'lucasfe@gmail.com')).toBe(false)
    expect(isAllowed(null, 'lucasfe@gmail.com')).toBe(false)
    expect(isAllowed('', 'lucasfe@gmail.com')).toBe(false)
    expect(isAllowed('   ', 'lucasfe@gmail.com')).toBe(false)
  })
})
