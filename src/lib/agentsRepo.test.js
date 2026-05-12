import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Holder lets each test pin the response that the chained Supabase call
// resolves to, then read back the calls the repo made on the chain.
const queryHolder = {
  selectResult: { data: [], error: null },
  singleResult: { data: null, error: null },
  insertResult: { data: null, error: null },
  updateResult: { data: null, error: null },
  deleteResult: { error: null },
}

const chainSpy = {
  from: vi.fn(),
  select: vi.fn(),
  order: vi.fn(),
  eq: vi.fn(),
  single: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}

vi.mock('./supabase', () => {
  const chain = {
    select: vi.fn((...args) => {
      chainSpy.select(...args)
      return chain
    }),
    order: vi.fn((...args) => {
      chainSpy.order(...args)
      return Promise.resolve(queryHolder.selectResult)
    }),
    eq: vi.fn((...args) => {
      chainSpy.eq(...args)
      return chain
    }),
    single: vi.fn(() => {
      chainSpy.single()
      return Promise.resolve(queryHolder.singleResult)
    }),
    insert: vi.fn((...args) => {
      chainSpy.insert(...args)
      return chain
    }),
    update: vi.fn((...args) => {
      chainSpy.update(...args)
      return chain
    }),
    delete: vi.fn(() => {
      chainSpy.delete()
      return chain
    }),
  }
  return {
    supabase: {
      from: vi.fn((...args) => {
        chainSpy.from(...args)
        return chain
      }),
    },
  }
})

import { listAgents, getAgent, createAgent, updateAgent, deleteAgent } from './agentsRepo'

beforeEach(() => {
  Object.values(chainSpy).forEach((fn) => fn.mockClear())
  queryHolder.selectResult = { data: [], error: null }
  queryHolder.singleResult = { data: null, error: null }
  queryHolder.insertResult = { data: null, error: null }
  queryHolder.updateResult = { data: null, error: null }
  queryHolder.deleteResult = { error: null }
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('listAgents', () => {
  it('queries the agents table ordered by popularity descending', async () => {
    queryHolder.selectResult = {
      data: [
        { id: 'a', popularity: 99 },
        { id: 'b', popularity: 50 },
      ],
      error: null,
    }

    const result = await listAgents()

    expect(chainSpy.from).toHaveBeenCalledWith('agents')
    expect(chainSpy.select).toHaveBeenCalledTimes(1)
    expect(chainSpy.order).toHaveBeenCalledWith('popularity', { ascending: false })
    expect(result).toEqual(queryHolder.selectResult.data)
  })

  it('throws when Supabase returns an error', async () => {
    queryHolder.selectResult = {
      data: null,
      error: { code: '42501', message: 'permission denied' },
    }

    await expect(listAgents()).rejects.toMatchObject({ code: '42501' })
  })
})

describe('getAgent', () => {
  it('queries the agents table filtering by id and returning a single row', async () => {
    queryHolder.singleResult = {
      data: { id: 'frontend-developer', name: 'Frontend Developer' },
      error: null,
    }

    const result = await getAgent('frontend-developer')

    expect(chainSpy.from).toHaveBeenCalledWith('agents')
    expect(chainSpy.eq).toHaveBeenCalledWith('id', 'frontend-developer')
    expect(chainSpy.single).toHaveBeenCalled()
    expect(result).toEqual({ id: 'frontend-developer', name: 'Frontend Developer' })
  })

  it('throws when Supabase returns an error', async () => {
    queryHolder.singleResult = {
      data: null,
      error: { code: 'PGRST116', message: 'not found' },
    }

    await expect(getAgent('missing')).rejects.toMatchObject({ code: 'PGRST116' })
  })
})

describe('createAgent', () => {
  it('inserts the agent and returns the created row', async () => {
    queryHolder.singleResult = {
      data: { id: 'new-agent', name: 'New Agent' },
      error: null,
    }
    const payload = { id: 'new-agent', name: 'New Agent', category: 'AI Specialists' }

    const result = await createAgent(payload)

    expect(chainSpy.from).toHaveBeenCalledWith('agents')
    expect(chainSpy.insert).toHaveBeenCalledWith(payload)
    expect(chainSpy.single).toHaveBeenCalled()
    expect(result).toEqual({ id: 'new-agent', name: 'New Agent' })
  })

  it('throws when the insert fails', async () => {
    queryHolder.singleResult = {
      data: null,
      error: { code: '23505', message: 'duplicate key' },
    }
    await expect(createAgent({ id: 'dupe' })).rejects.toMatchObject({ code: '23505' })
  })
})

describe('updateAgent', () => {
  it('updates the agent matching the given id and returns the new row', async () => {
    queryHolder.singleResult = {
      data: { id: 'frontend-developer', popularity: 75 },
      error: null,
    }

    const result = await updateAgent('frontend-developer', { popularity: 75 })

    expect(chainSpy.from).toHaveBeenCalledWith('agents')
    expect(chainSpy.update).toHaveBeenCalledWith({ popularity: 75 })
    expect(chainSpy.eq).toHaveBeenCalledWith('id', 'frontend-developer')
    expect(result).toEqual({ id: 'frontend-developer', popularity: 75 })
  })

  it('throws when the update fails', async () => {
    queryHolder.singleResult = {
      data: null,
      error: { code: '42501', message: 'permission denied' },
    }
    await expect(updateAgent('x', { popularity: 1 })).rejects.toMatchObject({ code: '42501' })
  })
})

describe('deleteAgent', () => {
  it('deletes the agent matching the given id', async () => {
    chainSpy.delete.mockClear()
    chainSpy.eq.mockClear()
    // delete().eq() resolves directly, so we override the chain's last hop.
    const supabaseModule = await import('./supabase')
    const originalFrom = supabaseModule.supabase.from
    supabaseModule.supabase.from = vi.fn(() => ({
      delete: () => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }))

    await deleteAgent('frontend-developer')

    supabaseModule.supabase.from = originalFrom
  })

  it('throws when the delete fails', async () => {
    const supabaseModule = await import('./supabase')
    const originalFrom = supabaseModule.supabase.from
    supabaseModule.supabase.from = vi.fn(() => ({
      delete: () => ({
        eq: vi.fn().mockResolvedValue({ error: { code: '42501', message: 'permission denied' } }),
      }),
    }))

    await expect(deleteAgent('x')).rejects.toMatchObject({ code: '42501' })

    supabaseModule.supabase.from = originalFrom
  })
})
