// Thin wrapper around the `instantiate_template` Postgres RPC.
//
// The RPC validates `p_params` against the template's params_schema,
// renders title/description from title_template/description_template,
// clones the plan into a fresh `tasks` row, and returns the new id.
// The frontend pre-validates with templateParams.validateParams so the
// modal can show inline errors before round-tripping. The RPC's own
// validation is the source of truth and produces the surfaced error
// message if the form is bypassed.

export class TemplateInstantiationError extends Error {
  constructor(message, cause) {
    super(message)
    this.name = 'TemplateInstantiationError'
    if (cause) this.cause = cause
  }
}

const FALLBACK_MESSAGE = 'Failed to instantiate template'

function pickTaskId(payload) {
  if (payload == null) return null
  if (typeof payload === 'string') return payload
  if (Array.isArray(payload)) return pickTaskId(payload[0])
  if (typeof payload === 'object' && typeof payload.id === 'string') return payload.id
  return null
}

export async function instantiateTemplate(supabaseClient, templateId, params = {}) {
  if (!supabaseClient) {
    throw new TemplateInstantiationError('Supabase client is not configured')
  }
  const { data, error } = await supabaseClient.rpc('instantiate_template', {
    p_template_id: templateId,
    p_params: params ?? {},
  })
  if (error) {
    console.error('[instantiate-template] rpc error', error)
    throw new TemplateInstantiationError(error.message || FALLBACK_MESSAGE, error)
  }
  const id = pickTaskId(data)
  if (!id) {
    throw new TemplateInstantiationError(FALLBACK_MESSAGE)
  }
  return id
}
