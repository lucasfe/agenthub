import { assertEquals } from 'jsr:@std/assert@1'
import {
  render,
  validate,
  type ImageBlock,
  type MessageBlock,
  type Reference,
  type TextBlock,
} from './templateRenderer.ts'

// ---------- render(): {{params.X}} ----------

Deno.test('render — substitutes a {{params.X}} placeholder', () => {
  const r = render({
    instruction: 'Topic: {{params.topic}}, range: {{params.time_range}}.',
    params: { topic: 'Ansiedade', time_range: '7d' },
    priorSteps: [],
    references: {},
  })
  assertEquals(r.resolved_text, 'Topic: Ansiedade, range: 7d.')
  assertEquals(r.validation_errors, [])
  assertEquals(r.user_message_blocks, [
    { type: 'text', text: 'Topic: Ansiedade, range: 7d.' },
  ] as MessageBlock[])
})

Deno.test('render — missing param surfaces a validation_errors entry, not a throw', () => {
  const r = render({
    instruction: 'Topic: {{params.topic}}',
    params: {},
    priorSteps: [],
    references: {},
  })
  assertEquals(r.validation_errors.length, 1)
  assertEquals(r.validation_errors[0].code, 'missing_param')
  assertEquals(r.validation_errors[0].placeholder, '{{params.topic}}')
})

// ---------- render(): {{step-N.output}} ----------

Deno.test('render — substitutes a {{step-N.output}} placeholder', () => {
  const r = render({
    instruction: 'Brief:\n{{step-1.output}}',
    params: {},
    priorSteps: [{ output: 'Pesquisa concluída' }],
    references: {},
  })
  assertEquals(r.resolved_text, 'Brief:\nPesquisa concluída')
  assertEquals(r.validation_errors, [])
})

Deno.test('render — missing step output surfaces a validation_errors entry', () => {
  const r = render({
    instruction: '{{step-3.output}}',
    params: {},
    priorSteps: [{ output: 'a' }],
    references: {},
  })
  assertEquals(r.validation_errors.length, 1)
  assertEquals(r.validation_errors[0].code, 'missing_step_output')
})

// ---------- render(): {{step-N.output_files}} ----------

Deno.test('render — {{step-N.output_files}} expands to markdown list AND emits image blocks', () => {
  const r = render({
    instruction: 'Designs:\n{{step-2.output_files}}',
    params: {},
    priorSteps: [
      { output: 'angles' },
      {
        output: 'design',
        output_files: [
          { url: 'https://cdn.example.com/a.jpg', mime_type: 'image/jpeg' },
          { url: 'https://cdn.example.com/b.png', mime_type: 'image/png' },
        ],
      },
    ],
    references: {},
  })
  // Markdown list of URLs lives in resolved_text
  assertEquals(
    r.resolved_text,
    'Designs:\n- https://cdn.example.com/a.jpg\n- https://cdn.example.com/b.png',
  )
  // Image blocks are attached AFTER the leading text block
  const text = r.user_message_blocks[0] as TextBlock
  assertEquals(text.type, 'text')
  const images = r.user_message_blocks.filter((b) => b.type === 'image') as ImageBlock[]
  assertEquals(images.length, 2)
  assertEquals(images[0], {
    type: 'image',
    source: { type: 'url', url: 'https://cdn.example.com/a.jpg' },
  })
  assertEquals(images[1], {
    type: 'image',
    source: { type: 'url', url: 'https://cdn.example.com/b.png' },
  })
})

Deno.test('render — only files with image/* mime_type become image blocks', () => {
  const r = render({
    instruction: '{{step-1.output_files}}',
    params: {},
    priorSteps: [
      {
        output_files: [
          { url: 'https://x/a.jpg', mime_type: 'image/jpeg' },
          { url: 'https://x/b.pdf', mime_type: 'application/pdf' },
          { url: 'https://x/c.png', mime_type: 'image/png' },
          { url: 'https://x/d.txt' /* missing mime */ },
        ],
      },
    ],
    references: {},
  })
  // All 4 URLs still listed in the markdown list
  for (const url of ['a.jpg', 'b.pdf', 'c.png', 'd.txt']) {
    assertEquals(r.resolved_text.includes(url), true)
  }
  // Only the two image/* URLs become image blocks
  const images = r.user_message_blocks.filter((b) => b.type === 'image') as ImageBlock[]
  assertEquals(images.length, 2)
  assertEquals(
    images.map((b) => b.source.url),
    ['https://x/a.jpg', 'https://x/c.png'],
  )
})

Deno.test('render — missing step output_files surfaces a validation_errors entry', () => {
  const r = render({
    instruction: '{{step-1.output_files}}',
    params: {},
    priorSteps: [{ output: 'no files here' }],
    references: {},
  })
  assertEquals(r.validation_errors.length, 1)
  assertEquals(r.validation_errors[0].code, 'missing_step_output_files')
})

// ---------- render(): {{ref:KEY}} ----------

Deno.test('render — substitutes {{ref:KEY}} for kind=text references', () => {
  const r = render({
    instruction: 'Tom de voz: {{ref:tone}}',
    params: {},
    priorSteps: [],
    references: {
      tone: { kind: 'text', content_text: 'Acolhedor e claro' },
    },
  })
  assertEquals(r.resolved_text, 'Tom de voz: Acolhedor e claro')
  assertEquals(r.user_message_blocks.length, 1)
  assertEquals(r.user_message_blocks[0].type, 'text')
})

Deno.test('render — {{ref:KEY}} with kind=image emits an image block (not the URL in text)', () => {
  const r = render({
    instruction: 'Use moodboard {{ref:moodboard-1}} as visual reference.',
    params: {},
    priorSteps: [],
    references: {
      'moodboard-1': {
        kind: 'image',
        url: 'https://cdn.example.com/mood.jpg',
        mime_type: 'image/jpeg',
      },
    },
  })
  // Marker stays in text so the LLM knows where the image fits
  assertEquals(
    r.resolved_text,
    'Use moodboard [image: moodboard-1] as visual reference.',
  )
  // Image block emitted
  const images = r.user_message_blocks.filter((b) => b.type === 'image') as ImageBlock[]
  assertEquals(images.length, 1)
  assertEquals(images[0].source.url, 'https://cdn.example.com/mood.jpg')
})

Deno.test('render — unknown ref key surfaces a validation_errors entry', () => {
  const r = render({
    instruction: '{{ref:does-not-exist}}',
    params: {},
    priorSteps: [],
    references: {},
  })
  assertEquals(r.validation_errors.length, 1)
  assertEquals(r.validation_errors[0].code, 'missing_ref')
})

Deno.test('render — audio reference is unsupported in v1 and surfaces a validation_errors entry', () => {
  const r = render({
    instruction: '{{ref:voice}}',
    params: {},
    priorSteps: [],
    references: {
      // deno-lint-ignore no-explicit-any
      voice: { kind: 'audio' } as any as Reference,
    },
  })
  assertEquals(r.validation_errors.length, 1)
  assertEquals(r.validation_errors[0].code, 'unsupported_ref_kind')
})

// ---------- render(): unknown placeholder ----------

Deno.test('render — unrecognised placeholder syntax surfaces a validation_errors entry', () => {
  const r = render({
    instruction: 'Hello {{params}} world',
    params: {},
    priorSteps: [],
    references: {},
  })
  assertEquals(r.validation_errors.length, 1)
  assertEquals(r.validation_errors[0].code, 'unknown_placeholder')
})

// ---------- render(): mixed scenario ----------

Deno.test('render — mixed placeholders resolve in order, blocks are text-then-images', () => {
  const r = render({
    instruction: [
      'Topic: {{params.topic}}',
      'Brief: {{step-1.output}}',
      'Slides:',
      '{{step-2.output_files}}',
      'Tom: {{ref:tone}}',
      'Mood: {{ref:moodboard-1}}',
    ].join('\n'),
    params: { topic: 'Ansiedade' },
    priorSteps: [
      { output: 'pesquisa' },
      {
        output_files: [
          { url: 'https://x/slide-1.jpg', mime_type: 'image/jpeg' },
          { url: 'https://x/slide-2.jpg', mime_type: 'image/jpeg' },
        ],
      },
    ],
    references: {
      tone: { kind: 'text', content_text: 'Acolhedor' },
      'moodboard-1': {
        kind: 'image',
        url: 'https://x/mood.jpg',
        mime_type: 'image/jpeg',
      },
    },
  })

  assertEquals(r.validation_errors, [])

  // First block is text; rest are images in encounter order.
  assertEquals(r.user_message_blocks[0].type, 'text')
  const images = r.user_message_blocks.slice(1) as ImageBlock[]
  assertEquals(
    images.map((b) => b.source.url),
    ['https://x/slide-1.jpg', 'https://x/slide-2.jpg', 'https://x/mood.jpg'],
  )
})

// ---------- render(): always emits a text block ----------

Deno.test('render — always emits a leading text block, even if empty after substitution', () => {
  const r = render({
    instruction: '',
    params: {},
    priorSteps: [],
    references: {},
  })
  assertEquals(r.user_message_blocks.length, 1)
  assertEquals(r.user_message_blocks[0], { type: 'text', text: '' })
})

// ---------- validate() ----------

Deno.test('validate — passes when every placeholder is declared', () => {
  const errs = validate(
    {
      instruction:
        'Topic: {{params.topic}}; brief: {{step-1.output}}; tone: {{ref:tone}}; slides: {{step-2.output_files}}',
    },
    ['topic'],
    [1, 2],
    ['tone'],
  )
  assertEquals(errs, [])
})

Deno.test('validate — flags an undeclared param', () => {
  const errs = validate(
    { instruction: 'Topic: {{params.topic}}' },
    [],
    [],
    [],
  )
  assertEquals(errs.length, 1)
  assertEquals(errs[0].code, 'undeclared_param')
  assertEquals(errs[0].placeholder, '{{params.topic}}')
})

Deno.test('validate — flags an undeclared step output', () => {
  const errs = validate(
    { instruction: '{{step-2.output}}' },
    [],
    [1],
    [],
  )
  assertEquals(errs.length, 1)
  assertEquals(errs[0].code, 'undeclared_step')
})

Deno.test('validate — flags undeclared step output_files the same way', () => {
  const errs = validate(
    { instruction: '{{step-3.output_files}}' },
    [],
    [1, 2],
    [],
  )
  assertEquals(errs.length, 1)
  assertEquals(errs[0].code, 'undeclared_step')
})

Deno.test('validate — flags an undeclared ref key', () => {
  const errs = validate(
    { instruction: '{{ref:moodboard}}' },
    [],
    [],
    ['tone'],
  )
  assertEquals(errs.length, 1)
  assertEquals(errs[0].code, 'undeclared_ref')
})

Deno.test('validate — flags an unrecognised placeholder syntax', () => {
  const errs = validate(
    { instruction: '{{nonsense.thing}}' },
    [],
    [],
    [],
  )
  assertEquals(errs.length, 1)
  assertEquals(errs[0].code, 'unknown_placeholder')
})

Deno.test('validate — accumulates multiple errors across one instruction', () => {
  const errs = validate(
    {
      instruction:
        '{{params.a}} / {{params.b}} / {{step-1.output}} / {{ref:x}}',
    },
    ['a'],
    [],
    [],
  )
  // params.b undeclared, step-1 undeclared, ref:x undeclared = 3 errors
  assertEquals(errs.length, 3)
  const codes = errs.map((e) => e.code).sort()
  assertEquals(codes, ['undeclared_param', 'undeclared_ref', 'undeclared_step'])
})
