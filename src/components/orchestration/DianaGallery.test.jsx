import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import { renderWithProviders } from '../../test/test-utils'
import DianaGallery from './DianaGallery'

const imgFile = (overrides = {}) => ({
  storage_path: 'tasks/abc/feed_001.jpg',
  signed_url: 'https://example.com/feed_001.jpg',
  mime_type: 'image/jpeg',
  width: 1080,
  height: 1080,
  ...overrides,
})

const stepWithFiles = (files) => ({
  id: 1,
  agent_id: 'diana-design',
  agent_name: 'Diana Design',
  status: 'awaiting_approval',
  output_files: files,
})

describe('DianaGallery', () => {
  it('renders one thumbnail per image file with idx-based test ids', () => {
    const step = stepWithFiles([
      imgFile({ signed_url: 'https://example.com/a.jpg' }),
      imgFile({ signed_url: 'https://example.com/b.jpg' }),
      imgFile({ signed_url: 'https://example.com/c.jpg' }),
    ])
    renderWithProviders(
      <DianaGallery
        step={step}
        onApprove={() => {}}
        onRequestEdit={() => {}}
        onRerender={() => {}}
      />,
    )
    const thumbs = screen.getAllByTestId(/^diana-thumb-/)
    expect(thumbs).toHaveLength(3)
  })

  it('skips non-image output_files', () => {
    const step = stepWithFiles([
      imgFile({ signed_url: 'https://example.com/a.jpg' }),
      { mime_type: 'application/pdf', storage_path: 'b.pdf' },
      imgFile({ signed_url: 'https://example.com/c.jpg' }),
    ])
    renderWithProviders(
      <DianaGallery
        step={step}
        onApprove={() => {}}
        onRequestEdit={() => {}}
        onRerender={() => {}}
      />,
    )
    expect(screen.getAllByTestId(/^diana-thumb-/)).toHaveLength(2)
  })

  it('shows "0/N aprovados" when nothing is approved', () => {
    const step = stepWithFiles([imgFile(), imgFile(), imgFile()])
    renderWithProviders(
      <DianaGallery
        step={step}
        onApprove={() => {}}
        onRequestEdit={() => {}}
        onRerender={() => {}}
      />,
    )
    expect(screen.getByTestId('diana-counter').textContent).toMatch(/0\s*\/\s*3/)
  })

  it('updates header counter for mixed approval states', () => {
    const step = stepWithFiles([
      imgFile({ approval_state: 'approved' }),
      imgFile({ approval_state: 'pending' }),
      imgFile({ approval_state: 'approved' }),
    ])
    renderWithProviders(
      <DianaGallery
        step={step}
        onApprove={() => {}}
        onRequestEdit={() => {}}
        onRerender={() => {}}
      />,
    )
    expect(screen.getByTestId('diana-counter').textContent).toMatch(/2\s*\/\s*3/)
  })

  it('disables the "Avançar" button until every image is approved', () => {
    const step = stepWithFiles([
      imgFile({ approval_state: 'approved' }),
      imgFile({ approval_state: 'pending' }),
    ])
    const onAdvance = vi.fn()
    renderWithProviders(
      <DianaGallery
        step={step}
        onApprove={() => {}}
        onRequestEdit={() => {}}
        onRerender={() => {}}
        onAdvance={onAdvance}
      />,
    )
    const advance = screen.getByRole('button', { name: /avançar/i })
    expect(advance).toBeDisabled()
    fireEvent.click(advance)
    expect(onAdvance).not.toHaveBeenCalled()
  })

  it('enables the "Avançar" button only when every image is approved', () => {
    const step = stepWithFiles([
      imgFile({ approval_state: 'approved' }),
      imgFile({ approval_state: 'approved' }),
    ])
    const onAdvance = vi.fn()
    renderWithProviders(
      <DianaGallery
        step={step}
        onApprove={() => {}}
        onRequestEdit={() => {}}
        onRerender={() => {}}
        onAdvance={onAdvance}
      />,
    )
    const advance = screen.getByRole('button', { name: /avançar/i })
    expect(advance).not.toBeDisabled()
    fireEvent.click(advance)
    expect(onAdvance).toHaveBeenCalledTimes(1)
  })

  it('calls onApprove with the file index when "Aprovar" is clicked', () => {
    const step = stepWithFiles([imgFile(), imgFile()])
    const onApprove = vi.fn()
    renderWithProviders(
      <DianaGallery
        step={step}
        onApprove={onApprove}
        onRequestEdit={() => {}}
        onRerender={() => {}}
      />,
    )
    const thumb = screen.getByTestId('diana-thumb-1')
    fireEvent.click(within(thumb).getByRole('button', { name: /aprovar/i }))
    expect(onApprove).toHaveBeenCalledWith(1)
  })

  it('opens a feedback textarea when "Pedir ajuste" is clicked, and submits it via onRequestEdit', () => {
    const step = stepWithFiles([imgFile(), imgFile()])
    const onRequestEdit = vi.fn()
    renderWithProviders(
      <DianaGallery
        step={step}
        onApprove={() => {}}
        onRequestEdit={onRequestEdit}
        onRerender={() => {}}
      />,
    )
    const thumb = screen.getByTestId('diana-thumb-0')
    fireEvent.click(within(thumb).getByRole('button', { name: /pedir ajuste/i }))
    const textarea = within(thumb).getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'lighter colors' } })
    fireEvent.click(within(thumb).getByRole('button', { name: /enviar feedback/i }))
    expect(onRequestEdit).toHaveBeenCalledWith(0, 'lighter colors')
  })

  it('calls onRerender with file index (and current feedback) when "Re-renderizar" is clicked', () => {
    const step = stepWithFiles([
      imgFile({ approval_state: 'edit_requested', feedback: 'darker' }),
    ])
    const onRerender = vi.fn()
    renderWithProviders(
      <DianaGallery
        step={step}
        onApprove={() => {}}
        onRequestEdit={() => {}}
        onRerender={onRerender}
      />,
    )
    const thumb = screen.getByTestId('diana-thumb-0')
    fireEvent.click(within(thumb).getByRole('button', { name: /re-renderizar/i }))
    expect(onRerender).toHaveBeenCalledWith(0, 'darker')
  })

  it('disables actions on a thumbnail while it is loading (rerender in flight)', () => {
    const step = stepWithFiles([imgFile(), imgFile()])
    renderWithProviders(
      <DianaGallery
        step={step}
        onApprove={() => {}}
        onRequestEdit={() => {}}
        onRerender={() => {}}
        loadingIndices={[0]}
      />,
    )
    const thumb = screen.getByTestId('diana-thumb-0')
    const approve = within(thumb).getByRole('button', { name: /aprovar/i })
    const rerender = within(thumb).getByRole('button', { name: /re-renderizar/i })
    expect(approve).toBeDisabled()
    expect(rerender).toBeDisabled()
    // The other thumb's actions remain enabled.
    const other = screen.getByTestId('diana-thumb-1')
    expect(within(other).getByRole('button', { name: /aprovar/i })).not.toBeDisabled()
  })

  it('renders an empty-state message when there are no image files', () => {
    const step = stepWithFiles([])
    renderWithProviders(
      <DianaGallery
        step={step}
        onApprove={() => {}}
        onRequestEdit={() => {}}
        onRerender={() => {}}
      />,
    )
    expect(screen.getByTestId('diana-empty')).toBeInTheDocument()
  })
})
