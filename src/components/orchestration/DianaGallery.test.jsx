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

  it('shows "0/N approved" when nothing is approved', () => {
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

  it('disables the "Continue" button until every image is approved', () => {
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
    const advance = screen.getByRole('button', { name: /continue/i })
    expect(advance).toBeDisabled()
    fireEvent.click(advance)
    expect(onAdvance).not.toHaveBeenCalled()
  })

  it('enables the "Continue" button only when every image is approved', () => {
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
    const advance = screen.getByRole('button', { name: /continue/i })
    expect(advance).not.toBeDisabled()
    fireEvent.click(advance)
    expect(onAdvance).toHaveBeenCalledTimes(1)
  })

  it('calls onApprove with the file index when "Approve" is clicked', () => {
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
    fireEvent.click(within(thumb).getByRole('button', { name: /approve/i }))
    expect(onApprove).toHaveBeenCalledWith(1)
  })

  it('opens a feedback textarea when "Request edit" is clicked, and submits it via onRequestEdit', () => {
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
    fireEvent.click(within(thumb).getByRole('button', { name: /request edit/i }))
    const textarea = within(thumb).getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'lighter colors' } })
    fireEvent.click(within(thumb).getByRole('button', { name: /send feedback/i }))
    expect(onRequestEdit).toHaveBeenCalledWith(0, 'lighter colors')
  })

  it('calls onRerender with file index (and current feedback) when "Re-render" is clicked', () => {
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
    fireEvent.click(within(thumb).getByRole('button', { name: /re-render/i }))
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
    const approve = within(thumb).getByRole('button', { name: /approve/i })
    const rerender = within(thumb).getByRole('button', { name: /re-render/i })
    expect(approve).toBeDisabled()
    expect(rerender).toBeDisabled()
    // The other thumb's actions remain enabled.
    const other = screen.getByTestId('diana-thumb-1')
    expect(within(other).getByRole('button', { name: /approve/i })).not.toBeDisabled()
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

// --- English-only regression guards (issue #606) --------------------------
//
// Issue #606 normalized the app to en-US. These tests are adversarial
// guardrails: they assert the exact old Portuguese strings never reappear in
// the rendered UI, rather than merely checking the new English copy is
// present. We deliberately match the full Portuguese phrases (not loose
// substrings) to avoid false positives — e.g. the English "Approved" must not
// trip an "aprov" check, and "Continue" is unrelated to "Avançar".

// Exact Portuguese phrases this refactor removed. Each is chosen so it is NOT
// a substring of the English replacement copy, so an assertion of its absence
// can only fail if a genuine leftover Portuguese string is rendered.
const PORTUGUESE_PHRASES = [
  'Aprovar',
  'Aprovado',
  'aprovados',
  'Ajuste pedido',
  'Pedir ajuste',
  'Re-renderizar',
  'Descreva o ajuste desejado',
  'Cancelar',
  'Enviar feedback',
  'Nenhum arquivo de imagem',
  'Galeria — aprove cada imagem',
  'Aprove todas as imagens',
  'Avançar',
]

const expectNoPortuguese = (container) => {
  const text = container.textContent || ''
  for (const phrase of PORTUGUESE_PHRASES) {
    expect(text).not.toContain(phrase)
  }
}

describe('DianaGallery — English-only regression guards (issue #606)', () => {
  it('renders no leftover Portuguese in the pending/mixed-approval state', () => {
    const step = stepWithFiles([
      imgFile({ approval_state: 'approved' }),
      imgFile({ approval_state: 'edit_requested', feedback: 'darker' }),
      imgFile({ approval_state: 'pending' }),
    ])
    const { container } = renderWithProviders(
      <DianaGallery
        step={step}
        onApprove={() => {}}
        onRequestEdit={() => {}}
        onRerender={() => {}}
        onAdvance={() => {}}
      />,
    )
    // Sanity: English copy is what actually renders.
    expect(screen.getByText('Gallery — approve each image')).toBeInTheDocument()
    expect(screen.getByText('Approved')).toBeInTheDocument()
    expect(screen.getByText('Edit requested')).toBeInTheDocument()
    expectNoPortuguese(container)
  })

  it('renders no leftover Portuguese in the fully-approved state', () => {
    const step = stepWithFiles([
      imgFile({ approval_state: 'approved' }),
      imgFile({ approval_state: 'approved' }),
    ])
    const { container } = renderWithProviders(
      <DianaGallery
        step={step}
        onApprove={() => {}}
        onRequestEdit={() => {}}
        onRerender={() => {}}
        onAdvance={() => {}}
      />,
    )
    expect(screen.getByTestId('diana-counter').textContent).toMatch(/2\s*\/\s*2\s*approved/)
    expectNoPortuguese(container)
  })

  it('renders the English empty-state and no Portuguese when there are no image files', () => {
    const step = stepWithFiles([])
    const { container } = renderWithProviders(
      <DianaGallery
        step={step}
        onApprove={() => {}}
        onRequestEdit={() => {}}
        onRerender={() => {}}
      />,
    )
    expect(
      screen.getByText('No image files available for review in this step.'),
    ).toBeInTheDocument()
    expectNoPortuguese(container)
  })

  it('shows the English feedback placeholder and controls (no Portuguese) when "Request edit" opens', () => {
    const step = stepWithFiles([imgFile()])
    const { container } = renderWithProviders(
      <DianaGallery
        step={step}
        onApprove={() => {}}
        onRequestEdit={() => {}}
        onRerender={() => {}}
      />,
    )
    const thumb = screen.getByTestId('diana-thumb-0')
    fireEvent.click(within(thumb).getByRole('button', { name: /request edit/i }))

    const textarea = within(thumb).getByRole('textbox')
    expect(textarea).toHaveAttribute('placeholder', 'Describe the change you want…')
    expect(within(thumb).getByRole('button', { name: /^cancel$/i })).toBeInTheDocument()
    expect(within(thumb).getByRole('button', { name: /send feedback/i })).toBeInTheDocument()

    // No Portuguese equivalents (Cancelar / Enviar feedback / Descreva…).
    expectNoPortuguese(container)
    expect(within(thumb).queryByRole('button', { name: /cancelar/i })).toBeNull()
    expect(within(thumb).queryByRole('button', { name: /enviar feedback/i })).toBeNull()
  })

  it('exposes the English disabled-continue hint (not the Portuguese one) when not all images are approved', () => {
    const step = stepWithFiles([
      imgFile({ approval_state: 'approved' }),
      imgFile({ approval_state: 'pending' }),
    ])
    const { container } = renderWithProviders(
      <DianaGallery
        step={step}
        onApprove={() => {}}
        onRequestEdit={() => {}}
        onRerender={() => {}}
        onAdvance={() => {}}
      />,
    )
    const advance = screen.getByRole('button', { name: /continue/i })
    expect(advance).toBeDisabled()
    expect(advance).toHaveAttribute('title', 'Approve all images before continuing')
    expect(advance.getAttribute('title')).not.toContain('Aprove todas')
    expect(advance.getAttribute('title')).not.toContain('avançar')
    expectNoPortuguese(container)
  })
})
