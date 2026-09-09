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
  conversation: Array<{ role: 'user' | 'assistant'; content: string }>
}

export interface LivePromptResult {
  modelId: ModelId
  providerModelId: string
  output: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  carbonG: number
}

export async function executeLivePrompt(input: LivePromptInput) {
  if (!supabase) throw new Error('Live mode is not configured.')
  const { data, error } = await supabase.functions.invoke<{
    results: LivePromptResult[]
    comparisonId: string | null
    methodologyVersion: string
  }>('execute-prompt', { body: input })
  if (error) throw new Error(error.message)
  if (!data?.results?.length) throw new Error('The server returned no model response.')
  return data
}
