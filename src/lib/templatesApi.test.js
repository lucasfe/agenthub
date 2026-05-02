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
  let consoleErrorSpy

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    queryHolder.result = { data: [], error: null }
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
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
})
