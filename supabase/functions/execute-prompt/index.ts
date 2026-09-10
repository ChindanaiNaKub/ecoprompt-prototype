import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type Complexity = 'simple' | 'moderate' | 'complex'
type ModelId = 'llama3-8b-8192' | 'mixtral-8x7b-32768' | 'llama3-70b-8192'
type RequestMode = 'single' | 'dual'

interface PromptRequest {
  prompt: string
  modelId: ModelId
  comparisonModelId?: ModelId
  mode: RequestMode
  detectedComplexity: Complexity
  selectedComplexity: Complexity
  wasRecommended: boolean
  storePrompt: boolean
  contextCleared: boolean
  initialModelId?: ModelId
  recommendedModelId?: ModelId
  modelDecision?: 'keep' | 'switch' | 'override'
  studySessionId?: string
  operationId?: string
  conversation: Array<{ role: 'user' | 'assistant'; content: string }>
}

const MODELS: Record<ModelId, { providerModelId: string; energyRangePer1kTokens: readonly [number, number, number] }> = {
  'llama3-8b-8192': { providerModelId: 'llama3-8b-8192', energyRangePer1kTokens: [0.2216, 0.277, 0.3324] },
  'mixtral-8x7b-32768': { providerModelId: 'mixtral-8x7b-32768', energyRangePer1kTokens: [0.444, 0.555, 0.666] },
  'llama3-70b-8192': { providerModelId: 'llama3-70b-8192', energyRangePer1kTokens: [0.6664, 0.833, 0.9996] },
}

const GRID_INTENSITY_G_PER_WH = 0.475
const METHODOLOGY_VERSION = '2026-09-sensitivity-v1'

const allowedOrigins = new Set([
  'https://chindanainakub.github.io',
  'http://localhost:5173',
])

function corsHeaders(origin: string | null) {
  const allowedOrigin = origin && allowedOrigins.has(origin) ? origin : 'https://chindanainakub.github.io'
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

function error(message: string, status: number, headers: HeadersInit) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}

function isPromptRequest(value: unknown): value is PromptRequest {
  if (!value || typeof value !== 'object') return false
  const input = value as Record<string, unknown>
  const conversation = input.conversation
  return typeof input.prompt === 'string' && typeof input.modelId === 'string' &&
    (input.mode === 'single' || input.mode === 'dual') &&
    ['simple', 'moderate', 'complex'].includes(String(input.detectedComplexity)) &&
    ['simple', 'moderate', 'complex'].includes(String(input.selectedComplexity)) &&
    typeof input.wasRecommended === 'boolean' && typeof input.storePrompt === 'boolean' &&
    typeof input.contextCleared === 'boolean' && Array.isArray(conversation) &&
    conversation.every((turn) => Boolean(turn) && typeof turn === 'object' &&
      (turn.role === 'user' || turn.role === 'assistant') && typeof turn.content === 'string')
}

function looksBatched(text: string) {
  return /^\s*\d+[\).]/m.test(text) || /\n\s*\d+[\).]/.test(text) || (text.match(/\?/g) ?? []).length >= 2
}

function isModelId(value: unknown): value is ModelId {
  return typeof value === 'string' && value in MODELS
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request.headers.get('origin'))
  if (request.method === 'OPTIONS') return new Response('ok', { headers })
  if (request.method !== 'POST') return error('Method not allowed.', 405, headers)

  const authorization = request.headers.get('Authorization')
  if (!authorization) return error('Sign in to send a prompt.', 401, headers)

  let payload: PromptRequest
  try {
    payload = await request.json()
  } catch {
    return error('Request body must be valid JSON.', 400, headers)
  }

  if (
    !isPromptRequest(payload) || !MODELS[payload.modelId] ||
    (payload.comparisonModelId && !isModelId(payload.comparisonModelId)) ||
    (payload.initialModelId && !isModelId(payload.initialModelId)) ||
    (payload.recommendedModelId && !isModelId(payload.recommendedModelId)) ||
    (payload.modelDecision && !['keep', 'switch', 'override'].includes(payload.modelDecision)) ||
    (payload.studySessionId && !isUuid(payload.studySessionId)) ||
    (payload.operationId && !isUuid(payload.operationId)) ||
    payload.prompt.trim().length === 0 || payload.prompt.length > 12000
  ) {
    return error('Prompt request is invalid.', 400, headers)
  }
  if (payload.mode === 'dual' && (!payload.comparisonModelId || !MODELS[payload.comparisonModelId] || payload.comparisonModelId === payload.modelId)) {
    return error('Choose a different comparison model.', 400, headers)
  }
  if (payload.mode === 'single' && payload.comparisonModelId) return error('Comparison model is only valid for dual requests.', 400, headers)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const groqKey = Deno.env.get('GROQ_API_KEY')
  
  if (!supabaseUrl || !anonKey || !serviceKey || !groqKey) return error('Server configuration is incomplete.', 503, headers)

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } })
  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) return error('Your sign-in session has expired.', 401, headers)

  const admin = createClient(supabaseUrl, serviceKey)
  
  const { data: allowed, error: allowanceError } = await admin.rpc('consume_daily_allowance', {
    p_user_id: user.id,
    p_kind: payload.mode,
  })
  if (allowanceError) return error('Could not check today’s allowance.', 500, headers)
  if (!allowed) return error('Daily free-demo allowance reached. Try again tomorrow.', 429, headers)

  const messages = [
    ...payload.conversation.slice(-10).map(({ role, content }) => ({ role, content: content.trim().slice(0, 12000) })).filter(({ content }) => content),
    { role: 'user', content: payload.prompt.trim() },
  ]
  const requestedModels: ModelId[] = payload.mode === 'dual'
    ? [payload.modelId, payload.comparisonModelId!] : [payload.modelId]
  
  const comparisonId = payload.mode === 'dual' ? crypto.randomUUID() : null
  const operationId = payload.operationId ?? crypto.randomUUID()

  try {
    const results = await Promise.all(requestedModels.map(async (modelId) => {
      const model = MODELS[modelId]
      const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: model.providerModelId, messages, temperature: 0.2, max_completion_tokens: payload.mode === 'dual' ? 256 : 512 }),
      })
      
      if (!groqResponse.ok) {
        if (groqResponse.status === 429) throw new Error('GROQ_RATE_LIMIT')
        throw new Error('GROQ_REQUEST_FAILED')
      }
      
      const completion = await groqResponse.json()
      const usage = completion.usage ?? {}
      const inputTokens = Number(usage.prompt_tokens ?? 0)
      const outputTokens = Number(usage.completion_tokens ?? 0)
      const totalTokens = Number(usage.total_tokens ?? inputTokens + outputTokens)
      
      const [lowEnergy, centralEnergy, highEnergy] = model.energyRangePer1kTokens
      const modelledCarbon = {
        lowG: (totalTokens / 1000) * lowEnergy * GRID_INTENSITY_G_PER_WH,
        centralG: (totalTokens / 1000) * centralEnergy * GRID_INTENSITY_G_PER_WH,
        highG: (totalTokens / 1000) * highEnergy * GRID_INTENSITY_G_PER_WH,
      }
      
      return {
        modelId,
        providerModelId: model.providerModelId,
        output: String(completion.choices?.[0]?.message?.content ?? ''),
        inputTokens,
        outputTokens,
        totalTokens,
        modelledCarbon,
      }
    }))

    const initialModelId = payload.initialModelId ?? payload.modelId
    const events = results.map((result) => {
      const switched = payload.modelDecision === 'switch' && result.modelId === payload.modelId && initialModelId !== result.modelId
      const [, resultCentralEnergy] = MODELS[result.modelId].energyRangePer1kTokens
      const carbonSaved = switched
        ? Math.max(0, (result.totalTokens / 1000) * (MODELS[initialModelId].energyRangePer1kTokens[1] - resultCentralEnergy) * GRID_INTENSITY_G_PER_WH)
        : 0
      return {
        comparison_id: comparisonId,
        request_mode: payload.mode,
        model_id: result.modelId,
        provider_model_id: result.providerModelId,
        complexity_detected: payload.detectedComplexity,
        complexity_selected: payload.selectedComplexity,
        was_recommended: payload.wasRecommended && result.modelId === payload.modelId,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
        total_tokens: result.totalTokens,
        modelled_carbon_low_g: result.modelledCarbon.lowG,
        modelled_carbon_central_g: result.modelledCarbon.centralG,
        modelled_carbon_high_g: result.modelledCarbon.highG,
        prompt_length: payload.prompt.trim().length,
        prompt_text: payload.prompt.trim(),
        prompt_storage_consented: payload.storePrompt,
        context_cleared: payload.contextCleared,
        methodology_version: METHODOLOGY_VERSION,
        initial_model_id: initialModelId,
        recommended_model_id: payload.recommendedModelId ?? payload.modelId,
        model_decision: payload.modelDecision ?? 'keep',
        switched,
        right_sized: payload.wasRecommended && result.modelId === payload.modelId,
        looks_batched: looksBatched(payload.prompt),
        carbon_saved_g: carbonSaved,
        tokens_saved: 0,
        operation_id: operationId,
      }
    })

    const { data: gamification, error: writeError } = await admin.rpc('record_request_outcome', {
      p_user_id: user.id,
      p_events: events,
      p_gamification: {
        right_sized: payload.mode === 'single' && payload.wasRecommended,
        switched: payload.modelDecision === 'switch',
        looks_batched: looksBatched(payload.prompt),
        context_cleared: payload.contextCleared,
      },
      p_study_session_id: payload.studySessionId ?? null,
    })

    if (writeError) return error('Response generated, but progress could not be saved.', 500, headers)
    
    return new Response(JSON.stringify({ results, comparisonId, methodologyVersion: METHODOLOGY_VERSION, gamification }), {
      headers: { ...headers, 'Content-Type': 'application/json' },
    })
    
  } catch (cause) {
    if (cause instanceof Error && cause.message === 'GROQ_RATE_LIMIT') {
      return error('Groq’s free quota is temporarily unavailable. No alternative model was used.', 429, headers)
    }
    return error('The model request failed. Please try again.', 502, headers)
  }
})
