import { describe, expect, it } from 'vitest'
import {
  applyFileRerender,
  countApproved,
  getFileApprovalState,
  imageFiles,
  isFullyApproved,
  setFileApprovalState,
  totalImages,
} from './dianaGallery'

const buildStep = (files = []) => ({
  id: 1,
  agent_id: 'diana-design',
  status: 'awaiting_approval',
  output_files: files,
})

const imgFile = (overrides = {}) => ({
  storage_path: 'tasks/abc/feed_001.jpg',
  signed_url: 'https://example.com/feed_001.jpg',
  mime_type: 'image/jpeg',
  width: 1080,
  height: 1080,
  ...overrides,
})

describe('imageFiles', () => {
  it('returns only image files with their original indices', () => {
    const step = buildStep([
      imgFile({ storage_path: 'a.jpg' }),
      { mime_type: 'application/pdf', storage_path: 'b.pdf' },
      imgFile({ storage_path: 'c.png', mime_type: 'image/png' }),
    ])
    const result = imageFiles(step)
    expect(result).toHaveLength(2)
    expect(result[0].idx).toBe(0)
    expect(result[1].idx).toBe(2)
    expect(result[0].file.storage_path).toBe('a.jpg')
    expect(result[1].file.storage_path).toBe('c.png')
  })

  it('handles missing or non-array output_files', () => {
    expect(imageFiles({})).toEqual([])
    expect(imageFiles({ output_files: null })).toEqual([])
    expect(imageFiles({ output_files: 'nope' })).toEqual([])
  })
})

describe('totalImages', () => {
  it('counts image files only', () => {
    const step = buildStep([
      imgFile(),
      { mime_type: 'video/mp4' },
      imgFile({ mime_type: 'image/png' }),
    ])
    expect(totalImages(step)).toBe(2)
  })
})

describe('getFileApprovalState', () => {
  it('defaults to pending when not set', () => {
    expect(getFileApprovalState(imgFile())).toBe('pending')
  })

  it('reads explicit approval_state', () => {
    expect(getFileApprovalState(imgFile({ approval_state: 'approved' }))).toBe(
      'approved',
    )
    expect(
      getFileApprovalState(imgFile({ approval_state: 'edit_requested' })),
    ).toBe('edit_requested')
  })

  it('falls back to pending for unknown state values', () => {
    expect(getFileApprovalState(imgFile({ approval_state: 'banana' }))).toBe(
      'pending',
    )
  })
})

describe('setFileApprovalState', () => {
  it('returns a new step with updated file approval_state', () => {
    const step = buildStep([imgFile(), imgFile()])
    const next = setFileApprovalState(step, 0, 'approved')
    expect(next).not.toBe(step)
    expect(next.output_files[0].approval_state).toBe('approved')
    expect(next.output_files[1].approval_state).toBeUndefined()
  })

  it('persists feedback when transitioning to edit_requested', () => {
    const step = buildStep([imgFile()])
    const next = setFileApprovalState(step, 0, 'edit_requested', 'lighter colors')
    expect(next.output_files[0].approval_state).toBe('edit_requested')
    expect(next.output_files[0].feedback).toBe('lighter colors')
  })

  it('clears feedback when transitioning to approved', () => {
    const step = buildStep([
      imgFile({ approval_state: 'edit_requested', feedback: 'lighter' }),
    ])
    const next = setFileApprovalState(step, 0, 'approved')
    expect(next.output_files[0].approval_state).toBe('approved')
    expect(next.output_files[0].feedback).toBeUndefined()
  })

  it('throws on out-of-range index', () => {
    const step = buildStep([imgFile()])
    expect(() => setFileApprovalState(step, 5, 'approved')).toThrow(
      /file index/i,
    )
  })

  it('rejects unknown states', () => {
    const step = buildStep([imgFile()])
    expect(() => setFileApprovalState(step, 0, 'banana')).toThrow(
      /approval state/i,
    )
  })
})

describe('applyFileRerender', () => {
  it('replaces file at idx and resets approval_state to pending', () => {
    const step = buildStep([
      imgFile({ approval_state: 'edit_requested', feedback: 'darker' }),
      imgFile({ approval_state: 'approved' }),
    ])
    const newFile = imgFile({ storage_path: 'tasks/abc/feed_001_v2.jpg' })
    const next = applyFileRerender(step, 0, newFile)
    expect(next.output_files[0].storage_path).toBe(
      'tasks/abc/feed_001_v2.jpg',
    )
    expect(next.output_files[0].approval_state).toBe('pending')
    expect(next.output_files[0].feedback).toBeUndefined()
    expect(next.output_files[1].approval_state).toBe('approved')
  })

  it('throws on out-of-range index', () => {
    const step = buildStep([imgFile()])
    expect(() => applyFileRerender(step, 5, imgFile())).toThrow(/file index/i)
  })
})

describe('countApproved', () => {
  it('counts only approved image files', () => {
    const step = buildStep([
      imgFile({ approval_state: 'approved' }),
      imgFile({ approval_state: 'pending' }),
      imgFile({ approval_state: 'approved' }),
      { mime_type: 'video/mp4', approval_state: 'approved' },
    ])
    expect(countApproved(step)).toBe(2)
  })
})

describe('isFullyApproved', () => {
  it('is true when every image file is approved', () => {
    const step = buildStep([
      imgFile({ approval_state: 'approved' }),
      imgFile({ approval_state: 'approved' }),
    ])
    expect(isFullyApproved(step)).toBe(true)
  })

  it('is false when any image file is not approved', () => {
    const step = buildStep([
      imgFile({ approval_state: 'approved' }),
      imgFile({ approval_state: 'pending' }),
    ])
    expect(isFullyApproved(step)).toBe(false)
  })

  it('is false when there are no image files at all', () => {
    expect(isFullyApproved(buildStep([]))).toBe(false)
  })
})
