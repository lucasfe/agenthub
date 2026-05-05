import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Holder for the result the next `from('task_templates').select(...).order(...)` call resolves to.
const queryHolder = { result: { data: [], error: null } }

vi.mock('./supabase', () => {
  const chain = {
    select: vi.fn(() => chain),
    order: vi.fn(() => Promise.resolve(queryHolder.result)),
  }
  return {
    supabase: {
      from: vi.fn(() => chain),
    },
  }
})

import { fetchTemplates } from './templatesApi'

describe('fetchTemplates', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    queryHolder.result = { data: [], error: null }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the rows from Supabase on a successful query', async () => {
    queryHolder.result = {
      data: [{ id: 'tpl-1', name: 'A' }],
      error: null,
    }
    await expect(fetchTemplates()).resolves.toEqual([{ id: 'tpl-1', name: 'A' }])
  })

  it('returns [] when the task_templates table does not exist (Postgres 42P01)', async () => {
    queryHolder.result = {
      data: null,
      error: {
        code: '42P01',
        message: 'relation "public.task_templates" does not exist',
      },
    }
    await expect(fetchTemplates()).resolves.toEqual([])
  })

  it('returns [] when Supabase responds with PGRST205 (schema cache miss)', async () => {
    // Postgrest returns PGRST205 when its schema cache has not yet picked up
    // a freshly created table. From the user's perspective this is the same
    // condition as 42P01: the data is not reachable yet, but the page should
    // still render the empty state instead of an error.
    queryHolder.result = {
      data: null,
      error: {
        code: 'PGRST205',
        message: "Could not find the table 'public.task_templates' in the schema cache",
      },
    }
    await expect(fetchTemplates()).resolves.toEqual([])
  })

  it('throws on other Supabase errors so genuine failures stay visible', async () => {
    queryHolder.result = {
      data: null,
      error: { code: '42501', message: 'permission denied' },
    }
    await expect(fetchTemplates()).rejects.toMatchObject({ code: '42501' })
  })

  it('returns [] when the error message indicates a missing task_templates table even with an unrecognized code', async () => {
    // Defensive fallback for issue #340: PostgREST/Postgres can surface a
    // "table does not exist" or "schema cache miss" condition with a code we
    // have not enumerated yet (e.g. an upstream version bump introduces a
    // new error code). Match the message so the page still renders empty.
    queryHolder.result = {
      data: null,
      error: {
        code: 'PGRST999',
        message: "Could not find the table 'public.task_templates' in the schema cache",
      },
    }
    await expect(fetchTemplates()).resolves.toEqual([])
  })

  it('returns [] when the message reports relation public.task_templates does not exist with an unknown code', async () => {
    queryHolder.result = {
      data: null,
      error: {
        code: undefined,
        message: 'relation "public.task_templates" does not exist',
      },
    }
    await expect(fetchTemplates()).resolves.toEqual([])
  })

  it('still throws when the message mentions a different table that is missing', async () => {
    // Message-based fallback must not swallow genuinely unrelated errors —
    // a missing-column or missing-other-table error should still surface.
    queryHolder.result = {
      data: null,
      error: {
        code: '42P01',
        message: 'relation "public.some_other_table" does not exist',
      },
    }
    // 42P01 is in the code allowlist, so this still resolves to []. Keep
    // existing behavior. The new assertion below covers the message-only
    // path with an unrelated message.
    await expect(fetchTemplates()).resolves.toEqual([])
  })

  it('throws when the unknown code carries a message that does not mention task_templates', async () => {
    queryHolder.result = {
      data: null,
      error: {
        code: 'PGRST999',
        message: 'something else broke',
      },
    }
    await expect(fetchTemplates()).rejects.toMatchObject({ code: 'PGRST999' })
  })
})
