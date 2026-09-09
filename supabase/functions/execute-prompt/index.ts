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
  conversation?: Array<{ role: 'user' | 'assistant'; content: string }>
}

const MODELS: Record<ModelId, { providerModelId: string; energyPer1kTokens: number }> = {
  'llama3-8b-8192': { providerModelId: 'llama3-8b-8192', energyPer1kTokens: 0.277 },
  'mixtral-8x7b-32768': { providerModelId: 'mixtral-8x7b-32768', energyPer1kTokens: 0.555 },
  'llama3-70b-8192': { providerModelId: 'llama3-70b-8192', energyPer1kTokens: 0.833 },
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
  return typeof input.prompt === 'string' && typeof input.modelId === 'string' &&
    (input.mode === 'single' || input.mode === 'dual') &&
    ['simple', 'moderate', 'complex'].includes(String(input.detectedComplexity)) &&
    ['simple', 'moderate', 'complex'].includes(String(input.selectedComplexity))
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
    (payload.initialModelId && !MODELS[payload.initialModelId]) ||
    (payload.recommendedModelId && !MODELS[payload.recommendedModelId]) ||
    (payload.modelDecision && !['keep', 'switch', 'override'].includes(payload.modelDecision)) ||
    payload.prompt.trim().length === 0 || payload.prompt.length > 12000
  ) {
    return error('Prompt request is invalid.', 400, headers)
  }
  if (payload.mode === 'dual' && (!payload.comparisonModelId || !MODELS[payload.comparisonModelId] || payload.comparisonModelId === payload.modelId)) {
    return error('Choose a different comparison model.', 400, headers)
  }

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
    ...(payload.conversation ?? []).slice(-10).map(({ role, content }) => ({ role, content: content.slice(0, 12000) })),
    { role: 'user', content: payload.prompt.trim() },
  ]
  const requestedModels = payload.mode === 'dual'
    ? [payload.modelId, payload.comparisonModelId!] : [payload.modelId]
  
  const comparisonId = payload.mode === 'dual' ? crypto.randomUUID() : null

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
      
      const baseCarbon = (totalTokens / 1000) * model.energyPer1kTokens * GRID_INTENSITY_G_PER_WH
      const modelledCarbon = {
        lowG: baseCarbon * 0.8,
        centralG: baseCarbon,
        highG: baseCarbon * 1.2,
      }
      
      return {
        modelId,
        output: String(completion.choices?.[0]?.message?.content ?? ''),
        totalTokens,
        modelledCarbon,
      }
    }))

    const { error: writeError } = await admin.from('request_events').insert(results.map((result) => {
      let recommendedAccepted = null;
      if (payload.modelDecision === 'switch') recommendedAccepted = true;
      if (payload.modelDecision === 'keep') recommendedAccepted = false;

      return {
        user_id: user.id,
        model_used: result.modelId,
        prompt_length: payload.prompt.trim().length,
        provider_tokens: result.totalTokens,
        carbon_low: result.modelledCarbon.lowG,
        carbon_central: result.modelledCarbon.centralG,
        carbon_high: result.modelledCarbon.highG,
        recommendation_shown: payload.wasRecommended,
        recommendation_accepted: recommendedAccepted,
        initial_model_selected: payload.initialModelId ?? payload.modelId,
        is_dual_run: payload.mode === 'dual',
        linked_request_id: comparisonId,
        is_context_cleared: payload.contextCleared,
        has_consent: payload.storePrompt,
        prompt_text: payload.storePrompt ? payload.prompt.trim() : null // เก็บเฉพาะที่ Opt-in[cite: 4]
      }
    }))

    if (writeError) return error('Response generated, but progress could not be saved.', 500, headers)
    
    return new Response(JSON.stringify({ results, comparisonId, methodologyVersion: METHODOLOGY_VERSION }), {
      headers: { ...headers, 'Content-Type': 'application/json' },
    })
    
  } catch (cause) {
    if (cause instanceof Error && cause.message === 'GROQ_RATE_LIMIT') {
      return error('Groq’s free quota is temporarily unavailable. No alternative model was used.', 429, headers)
    }
    return error('The model request failed. Please try again.', 502, headers)
  }
})