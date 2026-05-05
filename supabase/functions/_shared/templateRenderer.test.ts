import { assertEquals } from 'jsr:@std/assert@1'
import { render, validate } from './templateRenderer.ts'

const sampleParams = { topic: 'ansiedade', time_range: '7d' }

const sampleSteps = [
  {
    output: 'research summary text',
    output_files: [
      { url: 'https://signed.example/step1/a.jpg', mime_type: 'image/jpeg' },
      { url: 'https://signed.example/step1/b.png', mime_type: 'image/png' },
    ],
  },
  {
    output: 'second step plain output',
    output_files: [],
  },
]

const sampleRefs = {
  tone_of_voice: {
    kind: 'text',
    content_text: 'Speak in calm, warm Portuguese.',
  },
  moodboard: {
    kind: 'image',
    url: 'https://signed.example/refs/moodboard.png',
    mime_type: 'image/png',
  },
}

// ── render() ────────────────────────────────────────────────────────────────

Deno.test('render — static text only returns a single text block', () => {
  const out = render({
    instruction: 'Hello, world!',
    params: {},
    priorSteps: [],
    references: {},
  })
  assertEquals(out.user_message_blocks, [
    { type: 'text', text: 'Hello, world!' },
  ])
  assertEquals(out.resolved_text, 'Hello, world!')
  assertEquals(out.validation_errors, [])
})

Deno.test('render — empty instruction yields no blocks and no text', () => {
  const out = render({
    instruction: '',
    params: {},
    priorSteps: [],
    references: {},
  })
  assertEquals(out.user_message_blocks, [])
  assertEquals(out.resolved_text, '')
  assertEquals(out.validation_errors, [])
})

Deno.test('render — resolves {{params.X}} placeholders', () => {
  const out = render({
    instruction: 'Topic is {{params.topic}} over {{params.time_range}}.',
    params: sampleParams,
    priorSteps: [],
    references: {},
  })
  assertEquals(out.resolved_text, 'Topic is ansiedade over 7d.')
  assertEquals(out.user_message_blocks, [
    { type: 'text', text: 'Topic is ansiedade over 7d.' },
  ])
  assertEquals(out.validation_errors, [])
})

Deno.test('render — tolerates whitespace inside placeholder braces', () => {
  const out = render({
    instruction: 'Topic is {{ params.topic }}.',
    params: sampleParams,
    priorSteps: [],
    references: {},
  })
  assertEquals(out.resolved_text, 'Topic is ansiedade.')
  assertEquals(out.validation_errors, [])
})

Deno.test('render — resolves {{step-N.output}} from priorSteps', () => {
  const out = render({
    instruction: 'Prior: {{step-1.output}} then {{step-2.output}}.',
    params: {},
    priorSteps: sampleSteps,
    references: {},
  })
  assertEquals(
    out.resolved_text,
    'Prior: research summary text then second step plain output.',
  )
  assertEquals(out.validation_errors, [])
})

Deno.test('render — {{step-N.output_files}} expands to a markdown URL list', () => {
  const out = render({
    instruction: 'Files:\n{{step-1.output_files}}',
    params: {},
    priorSteps: sampleSteps,
    references: {},
  })
  assertEquals(
    out.resolved_text,
    'Files:\n- https://signed.example/step1/a.jpg\n- https://signed.example/step1/b.png',
  )
})

Deno.test('render — {{step-N.output_files}} emits one image block per image/* file', () => {
  const out = render({
    instruction: 'Files:\n{{step-1.output_files}}',
    params: {},
    priorSteps: sampleSteps,
    references: {},
  })
  const imageBlocks = out.user_message_blocks.filter((b) => b.type === 'image')
  assertEquals(imageBlocks, [
    {
      type: 'image',
      source: { type: 'url', url: 'https://signed.example/step1/a.jpg' },
    },
    {
      type: 'image',
      source: { type: 'url', url: 'https://signed.example/step1/b.png' },
    },
  ])
})

Deno.test('render — output_files keeps non-image URLs in markdown list but not as image blocks', () => {
  const steps = [
    {
      output: 'x',
      output_files: [
        { url: 'https://signed.example/photo.jpg', mime_type: 'image/jpeg' },
        { url: 'https://signed.example/notes.txt', mime_type: 'text/plain' },
      ],
    },
  ]
  const out = render({
    instruction: '{{step-1.output_files}}',
    params: {},
    priorSteps: steps,
    references: {},
  })
  assertEquals(
    out.resolved_text,
    '- https://signed.example/photo.jpg\n- https://signed.example/notes.txt',
  )
  const imageBlocks = out.user_message_blocks.filter((b) => b.type === 'image')
  assertEquals(imageBlocks.length, 1)
  assertEquals(imageBlocks[0], {
    type: 'image',
    source: { type: 'url', url: 'https://signed.example/photo.jpg' },
  })
})

Deno.test('render — output_files with empty list yields empty string in resolved text', () => {
  const out = render({
    instruction: 'Empty: [{{step-2.output_files}}]',
    params: {},
    priorSteps: sampleSteps,
    references: {},
  })
  assertEquals(out.resolved_text, 'Empty: []')
  assertEquals(
    out.user_message_blocks.filter((b) => b.type === 'image').length,
    0,
  )
})

Deno.test('render — {{ref:KEY}} text reference inlines content_text', () => {
  const out = render({
    instruction: 'Voice: {{ref:tone_of_voice}}',
    params: {},
    priorSteps: [],
    references: sampleRefs,
  })
  assertEquals(out.resolved_text, 'Voice: Speak in calm, warm Portuguese.')
  assertEquals(out.user_message_blocks, [
    { type: 'text', text: 'Voice: Speak in calm, warm Portuguese.' },
  ])
})

Deno.test('render — {{ref:KEY}} image reference becomes an image block, not URL text', () => {
  const out = render({
    instruction: 'Mood: {{ref:moodboard}}',
    params: {},
    priorSteps: [],
    references: sampleRefs,
  })
  // Image refs leave nothing in the text (they are NOT URL text).
  assertEquals(
    out.user_message_blocks.some(
      (b) => b.type === 'text' && b.text.includes('signed.example/refs'),
    ),
    false,
  )
  const imageBlocks = out.user_message_blocks.filter((b) => b.type === 'image')
  assertEquals(imageBlocks, [
    {
      type: 'image',
      source: { type: 'url', url: 'https://signed.example/refs/moodboard.png' },
    },
  ])
})

Deno.test('render — multiple image refs emitted in left-to-right order', () => {
  const refs = {
    a: { kind: 'image', url: 'https://x/a.png', mime_type: 'image/png' },
    b: { kind: 'image', url: 'https://x/b.png', mime_type: 'image/png' },
    c: { kind: 'image', url: 'https://x/c.png', mime_type: 'image/png' },
  }
  const out = render({
    instruction: 'see {{ref:b}} and {{ref:a}} and {{ref:c}}',
    params: {},
    priorSteps: [],
    references: refs,
  })
  const urls = out.user_message_blocks
    .filter((b) => b.type === 'image')
    .map((b) => b.source.url)
  assertEquals(urls, ['https://x/b.png', 'https://x/a.png', 'https://x/c.png'])
})

Deno.test('render — combines params, prior step output, and refs into one prompt', () => {
  const out = render({
    instruction:
      'Topic: {{params.topic}}\nResearch: {{step-1.output}}\nVoice: {{ref:tone_of_voice}}',
    params: sampleParams,
    priorSteps: sampleSteps,
    references: sampleRefs,
  })
  assertEquals(
    out.resolved_text,
    'Topic: ansiedade\nResearch: research summary text\nVoice: Speak in calm, warm Portuguese.',
  )
  assertEquals(out.validation_errors, [])
})

Deno.test('render — missing param produces a validation error, no throw', () => {
  const out = render({
    instruction: 'Topic: {{params.missing_one}}',
    params: {},
    priorSteps: [],
    references: {},
  })
  assertEquals(out.validation_errors.length, 1)
  assertEquals(out.validation_errors[0].kind, 'missing_param')
  assertEquals(out.validation_errors[0].placeholder, 'params.missing_one')
})

Deno.test('render — missing prior-step output produces a validation error', () => {
  const out = render({
    instruction: 'Prior: {{step-3.output}}',
    params: {},
    priorSteps: sampleSteps,
    references: {},
  })
  assertEquals(out.validation_errors.length, 1)
  assertEquals(out.validation_errors[0].kind, 'missing_step_output')
  assertEquals(out.validation_errors[0].placeholder, 'step-3.output')
})

Deno.test('render — missing reference produces a validation error', () => {
  const out = render({
    instruction: 'Voice: {{ref:nope}}',
    params: {},
    priorSteps: [],
    references: sampleRefs,
  })
  assertEquals(out.validation_errors.length, 1)
  assertEquals(out.validation_errors[0].kind, 'missing_ref')
  assertEquals(out.validation_errors[0].placeholder, 'ref:nope')
})

Deno.test('render — unknown placeholder format produces a validation error', () => {
  const out = render({
    instruction: 'Weird: {{not_a_known_kind}}',
    params: {},
    priorSteps: [],
    references: {},
  })
  assertEquals(out.validation_errors.length, 1)
  assertEquals(out.validation_errors[0].kind, 'unknown_placeholder')
})

Deno.test('render — audio reference is recognised but unsupported in v1', () => {
  const out = render({
    instruction: 'Audio: {{ref:voicebed}}',
    params: {},
    priorSteps: [],
    references: {
      voicebed: { kind: 'audio', url: 'https://x/v.mp3', mime_type: 'audio/mpeg' },
    },
  })
  assertEquals(out.validation_errors.length, 1)
  assertEquals(out.validation_errors[0].kind, 'unsupported_ref_kind')
})

Deno.test('render — defaults missing params/priorSteps/references to empty', () => {
  const out = render({ instruction: 'Hi' })
  assertEquals(out.resolved_text, 'Hi')
  assertEquals(out.user_message_blocks, [{ type: 'text', text: 'Hi' }])
  assertEquals(out.validation_errors, [])
})

// ── validate() ──────────────────────────────────────────────────────────────

Deno.test('validate — returns no errors when every placeholder is declared', () => {
  const errors = validate(
    {
      instruction:
        'Topic: {{params.topic}} | Prior: {{step-1.output}} | Voice: {{ref:tone}}',
    },
    ['topic'],
    [1],
    ['tone'],
  )
  assertEquals(errors, [])
})

Deno.test('validate — flags undeclared param', () => {
  const errors = validate(
    { instruction: '{{params.topic}} {{params.audience}}' },
    ['topic'],
    [],
    [],
  )
  assertEquals(errors.length, 1)
  assertEquals(errors[0].kind, 'undeclared_param')
  assertEquals(errors[0].placeholder, 'params.audience')
})

Deno.test('validate — flags undeclared step output dependency', () => {
  const errors = validate(
    { instruction: '{{step-1.output}} {{step-2.output}}' },
    [],
    [1],
    [],
  )
  assertEquals(errors.length, 1)
  assertEquals(errors[0].kind, 'undeclared_step')
  assertEquals(errors[0].placeholder, 'step-2.output')
})

Deno.test('validate — flags undeclared step output_files dependency', () => {
  const errors = validate(
    { instruction: '{{step-3.output_files}}' },
    [],
    [1, 2],
    [],
  )
  assertEquals(errors.length, 1)
  assertEquals(errors[0].kind, 'undeclared_step')
  assertEquals(errors[0].placeholder, 'step-3.output_files')
})

Deno.test('validate — flags undeclared reference key', () => {
  const errors = validate(
    { instruction: '{{ref:moodboard}}' },
    [],
    [],
    ['tone_of_voice'],
  )
  assertEquals(errors.length, 1)
  assertEquals(errors[0].kind, 'undeclared_ref')
  assertEquals(errors[0].placeholder, 'ref:moodboard')
})

Deno.test('validate — flags unknown placeholder format', () => {
  const errors = validate(
    { instruction: 'Weird: {{garbage}}' },
    [],
    [],
    [],
  )
  assertEquals(errors.length, 1)
  assertEquals(errors[0].kind, 'unknown_placeholder')
})

Deno.test('validate — collects multiple errors in left-to-right order', () => {
  const errors = validate(
    {
      instruction:
        '{{params.unknown_param}} {{step-9.output}} {{ref:nope}} {{whatever}}',
    },
    [],
    [],
    [],
  )
  assertEquals(errors.length, 4)
  assertEquals(errors[0].kind, 'undeclared_param')
  assertEquals(errors[1].kind, 'undeclared_step')
  assertEquals(errors[2].kind, 'undeclared_ref')
  assertEquals(errors[3].kind, 'unknown_placeholder')
})

Deno.test('validate — does not report the same placeholder more than once', () => {
  const errors = validate(
    { instruction: '{{params.x}} and {{params.x}} again' },
    [],
    [],
    [],
  )
  assertEquals(errors.length, 1)
  assertEquals(errors[0].placeholder, 'params.x')
})

Deno.test('validate — instruction without placeholders has no errors', () => {
  const errors = validate({ instruction: 'plain text' }, [], [], [])
  assertEquals(errors, [])
})
