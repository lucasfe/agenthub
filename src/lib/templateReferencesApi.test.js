import { describe, it, expect, vi, beforeEach } from 'vitest'

// We mock supabase before importing the module so the module resolves the
// stub from `./supabase`. Each test customises the chain via the helper
// functions below.

let mockClient

vi.mock('./supabase', () => ({
  get supabase() {
    return mockClient
  },
}))

import {
  fetchReferences,
  createTextReference,
  createImageReference,
  updateReference,
  deleteReference,
  getReferenceSignedUrl,
} from './templateReferencesApi'

beforeEach(() => {
  mockClient = null
  vi.clearAllMocks()
})

function buildSelectChain(result) {
  const order = vi.fn().mockResolvedValue(result)
  const eq = vi.fn().mockReturnValue({ order })
  const select = vi.fn().mockReturnValue({ eq })
  return { from: vi.fn().mockReturnValue({ select }), select, eq, order }
}

describe('fetchReferences', () => {
  it('returns rows for the given template_id ordered by created_at', async () => {
    const rows = [
      { id: 'r1', template_id: 't1', key: 'tone', kind: 'text' },
      { id: 'r2', template_id: 't1', key: 'mood', kind: 'image' },
    ]
    const chain = buildSelectChain({ data: rows, error: null })
    mockClient = { from: chain.from }

    const result = await fetchReferences('t1')

    expect(chain.from).toHaveBeenCalledWith('template_references')
    expect(chain.select).toHaveBeenCalledWith('*')
    expect(chain.eq).toHaveBeenCalledWith('template_id', 't1')
    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: true })
    expect(result).toEqual(rows)
  })

  it('returns empty array when supabase is null', async () => {
    mockClient = null
    const result = await fetchReferences('t1')
    expect(result).toEqual([])
  })

  it('throws when supabase returns an unknown error', async () => {
    const chain = buildSelectChain({
      data: null,
      error: { code: '500', message: 'boom' },
    })
    mockClient = { from: chain.from }
    await expect(fetchReferences('t1')).rejects.toThrow(/boom/)
  })

  it('returns empty array when the table is missing (42P01)', async () => {
    const chain = buildSelectChain({
      data: null,
      error: { code: '42P01', message: 'relation does not exist' },
    })
    mockClient = { from: chain.from }
    const result = await fetchReferences('t1')
    expect(result).toEqual([])
  })
})

describe('createTextReference', () => {
  it('inserts a row with kind=text and content_text payload', async () => {
    const row = {
      id: 'r1',
      template_id: 't1',
      key: 'tone',
      kind: 'text',
      content_text: 'Speak warmly',
      original_filename: 'tone.md',
    }
    const single = vi.fn().mockResolvedValue({ data: row, error: null })
    const select = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select })
    mockClient = { from: vi.fn().mockReturnValue({ insert }) }

    const result = await createTextReference('t1', {
      key: 'tone',
      content_text: 'Speak warmly',
      original_filename: 'tone.md',
    })

    expect(mockClient.from).toHaveBeenCalledWith('template_references')
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        template_id: 't1',
        key: 'tone',
        kind: 'text',
        content_text: 'Speak warmly',
        original_filename: 'tone.md',
      }),
    )
    expect(result).toEqual(row)
  })

  it('throws when supabase returns an error', async () => {
    const single = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '500', message: 'insert failed' },
    })
    const select = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select })
    mockClient = { from: vi.fn().mockReturnValue({ insert }) }

    await expect(
      createTextReference('t1', { key: 'tone', content_text: 'x' }),
    ).rejects.toThrow(/insert failed/)
  })
})

describe('createImageReference', () => {
  it('uploads to template-references Storage then inserts a kind=image row', async () => {
    const file = new Blob(['fake png bytes'], { type: 'image/png' })
    file.name = 'mood.png'

    const upload = vi.fn().mockResolvedValue({
      data: { path: 't1/r-uuid.png' },
      error: null,
    })
    const insertedRow = {
      id: 'r-uuid',
      template_id: 't1',
      key: 'mood',
      kind: 'image',
      storage_path: 't1/r-uuid.png',
      mime_type: 'image/png',
      original_filename: 'mood.png',
    }
    const single = vi.fn().mockResolvedValue({ data: insertedRow, error: null })
    const select = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select })

    mockClient = {
      from: vi.fn().mockReturnValue({ insert }),
      storage: { from: vi.fn().mockReturnValue({ upload }) },
    }

    const result = await createImageReference('t1', {
      key: 'mood',
      file,
      mime_type: 'image/png',
      original_filename: 'mood.png',
    })

    expect(mockClient.storage.from).toHaveBeenCalledWith('template-references')
    expect(upload).toHaveBeenCalledTimes(1)
    const [path, body, opts] = upload.mock.calls[0]
    expect(path.startsWith('t1/')).toBe(true)
    expect(body).toBe(file)
    expect(opts).toMatchObject({ contentType: 'image/png' })

    expect(mockClient.from).toHaveBeenCalledWith('template_references')
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        template_id: 't1',
        key: 'mood',
        kind: 'image',
        mime_type: 'image/png',
        storage_path: 't1/r-uuid.png',
        original_filename: 'mood.png',
      }),
    )
    expect(result).toEqual(insertedRow)
  })

  it('throws when the upload itself fails', async () => {
    const file = new Blob(['x'], { type: 'image/png' })
    file.name = 'fail.png'
    const upload = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'storage down' },
    })
    mockClient = {
      from: vi.fn(),
      storage: { from: vi.fn().mockReturnValue({ upload }) },
    }
    await expect(
      createImageReference('t1', {
        key: 'k',
        file,
        mime_type: 'image/png',
        original_filename: 'fail.png',
      }),
    ).rejects.toThrow(/storage down/)
  })
})

describe('updateReference', () => {
  it('updates only allowed fields', async () => {
    const row = { id: 'r1', key: 'tone-renamed', content_text: 'new content' }
    const single = vi.fn().mockResolvedValue({ data: row, error: null })
    const select = vi.fn().mockReturnValue({ single })
    const eq = vi.fn().mockReturnValue({ select })
    const update = vi.fn().mockReturnValue({ eq })
    mockClient = { from: vi.fn().mockReturnValue({ update }) }

    const result = await updateReference('r1', {
      key: 'tone-renamed',
      content_text: 'new content',
    })

    expect(mockClient.from).toHaveBeenCalledWith('template_references')
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'tone-renamed',
        content_text: 'new content',
      }),
    )
    expect(eq).toHaveBeenCalledWith('id', 'r1')
    expect(result).toEqual(row)
  })
})

describe('deleteReference', () => {
  it('deletes the row by id', async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: null })
    const del = vi.fn().mockReturnValue({ eq })
    mockClient = { from: vi.fn().mockReturnValue({ delete: del }) }

    await deleteReference('r1')

    expect(mockClient.from).toHaveBeenCalledWith('template_references')
    expect(del).toHaveBeenCalled()
    expect(eq).toHaveBeenCalledWith('id', 'r1')
  })

  it('throws on supabase error', async () => {
    const eq = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'gone' },
    })
    const del = vi.fn().mockReturnValue({ eq })
    mockClient = { from: vi.fn().mockReturnValue({ delete: del }) }
    await expect(deleteReference('r1')).rejects.toThrow(/gone/)
  })
})

describe('getReferenceSignedUrl', () => {
  it('mints a signed URL for a storage_path', async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: 'https://signed.example/x' },
      error: null,
    })
    mockClient = {
      storage: { from: vi.fn().mockReturnValue({ createSignedUrl }) },
    }

    const url = await getReferenceSignedUrl('t1/r-uuid.png', 60)

    expect(mockClient.storage.from).toHaveBeenCalledWith('template-references')
    expect(createSignedUrl).toHaveBeenCalledWith('t1/r-uuid.png', 60)
    expect(url).toBe('https://signed.example/x')
  })

  it('returns null when the path is missing', async () => {
    mockClient = { storage: { from: vi.fn() } }
    expect(await getReferenceSignedUrl('', 60)).toBeNull()
    expect(await getReferenceSignedUrl(null, 60)).toBeNull()
  })

  it('throws on supabase error', async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'no such object' },
    })
    mockClient = {
      storage: { from: vi.fn().mockReturnValue({ createSignedUrl }) },
    }
    await expect(getReferenceSignedUrl('p', 60)).rejects.toThrow(/no such object/)
  })
})
