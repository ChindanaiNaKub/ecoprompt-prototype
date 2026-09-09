export type ModelId = 'gpt-oss-20b' | 'qwen-27b' | 'gpt-oss-120b'

export type ModelTier = 'large' | 'medium' | 'small'

export interface ModelInfo {
  id: ModelId
  /** Provider-specific Groq model identifier. */
  providerModelId: string
  name: string
  provider: 'Groq'
  tier: ModelTier
  /** Central estimate; the methodology is deliberately shown as an approximation. */
  energyWhPer1kTokens: number
  capability: number
}

/**
 * Groq's free-plan catalog, pinned rather than automatically routed so comparisons
 * remain reproducible.
 */
export const MODELS: ModelInfo[] = [
  {
    id: 'gpt-oss-20b',
    providerModelId: 'openai/gpt-oss-20b',
    name: 'GPT-OSS 20B',
    provider: 'Groq',
    tier: 'small',
    energyWhPer1kTokens: 0.08,
    capability: 2,
  },
  {
    id: 'qwen-27b',
    providerModelId: 'qwen/qwen3.6-27b',
    name: 'Qwen 27B',
    provider: 'Groq',
    tier: 'medium',
    energyWhPer1kTokens: 0.14,
    capability: 3,
  },
  {
    id: 'gpt-oss-120b',
    providerModelId: 'openai/gpt-oss-120b',
    name: 'GPT-OSS 120B',
    provider: 'Groq',
    tier: 'large',
    energyWhPer1kTokens: 0.42,
    capability: 5,
  },
]

export function getModel(id: ModelId): ModelInfo {
  const model = MODELS.find((item) => item.id === id)
  if (!model) throw new Error(`Unknown model: ${id}`)
  return model
}
