export type ModelId = 'llama3-8b-8192' | 'mixtral-8x7b-32768' | 'llama3-70b-8192'

export type ModelTier = 'large' | 'medium' | 'small'

export interface ModelInfo {
  id: ModelId
  providerModelId: string
  name: string
  provider: 'Groq'
  tier: ModelTier
  energyWhPer1kTokens: number
  energyWhRangePer1kTokens: readonly [low: number, central: number, high: number]
  capability: number
}

export const MODELS: ModelInfo[] = [
  {
    id: 'llama3-8b-8192',
    providerModelId: 'llama3-8b-8192',
    name: 'Llama 3 8B (Fast & Light)',
    provider: 'Groq',
    tier: 'small',
    energyWhPer1kTokens: 0.277,
    energyWhRangePer1kTokens: [0.2216, 0.277, 0.3324],
    capability: 2,
  },
  {
    id: 'mixtral-8x7b-32768',
    providerModelId: 'mixtral-8x7b-32768',
    name: 'Mixtral 8x7B (Balanced)',
    provider: 'Groq',
    tier: 'medium',
    energyWhPer1kTokens: 0.555,
    energyWhRangePer1kTokens: [0.444, 0.555, 0.666],
    capability: 3,
  },
  {
    id: 'llama3-70b-8192',
    providerModelId: 'llama3-70b-8192',
    name: 'Llama 3 70B (Complex Reasoning)',
    provider: 'Groq',
    tier: 'large',
    energyWhPer1kTokens: 0.833,
    energyWhRangePer1kTokens: [0.6664, 0.833, 0.9996],
    capability: 5,
  },
]

export function getModel(id: ModelId): ModelInfo {
  const model = MODELS.find((item) => item.id === id)
  if (!model) throw new Error(`Unknown model: ${id}`)
  return model
}