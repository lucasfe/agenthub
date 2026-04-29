import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { trackAgentUsage } from './api'
import { supabase } from './supabase'

describe('trackAgentUsage', () => {
  let warnSpy

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns null and skips the RPC when agentId is empty', async () => {
    const rpc = vi.spyOn(supabase, 'rpc')
    const result = await trackAgentUsage('', 'cart_add')
    expect(result).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('forwards agent_id to the increment_agent_usage RPC', async () => {
    const rpc = vi
      .spyOn(supabase, 'rpc')
      .mockResolvedValue({ data: 7, error: null })
    const result = await trackAgentUsage('frontend-developer', 'cart_add')
    expect(rpc).toHaveBeenCalledWith('increment_agent_usage', {
      p_agent_id: 'frontend-developer',
    })
    expect(result).toBe(7)
  })

  it('returns null and warns on RPC errors instead of throwing', async () => {
    vi.spyOn(supabase, 'rpc').mockResolvedValue({
      data: null,
      error: { message: 'rls denied' },
    })
    const result = await trackAgentUsage('frontend-developer', 'orchestrator_invoke')
    expect(result).toBeNull()
    expect(warnSpy).toHaveBeenCalled()
  })

  it('returns null and warns when the RPC throws synchronously', async () => {
    vi.spyOn(supabase, 'rpc').mockImplementation(() => {
      throw new Error('boom')
    })
    const result = await trackAgentUsage('frontend-developer', 'cart_add')
    expect(result).toBeNull()
    expect(warnSpy).toHaveBeenCalled()
  })

  it('returns null when the RPC payload is not numeric', async () => {
    vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: null, error: null })
    const result = await trackAgentUsage('frontend-developer', 'cart_add')
    expect(result).toBeNull()
  })
})
