export type ModelId =
  | 'gpt-4o'
  | 'gpt-4o-mini'
  | 'claude-sonnet'
  | 'claude-haiku'
  | 'llama-70b'
  | 'llama-8b'

export type ModelTier = 'large' | 'medium' | 'small'

export interface ModelInfo {
  id: ModelId
  name: string
  provider: string
  tier: ModelTier
  /** Approximate Wh per 1k tokens (input+output blended) — research-derived estimate */
  energyWhPer1kTokens: number
  capability: number // 1–5
}

export const MODELS: ModelInfo[] = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'OpenAI',
    tier: 'large',
    energyWhPer1kTokens: 0.42,
    capability: 5,
  },
  {
    id: 'claude-sonnet',
    name: 'Claude Sonnet',
    provider: 'Anthropic',
    tier: 'large',
    energyWhPer1kTokens: 0.38,
    capability: 5,
  },
  {
    id: 'llama-70b',
    name: 'Llama 3.1 70B',
    provider: 'Meta',
    tier: 'medium',
    energyWhPer1kTokens: 0.22,
    capability: 4,
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o mini',
    provider: 'OpenAI',
    tier: 'medium',
    energyWhPer1kTokens: 0.12,
    capability: 3,
  },
  {
    id: 'claude-haiku',
    name: 'Claude Haiku',
    provider: 'Anthropic',
    tier: 'small',
    energyWhPer1kTokens: 0.08,
    capability: 3,
  },
  {
    id: 'llama-8b',
    name: 'Llama 3.1 8B',
    provider: 'Meta',
    tier: 'small',
    energyWhPer1kTokens: 0.05,
    capability: 2,
  },
]

export function getModel(id: ModelId): ModelInfo {
  return MODELS.find((m) => m.id === id)!
}
