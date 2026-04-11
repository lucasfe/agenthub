import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import Markdown from './markdown'

describe('Markdown', () => {
  it('returns null for empty or non-string input', () => {
    const { container: a } = render(<Markdown text="" />)
    const { container: b } = render(<Markdown text={null} />)
    expect(a.firstChild).toBeNull()
    expect(b.firstChild).toBeNull()
  })

  it('renders plain paragraphs', () => {
    const { container } = render(<Markdown text="hello world" />)
    expect(container.querySelector('p')?.textContent).toBe('hello world')
  })

  it('renders h2 and h3 headings', () => {
    const { container } = render(<Markdown text={'## Title\n### Subtitle'} />)
    expect(container.querySelector('h2')?.textContent).toBe('Title')
    expect(container.querySelector('h3')?.textContent).toBe('Subtitle')
  })

  it('renders unordered lists with * or -', () => {
    const { container } = render(<Markdown text={'- one\n- two\n* three'} />)
    const items = container.querySelectorAll('ul li')
    expect(items).toHaveLength(3)
    expect(items[0].textContent).toBe('one')
    expect(items[2].textContent).toBe('three')
  })

  it('renders ordered lists', () => {
    const { container } = render(<Markdown text={'1. first\n2. second'} />)
    const items = container.querySelectorAll('ol li')
    expect(items).toHaveLength(2)
    expect(items[0].textContent).toBe('first')
  })

  it('renders bold and inline code', () => {
    const { container } = render(<Markdown text={'This is **bold** and `code`'} />)
    expect(container.querySelector('strong')?.textContent).toBe('bold')
    expect(container.querySelector('code')?.textContent).toBe('code')
  })

  it('renders fenced code blocks with language', () => {
    const { container } = render(<Markdown text={'```js\nconst x = 1\n```'} />)
    const pre = container.querySelector('pre code')
    expect(pre?.textContent).toBe('const x = 1')
    // Language label rendered
    expect(container.textContent).toContain('js')
  })

  it('renders horizontal rule for ---', () => {
    const { container } = render(<Markdown text={'above\n\n---\n\nbelow'} />)
    expect(container.querySelector('hr')).not.toBeNull()
  })

  it('applies compact classes in chat variant', () => {
    const { container } = render(<Markdown text="hi" variant="chat" />)
    const p = container.querySelector('p')
    // chat variant paragraphs have tight margins and inherit text color (no text-text-secondary)
    expect(p?.className).toContain('my-1.5')
    expect(p?.className).not.toContain('text-text-secondary')
  })
})
