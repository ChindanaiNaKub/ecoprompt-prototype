export type ModelId = 'gpt-oss-20b' | 'qwen-27b' | 'gpt-oss-120b'

export type ModelTier = 'large' | 'medium' | 'small'

export interface ModelInfo {
  id: ModelId
  /** Provider-specific Groq model identifier. */
  providerModelId: string
  name: string
  provider: 'Groq'
  tier: ModelTier
  /** Central scenario in the versioned methodology. It is not a measured provider value. */
  energyWhPer1kTokens: number
  /** Sensitivity scenarios around the central assumption, in Wh per 1k tokens. */
  energyWhRangePer1kTokens: readonly [low: number, central: number, high: number]
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
    energyWhRangePer1kTokens: [0.04, 0.08, 0.12],
    capability: 2,
  },
  {
    id: 'qwen-27b',
    providerModelId: 'qwen/qwen3.6-27b',
    name: 'Qwen 27B',
    provider: 'Groq',
    tier: 'medium',
    energyWhPer1kTokens: 0.14,
    energyWhRangePer1kTokens: [0.07, 0.14, 0.21],
    capability: 3,
  },
  {
    id: 'gpt-oss-120b',
    providerModelId: 'openai/gpt-oss-120b',
    name: 'GPT-OSS 120B',
    provider: 'Groq',
    tier: 'large',
    energyWhPer1kTokens: 0.42,
    energyWhRangePer1kTokens: [0.21, 0.42, 0.63],
    capability: 5,
  },
]

export function getModel(id: ModelId): ModelInfo {
  const model = MODELS.find((item) => item.id === id)
  if (!model) throw new Error(`Unknown model: ${id}`)
  return model
}
