// Lightweight Markdown renderer — no external library.
// Supports H2/H3, fenced code blocks, ordered/unordered lists,
// bold (**text**) and inline code (`text`), and horizontal rules (---).
//
// Two variants:
//   - "page"  → used on agent detail pages (spacious, uses --color-text-*)
//   - "chat"  → used in chat bubbles (compact, inherits parent text color)

export default function Markdown({ text, variant = 'page' }) {
  if (typeof text !== 'string' || text === '') return null
  return <>{renderMarkdown(text, variant)}</>
}

function renderMarkdown(text, variant) {
  const lines = text.split('\n')
  const elements = []
  let i = 0

  const cls = classes(variant)

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const codeLines = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing ```
      elements.push(
        <div key={elements.length} className={cls.codeBlock}>
          {lang && <div className={cls.codeLang}>{lang}</div>}
          <pre className={cls.codePre}>
            <code className={cls.codeInner}>{codeLines.join('\n')}</code>
          </pre>
        </div>,
      )
      continue
    }

    // Horizontal rule
    if (/^[-*_]{3,}\s*$/.test(line)) {
      elements.push(<hr key={elements.length} className={cls.hr} />)
      i++
      continue
    }

    // H2
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={elements.length} className={cls.h2}>
          {renderInline(line.slice(3), variant)}
        </h2>,
      )
      i++
      continue
    }

    // H3
    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={elements.length} className={cls.h3}>
          {renderInline(line.slice(4), variant)}
        </h3>,
      )
      i++
      continue
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ''))
        i++
      }
      elements.push(
        <ol key={elements.length} className={cls.ol}>
          {items.map((item, idx) => (
            <li key={idx} className={cls.li}>
              {renderInline(item, variant)}
            </li>
          ))}
        </ol>,
      )
      continue
    }

    // Unordered list — accept "- " or "* "
    if (/^[-*]\s/.test(line)) {
      const items = []
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        items.push(lines[i].slice(2))
        i++
      }
      elements.push(
        <ul key={elements.length} className={cls.ul}>
          {items.map((item, idx) => (
            <li key={idx} className={cls.li}>
              {renderInline(item, variant)}
            </li>
          ))}
        </ul>,
      )
      continue
    }

    // Empty line
    if (line.trim() === '') {
      i++
      continue
    }

    // Paragraph
    elements.push(
      <p key={elements.length} className={cls.p}>
        {renderInline(line, variant)}
      </p>,
    )
    i++
  }

  return elements
}

function renderInline(text, variant) {
  const parts = []
  const regex = /(\*\*(.+?)\*\*)|(`(.+?)`)|(\[([^\]]+)\]\(([^)]+)\))|(https?:\/\/[^\s)]+)/g
  let lastIndex = 0
  let match
  const cls = classes(variant)

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    if (match[2]) {
      parts.push(
        <strong key={match.index} className={cls.strong}>
          {match[2]}
        </strong>,
      )
    } else if (match[4]) {
      parts.push(
        <code key={match.index} className={cls.codeInline}>
          {match[4]}
        </code>,
      )
    } else if (match[6] && match[7]) {
      parts.push(
        <a key={match.index} href={match[7]} target="_blank" rel="noopener noreferrer" className={cls.link}>
          {match[6]}
        </a>,
      )
    } else if (match[8]) {
      parts.push(
        <a key={match.index} href={match[8]} target="_blank" rel="noopener noreferrer" className={cls.link}>
          {match[8]}
        </a>,
      )
    }
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.length > 0 ? parts : text
}

function classes(variant) {
  if (variant === 'chat') {
    return {
      codeBlock: 'my-2 rounded-lg border border-white/15 overflow-hidden bg-black/20',
      codeLang: 'px-3 py-1 bg-black/20 border-b border-white/10 text-[10px] uppercase tracking-wider opacity-70 font-medium',
      codePre: 'px-3 py-2 overflow-x-auto',
      codeInner: 'text-xs font-mono leading-relaxed',
      hr: 'my-3 border-0 border-t border-current opacity-20',
      h2: 'text-sm font-bold mt-3 mb-1 first:mt-0',
      h3: 'text-sm font-semibold mt-3 mb-1 first:mt-0',
      ol: 'my-1.5 space-y-0.5 list-decimal list-outside pl-5',
      ul: 'my-1.5 space-y-0.5 list-disc list-outside pl-5',
      li: 'text-sm leading-relaxed',
      p: 'text-sm leading-relaxed my-1.5 first:mt-0 last:mb-0 break-words',
      strong: 'font-semibold',
      codeInline: 'text-[11px] bg-black/25 px-1.5 py-0.5 rounded font-mono break-all',
      link: 'text-blue-400 hover:text-blue-300 underline underline-offset-2 break-all',
    }
  }

  // page (default) — matches the existing AgentDetailPage styling
  return {
    codeBlock: 'my-4 rounded-xl border border-border-subtle overflow-hidden',
    codeLang: 'px-4 py-2 bg-white/3 border-b border-border-subtle text-[11px] uppercase tracking-wider text-text-muted font-medium',
    codePre: 'px-4 py-4 overflow-x-auto bg-bg-primary/50',
    codeInner: 'text-sm font-mono text-text-secondary leading-relaxed',
    hr: 'my-6 border-0 border-t border-border-subtle',
    h2: 'text-xl font-bold text-text-primary mt-8 mb-2 pb-2 border-b border-border-subtle/50',
    h3: 'text-base font-semibold text-text-primary mt-6 mb-2',
    ol: 'my-3 space-y-1.5 list-decimal list-inside',
    ul: 'my-3 space-y-1.5 list-disc list-inside',
    li: 'text-sm text-text-secondary leading-relaxed',
    p: 'text-sm text-text-secondary leading-relaxed my-3 break-words',
    strong: 'font-semibold text-text-primary',
    codeInline: 'text-xs bg-white/5 text-text-secondary px-1.5 py-0.5 rounded font-mono',
    link: 'text-blue-400 hover:text-blue-300 underline underline-offset-2 break-all',
  }
}
