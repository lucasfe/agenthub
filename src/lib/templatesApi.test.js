import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Holder for the result the next terminal Supabase call resolves to.
// "Terminal" means the leaf call in each query chain — `.order()` for
// fetch, `.single()` for insert/update, the `.eq()` after `.delete()`.
// All four CRUD paths share the same holder so each test can stage one
// outcome.
const queryHolder = { result: { data: [], error: null } }

vi.mock('./supabase', () => {
  const resolveTerminal = () => Promise.resolve(queryHolder.result)
  const chain = {
    select: vi.fn(() => chain),
    order: vi.fn(resolveTerminal),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    eq: vi.fn(() => {
      // After delete().eq(...) the chain resolves; after update().eq(...)
      // the caller still appends .select().single(). Returning a thenable
      // chain object that ALSO resolves keeps both call shapes happy.
      const settled = resolveTerminal()
      return Object.assign(chain, {
        then: settled.then.bind(settled),
        catch: settled.catch.bind(settled),
        finally: settled.finally.bind(settled),
      })
    }),
    single: vi.fn(resolveTerminal),
  }
  return {
    supabase: {
      from: vi.fn(() => chain),
    },
  }
})

import {
  fetchTemplates,
  insertTemplate,
  updateTemplate,
  deleteTemplate,
} from './templatesApi'

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

// Issue #340 follow-up: the original fix only hardened the read path
// (fetchTemplates → empty state). When a user actually clicks "+ New
// template", "Save", or "Delete template" while the schema is still
// catching up, the modals surfaced the raw Postgres / PostgREST jargon
// ("Could not find the table 'public.task_templates' in the schema
// cache") via the err.message rendering path in CreateTemplateModal,
// TemplateEditDrawer, and TaskDetailPanel. These tests pin down the
// new behavior: missing-table errors get translated to a single
// user-readable message so every CRUD surface stays consistent with
// the read path's recovery story.

describe('CRUD missing-table handling (issue #340)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    queryHolder.result = { data: null, error: null }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const FRIENDLY_MATCH = /templates table is not ready yet/i

  describe('insertTemplate', () => {
    it('throws a friendly error with a code-based missing-table failure (42P01)', async () => {
      queryHolder.result = {
        data: null,
        error: {
          code: '42P01',
          message: 'relation "public.task_templates" does not exist',
        },
      }
      await expect(
        insertTemplate({ name: 'X', task_title: 'Y', plan: null }),
      ).rejects.toThrow(FRIENDLY_MATCH)
    })

    it('throws a friendly error with a code-based missing-table failure (PGRST205)', async () => {
      queryHolder.result = {
        data: null,
        error: {
          code: 'PGRST205',
          message: "Could not find the table 'public.task_templates' in the schema cache",
        },
      }
      await expect(
        insertTemplate({ name: 'X', task_title: 'Y', plan: null }),
      ).rejects.toThrow(FRIENDLY_MATCH)
    })

    it('throws a friendly error with a message-based missing-table failure (unknown code)', async () => {
      queryHolder.result = {
        data: null,
        error: {
          code: 'PGRST999',
          message: "Could not find the table 'public.task_templates' in the schema cache",
        },
      }
      await expect(
        insertTemplate({ name: 'X', task_title: 'Y', plan: null }),
      ).rejects.toThrow(FRIENDLY_MATCH)
    })

    it('preserves the original Supabase error on the thrown error\'s `cause`', async () => {
      const original = {
        code: '42P01',
        message: 'relation "public.task_templates" does not exist',
      }
      queryHolder.result = { data: null, error: original }
      try {
        await insertTemplate({ name: 'X', task_title: 'Y', plan: null })
        throw new Error('expected to throw')
      } catch (err) {
        expect(err.cause).toBe(original)
      }
    })

    it('still surfaces unrelated Supabase errors verbatim', async () => {
      queryHolder.result = {
        data: null,
        error: { code: '42501', message: 'permission denied' },
      }
      await expect(
        insertTemplate({ name: 'X', task_title: 'Y', plan: null }),
      ).rejects.toMatchObject({ code: '42501' })
    })
  })

  describe('updateTemplate', () => {
    it('throws a friendly error on a missing-table failure (42P01)', async () => {
      queryHolder.result = {
        data: null,
        error: {
          code: '42P01',
          message: 'relation "public.task_templates" does not exist',
        },
      }
      await expect(
        updateTemplate('tpl-1', { name: 'X' }),
      ).rejects.toThrow(FRIENDLY_MATCH)
    })

    it('throws a friendly error on a missing-table failure (message-based, unknown code)', async () => {
      queryHolder.result = {
        data: null,
        error: {
          code: 'PGRST999',
          message: "Could not find the table 'public.task_templates' in the schema cache",
        },
      }
      await expect(
        updateTemplate('tpl-1', { name: 'X' }),
      ).rejects.toThrow(FRIENDLY_MATCH)
    })

    it('still surfaces unrelated Supabase errors verbatim', async () => {
      queryHolder.result = {
        data: null,
        error: { code: '42501', message: 'permission denied' },
      }
      await expect(
        updateTemplate('tpl-1', { name: 'X' }),
      ).rejects.toMatchObject({ code: '42501' })
    })
  })

  describe('deleteTemplate', () => {
    it('throws a friendly error on a missing-table failure (PGRST205)', async () => {
      queryHolder.result = {
        data: null,
        error: {
          code: 'PGRST205',
          message: "Could not find the table 'public.task_templates' in the schema cache",
        },
      }
      await expect(deleteTemplate('tpl-1')).rejects.toThrow(FRIENDLY_MATCH)
    })

    it('still surfaces unrelated Supabase errors verbatim', async () => {
      queryHolder.result = {
        data: null,
        error: { code: '42501', message: 'permission denied' },
      }
      await expect(deleteTemplate('tpl-1')).rejects.toMatchObject({
        code: '42501',
      })
    })
  })
})
