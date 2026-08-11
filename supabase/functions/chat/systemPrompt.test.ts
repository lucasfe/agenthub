import {
  assert,
  assertEquals,
  assertStringIncludes,
} from 'jsr:@std/assert@1'
import {
  BASE_SYSTEM_PROMPT,
  buildSelectedAgentSystemPrompt,
  buildSystemPrompt,
} from './systemPrompt.ts'

// Regression guard for issue #608: the chat assistant must reply in English
// only. These tests lock the English-only behavior so a future edit can't
// silently reintroduce Portuguese phrasing or a "reply in the same language"
// rule.

// Portuguese remnants that previously lived in the prompt (example phrases,
// few-shot user phrasings, and the old "same language" instruction).
const PORTUGUESE_REMNANTS =
  /Beleza|Entendi|vou propor|quais agentes|me fala do|tem algum agente|monta um agente|muda a cor|adiciona a tag|troca a descrição/

Deno.test('BASE_SYSTEM_PROMPT — instructs the assistant to always reply in English', () => {
  assertStringIncludes(BASE_SYSTEM_PROMPT.toLowerCase(), 'always reply in english')
})

Deno.test('BASE_SYSTEM_PROMPT — no longer contains the removed "same language" rule', () => {
  assert(
    !/same language/i.test(BASE_SYSTEM_PROMPT),
    'BASE_SYSTEM_PROMPT must not tell the assistant to reply in the same language',
  )
})

Deno.test('BASE_SYSTEM_PROMPT — contains no Portuguese remnants', () => {
  assert(
    !PORTUGUESE_REMNANTS.test(BASE_SYSTEM_PROMPT),
    'BASE_SYSTEM_PROMPT must not contain Portuguese remnants',
  )
})

Deno.test('buildSelectedAgentSystemPrompt — header instructs English-only replies', () => {
  const prompt = buildSelectedAgentSystemPrompt({ name: 'X', content: 'Y' })
  assertStringIncludes(prompt, 'Always reply in English')
})

// ---------------------------------------------------------------------------
// Behavioral guards for the extracted builder functions (issue #608 refactor).
// index.ts now depends on these, so their output must be byte-for-byte what it
// was before extraction. The tests above only cover English-only wording; the
// tests below cover the actual construction logic and adversarial inputs.
// ---------------------------------------------------------------------------

// --- buildSystemPrompt(agentsContext) --------------------------------------

Deno.test('buildSystemPrompt — empty array returns exactly BASE_SYSTEM_PROMPT', () => {
  assertEquals(buildSystemPrompt([]), BASE_SYSTEM_PROMPT)
})

Deno.test('buildSystemPrompt — no "## Existing Agents" section for empty array', () => {
  assert(!buildSystemPrompt([]).includes('## Existing Agents'))
})

Deno.test('buildSystemPrompt — non-array inputs return exactly BASE_SYSTEM_PROMPT', () => {
  assertEquals(buildSystemPrompt(null), BASE_SYSTEM_PROMPT)
  assertEquals(buildSystemPrompt(undefined), BASE_SYSTEM_PROMPT)
  assertEquals(buildSystemPrompt('not an array'), BASE_SYSTEM_PROMPT)
  assertEquals(buildSystemPrompt({ id: 'x', name: 'y' }), BASE_SYSTEM_PROMPT)
  assertEquals(buildSystemPrompt(42), BASE_SYSTEM_PROMPT)
})

Deno.test('buildSystemPrompt — all-malformed entries filter to zero lines and return BASE_SYSTEM_PROMPT', () => {
  const malformed = [
    null,
    undefined,
    'string entry',
    42,
    {},
    { id: 'has-id-only' }, // missing name
    { name: 'has-name-only' }, // missing id
    { id: 123, name: 'numeric id' }, // id not a string
    { id: 'x', name: 456 }, // name not a string
  ]
  const prompt = buildSystemPrompt(malformed)
  assertEquals(prompt, BASE_SYSTEM_PROMPT)
  // No dangling header left over from the filtered-empty case.
  assert(!prompt.includes('## Existing Agents'))
})

Deno.test('buildSystemPrompt — valid agent appends the Existing Agents section with id and name', () => {
  const prompt = buildSystemPrompt([{ id: 'frontend-dev', name: 'Frontend Developer' }])
  assertStringIncludes(prompt, '## Existing Agents')
  assertStringIncludes(prompt, '- frontend-dev: Frontend Developer')
  // The base prompt is preserved verbatim as the prefix.
  assert(prompt.startsWith(BASE_SYSTEM_PROMPT))
  assertStringIncludes(prompt, `${BASE_SYSTEM_PROMPT}\n\n## Existing Agents\n\n`)
})

Deno.test('buildSystemPrompt — renders category, description, and tags when present', () => {
  const prompt = buildSystemPrompt([
    {
      id: 'sec',
      name: 'Security Auditor',
      category: 'AI Specialists',
      description: 'Finds vulnerabilities',
      tags: ['security', 'audit'],
    },
  ])
  assertStringIncludes(
    prompt,
    '- sec: Security Auditor (AI Specialists) — Finds vulnerabilities [security, audit]',
  )
})

Deno.test('buildSystemPrompt — omits category, description, and tags when absent', () => {
  const prompt = buildSystemPrompt([{ id: 'bare', name: 'Bare Agent' }])
  // Exactly the id/name line with no extra decorations.
  assertStringIncludes(prompt, '\n- bare: Bare Agent')
  assert(!prompt.includes('- bare: Bare Agent ('))
  assert(!prompt.includes('- bare: Bare Agent —'))
  assert(!prompt.includes('- bare: Bare Agent ['))
})

Deno.test('buildSystemPrompt — empty tags array and empty strings are omitted', () => {
  const prompt = buildSystemPrompt([
    { id: 'e', name: 'Empties', category: '', description: '', tags: [] },
  ])
  assertStringIncludes(prompt, '\n- e: Empties')
  assert(!prompt.includes('- e: Empties ('))
  assert(!prompt.includes('- e: Empties —'))
  assert(!prompt.includes('- e: Empties ['))
})

Deno.test('buildSystemPrompt — mixed valid/malformed keeps only valid lines', () => {
  const prompt = buildSystemPrompt([
    { id: 'ok1', name: 'Agent One' },
    null,
    { id: 'no-name' },
    { id: 'ok2', name: 'Agent Two' },
    'garbage',
  ])
  assertStringIncludes(prompt, '- ok1: Agent One')
  assertStringIncludes(prompt, '- ok2: Agent Two')
  assert(!prompt.includes('no-name'))
  // Section built from exactly the two valid lines joined by a newline.
  assertStringIncludes(prompt, '## Existing Agents\n\n- ok1: Agent One\n- ok2: Agent Two')
})

// --- buildSelectedAgentSystemPrompt(agent) ---------------------------------

Deno.test('buildSelectedAgentSystemPrompt — null / non-object returns BASE_SYSTEM_PROMPT', () => {
  assertEquals(buildSelectedAgentSystemPrompt(null), BASE_SYSTEM_PROMPT)
  assertEquals(buildSelectedAgentSystemPrompt(undefined), BASE_SYSTEM_PROMPT)
  assertEquals(buildSelectedAgentSystemPrompt('a string'), BASE_SYSTEM_PROMPT)
  assertEquals(buildSelectedAgentSystemPrompt(7), BASE_SYSTEM_PROMPT)
})

Deno.test('buildSelectedAgentSystemPrompt — missing content returns just the header (no trailing block)', () => {
  const prompt = buildSelectedAgentSystemPrompt({ name: 'Helper' })
  assertStringIncludes(prompt, 'Always reply in English')
  assertStringIncludes(prompt, 'You are "Helper"')
  assert(!prompt.includes('\n\n'), 'header-only output must not contain a content block separator')
})

Deno.test('buildSelectedAgentSystemPrompt — empty and whitespace content collapse to header-only', () => {
  const empty = buildSelectedAgentSystemPrompt({ name: 'Helper', content: '' })
  const spaces = buildSelectedAgentSystemPrompt({ name: 'Helper', content: '   \n\t  ' })
  const headerOnly = buildSelectedAgentSystemPrompt({ name: 'Helper' })
  assertEquals(empty, headerOnly)
  assertEquals(spaces, headerOnly)
  assertStringIncludes(empty, 'Always reply in English')
})

Deno.test('buildSelectedAgentSystemPrompt — non-string content is ignored (header-only)', () => {
  const prompt = buildSelectedAgentSystemPrompt({ name: 'Helper', content: { foo: 'bar' } })
  const headerOnly = buildSelectedAgentSystemPrompt({ name: 'Helper' })
  assertEquals(prompt, headerOnly)
})

Deno.test('buildSelectedAgentSystemPrompt — content is appended as header + "\\n\\n" + trimmed content', () => {
  const agent = { name: 'Helper', content: '  Do the thing.  ' }
  const prompt = buildSelectedAgentSystemPrompt(agent)
  const header =
    'You are "Helper", an AI agent inside Lucas AI Hub. Always reply in English. Stay in character — do not mention this hub\'s other agents unless the user asks.'
  assertEquals(prompt, `${header}\n\nDo the thing.`)
})

Deno.test('buildSelectedAgentSystemPrompt — falls back to id when name is missing', () => {
  const prompt = buildSelectedAgentSystemPrompt({ id: 'agent-42', content: 'Hi' })
  assertStringIncludes(prompt, 'You are "agent-42"')
})

Deno.test('buildSelectedAgentSystemPrompt — English-only header is injected even when content is in another language', () => {
  // Adversarial: an agent whose own system prompt is written in Portuguese.
  // The English-only guarantee comes from the injected HEADER, which must be
  // present regardless of the content's language.
  const agent = {
    name: 'Assistente',
    content: 'Você é um assistente. Responda sempre em português e seja educado.',
  }
  const prompt = buildSelectedAgentSystemPrompt(agent)
  assertStringIncludes(prompt, 'Always reply in English')
  // The header precedes the foreign-language content.
  assert(
    prompt.indexOf('Always reply in English') < prompt.indexOf('português'),
    'English-only instruction must appear before the agent content',
  )
})
