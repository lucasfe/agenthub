import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  instantiateTemplate,
  TemplateInstantiationError,
} from './instantiateTemplate'

function mockSupabase(rpcResult) {
  const rpc = vi.fn().mockResolvedValue(rpcResult)
  return { client: { rpc }, rpc }
}

let consoleErrorSpy
beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  consoleErrorSpy.mockRestore()
})

describe('instantiateTemplate', () => {
  it('calls the instantiate_template RPC with the template id and params', async () => {
    const { client, rpc } = mockSupabase({ data: 'task-uuid', error: null })
    const taskId = await instantiateTemplate(client, 'tpl-1', { topic: 'mental health' })
    expect(rpc).toHaveBeenCalledWith('instantiate_template', {
      p_template_id: 'tpl-1',
      p_params: { topic: 'mental health' },
    })
    expect(taskId).toBe('task-uuid')
  })

  it('unwraps the new task id when the RPC returns a row object', async () => {
    const { client } = mockSupabase({ data: { id: 'task-uuid' }, error: null })
    const taskId = await instantiateTemplate(client, 'tpl-1', {})
    expect(taskId).toBe('task-uuid')
  })

  it('unwraps the new task id from a single-element array', async () => {
    const { client } = mockSupabase({ data: [{ id: 'task-uuid' }], error: null })
    const taskId = await instantiateTemplate(client, 'tpl-1', {})
    expect(taskId).toBe('task-uuid')
  })

  it('throws TemplateInstantiationError with the Supabase message on RPC error', async () => {
    const { client } = mockSupabase({
      data: null,
      error: { message: 'param "topic" is required' },
    })
    await expect(instantiateTemplate(client, 'tpl-1', {})).rejects.toBeInstanceOf(
      TemplateInstantiationError,
    )
    await expect(instantiateTemplate(client, 'tpl-1', {})).rejects.toMatchObject({
      message: 'param "topic" is required',
    })
  })

  it('passes an empty params object when none is provided', async () => {
    const { client, rpc } = mockSupabase({ data: 'task-uuid', error: null })
    await instantiateTemplate(client, 'tpl-1')
    expect(rpc).toHaveBeenCalledWith('instantiate_template', {
      p_template_id: 'tpl-1',
      p_params: {},
    })
  })

  it('throws TemplateInstantiationError when the supabase client is missing', async () => {
    await expect(instantiateTemplate(null, 'tpl-1', {})).rejects.toBeInstanceOf(
      TemplateInstantiationError,
    )
  })

  it('throws TemplateInstantiationError when no task id can be derived from the response', async () => {
    const { client } = mockSupabase({ data: null, error: null })
    await expect(instantiateTemplate(client, 'tpl-1', {})).rejects.toBeInstanceOf(
      TemplateInstantiationError,
    )
  })
})
