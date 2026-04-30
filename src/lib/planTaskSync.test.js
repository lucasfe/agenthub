import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createTaskFromPlan,
  updateTaskPlan,
  markTaskApproved,
  markTaskDone,
  markTaskCancelled,
  markTaskError,
  deriveTitle,
} from './planTaskSync'

function mockSupabase({
  insertResult = { data: { id: 'task-1', status: 'todo' }, error: null },
  updateResult = { error: null },
} = {}) {
  const insertSelectSingle = vi.fn().mockResolvedValue(insertResult)
  const insertSelect = { single: insertSelectSingle }
  const insertReturn = { select: vi.fn(() => insertSelect) }
  const insert = vi.fn(() => insertReturn)
  const updateEq = vi.fn().mockResolvedValue(updateResult)
  const update = vi.fn(() => ({ eq: updateEq }))
  const from = vi.fn(() => ({ insert, update }))
  return { client: { from }, from, insert, update, updateEq, insertSelectSingle }
}

let consoleErrorSpy
beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  consoleErrorSpy.mockRestore()
})

describe('planTaskSync', () => {
  describe('createTaskFromPlan', () => {
    it('inserts a task into the tasks table with status todo, the plan, and a derived title', async () => {
      const { client, from, insert } = mockSupabase()
      const plan = { steps: [{ id: 1, agent_id: 'frontend-developer', task: 'Sketch UI' }] }
      const result = await createTaskFromPlan(client, {
        plan,
        originalTask: 'Build a landing page for the new product launch',
      })

      expect(from).toHaveBeenCalledWith('tasks')
      expect(insert).toHaveBeenCalledTimes(1)
      const insertArg = insert.mock.calls[0][0]
      expect(insertArg).toMatchObject({
        status: 'todo',
        plan,
        title: 'Build a landing page for the new product launch',
        description: 'Build a landing page for the new product launch',
      })
      expect(result).toEqual({ id: 'task-1', status: 'todo' })
    })

    it('truncates a long original task into a title at most 80 characters', async () => {
      const { client, insert } = mockSupabase()
      const longTask = 'a'.repeat(120)
      await createTaskFromPlan(client, { plan: {}, originalTask: longTask })
      const arg = insert.mock.calls[0][0]
      expect(arg.title.length).toBeLessThanOrEqual(80)
      expect(arg.description).toBe(longTask)
    })

    it('uses only the first line of the original task in the title', async () => {
      const { client, insert } = mockSupabase()
      await createTaskFromPlan(client, {
        plan: {},
        originalTask: 'First line\nSecond line\nThird line',
      })
      const arg = insert.mock.calls[0][0]
      expect(arg.title).toBe('First line')
      expect(arg.description).toBe('First line\nSecond line\nThird line')
    })

    it('falls back to a default title when originalTask is empty', async () => {
      const { client, insert } = mockSupabase()
      await createTaskFromPlan(client, { plan: {}, originalTask: '' })
      const arg = insert.mock.calls[0][0]
      expect(arg.title).toBe('AI Assistant task')
      expect(arg.description).toBe('')
    })

    it('returns null when supabase is not configured', async () => {
      const result = await createTaskFromPlan(null, { plan: {}, originalTask: 'x' })
      expect(result).toBeNull()
    })

    it('returns null and logs when the insert fails', async () => {
      const { client } = mockSupabase({
        insertResult: { data: null, error: { message: 'oops' } },
      })
      const result = await createTaskFromPlan(client, { plan: {}, originalTask: 'x' })
      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalled()
    })
  })

  describe('updateTaskPlan', () => {
    it('updates the plan field on the existing task row', async () => {
      const { client, from, update, updateEq } = mockSupabase()
      const plan = { steps: [{ id: 1, agent_id: 'a', task: 'refined' }] }
      await updateTaskPlan(client, 'task-1', plan)

      expect(from).toHaveBeenCalledWith('tasks')
      expect(update).toHaveBeenCalledWith({ plan })
      expect(updateEq).toHaveBeenCalledWith('id', 'task-1')
    })

    it('is a no-op when taskId is missing', async () => {
      const { client, update } = mockSupabase()
      await updateTaskPlan(client, null, {})
      expect(update).not.toHaveBeenCalled()
    })

    it('is a no-op when supabase is not configured', async () => {
      await expect(updateTaskPlan(null, 'task-1', {})).resolves.toBeUndefined()
    })
  })

  describe('markTaskApproved', () => {
    it('updates the task to status executing and clears error_message', async () => {
      const { client, from, update, updateEq } = mockSupabase()
      await markTaskApproved(client, 'task-1')
      expect(from).toHaveBeenCalledWith('tasks')
      expect(update).toHaveBeenCalledWith({ status: 'executing', error_message: null })
      expect(updateEq).toHaveBeenCalledWith('id', 'task-1')
    })

    it('is a no-op when taskId is missing', async () => {
      const { client, update } = mockSupabase()
      await markTaskApproved(client, null)
      expect(update).not.toHaveBeenCalled()
    })

    it('is a no-op when supabase is not configured', async () => {
      await expect(markTaskApproved(null, 'task-1')).resolves.toBeUndefined()
    })
  })

  describe('markTaskDone', () => {
    it('updates the task to status done', async () => {
      const { client, update, updateEq } = mockSupabase()
      await markTaskDone(client, 'task-1')
      expect(update).toHaveBeenCalledWith({ status: 'done' })
      expect(updateEq).toHaveBeenCalledWith('id', 'task-1')
    })

    it('is a no-op when taskId is missing', async () => {
      const { client, update } = mockSupabase()
      await markTaskDone(client, null)
      expect(update).not.toHaveBeenCalled()
    })
  })

  describe('markTaskCancelled', () => {
    it('updates the task to status cancelled with the supplied reason', async () => {
      const { client, update, updateEq } = mockSupabase()
      await markTaskCancelled(client, 'task-1', 'User stopped run')
      expect(update).toHaveBeenCalledWith({
        status: 'cancelled',
        error_message: 'User stopped run',
      })
      expect(updateEq).toHaveBeenCalledWith('id', 'task-1')
    })

    it('falls back to a default cancellation reason', async () => {
      const { client, update } = mockSupabase()
      await markTaskCancelled(client, 'task-1')
      expect(update).toHaveBeenCalledWith({
        status: 'cancelled',
        error_message: 'Cancelled by user',
      })
    })

    it('is a no-op when taskId is missing', async () => {
      const { client, update } = mockSupabase()
      await markTaskCancelled(client, null)
      expect(update).not.toHaveBeenCalled()
    })
  })

  describe('markTaskError', () => {
    it('updates the task to status error with the supplied message', async () => {
      const { client, update, updateEq } = mockSupabase()
      await markTaskError(client, 'task-1', 'Sub-agent exploded')
      expect(update).toHaveBeenCalledWith({
        status: 'error',
        error_message: 'Sub-agent exploded',
      })
      expect(updateEq).toHaveBeenCalledWith('id', 'task-1')
    })

    it('falls back to a generic error message when none is provided', async () => {
      const { client, update } = mockSupabase()
      await markTaskError(client, 'task-1')
      expect(update).toHaveBeenCalledWith({
        status: 'error',
        error_message: 'Run failed',
      })
    })

    it('is a no-op when taskId is missing', async () => {
      const { client, update } = mockSupabase()
      await markTaskError(client, null, 'x')
      expect(update).not.toHaveBeenCalled()
    })
  })

  describe('deriveTitle', () => {
    it('returns a fallback title for empty input', () => {
      expect(deriveTitle('')).toBe('AI Assistant task')
      expect(deriveTitle(null)).toBe('AI Assistant task')
      expect(deriveTitle(undefined)).toBe('AI Assistant task')
    })

    it('returns the first line untouched when it fits within 80 characters', () => {
      expect(deriveTitle('Short title')).toBe('Short title')
    })

    it('truncates long single-line input with an ellipsis at 80 characters', () => {
      const input = 'a'.repeat(100)
      const out = deriveTitle(input)
      expect(out.length).toBe(80)
      expect(out.endsWith('...')).toBe(true)
    })

    it('uses only the first line when the input contains line breaks', () => {
      expect(deriveTitle('hello\nworld')).toBe('hello')
    })
  })
})
