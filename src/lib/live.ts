import type { ModelId } from './models'
import { supabase } from './supabase'
import type { Complexity } from './recommend'

export interface LivePromptInput {
  prompt: string
  modelId: ModelId
  comparisonModelId?: ModelId
  mode: 'single' | 'dual'
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

export interface LivePromptResult {
  modelId: ModelId
  providerModelId: string
  output: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  modelledCarbon: {
    lowG: number
    centralG: number
    highG: number
  }
}

export function preparePromptPayload(input: LivePromptInput): LivePromptInput {
  return {
    ...input,
    prompt: input.prompt.trim(),
    storePrompt: Boolean(input.storePrompt),
    contextCleared: Boolean(input.contextCleared),
    operationId: input.operationId ?? crypto.randomUUID(),
    conversation: input.conversation.map(({ role, content }) => ({
      role,
      content: content.trim(),
    })).filter(({ content }) => content.length > 0),
  }
}

export function orderLiveResults(
  results: LivePromptResult[],
  modelIds: ModelId[],
): LivePromptResult[] {
  return modelIds
    .map((modelId) => results.find((result) => result.modelId === modelId))
    .filter((result): result is LivePromptResult => Boolean(result))
}

export async function executeLivePrompt(input: LivePromptInput) {
  if (!supabase) throw new Error('Live mode is not configured.')
  
  const { data, error } = await supabase.functions.invoke<{
    results: LivePromptResult[]
    comparisonId: string | null
    methodologyVersion: string
  }>('execute-prompt', { body: preparePromptPayload(input) })

  if (error) {
    let errorMessage = error.message
    try {
      const context = await (error as any).context?.json()
      if (context?.error) {
        errorMessage = context.error
      }
    } catch {
    }
    throw new Error(errorMessage)
  }

  if (!data?.results?.length) throw new Error('The server returned no model response.')
  return {
    ...data,
    results: orderLiveResults(data.results, input.mode === 'dual'
      ? [input.modelId, input.comparisonModelId!]
      : [input.modelId]),
  }
}
