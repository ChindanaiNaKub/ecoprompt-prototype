import { MODELS, getModel, type ModelId, type ModelInfo, type ModelTier } from './models'
import { estimateRequest, type Estimate } from './estimate'

export type Complexity = 'simple' | 'moderate' | 'complex'

export interface Recommendation {
  complexity: Complexity
  reasons: string[]
  suggested: ModelInfo
  current: ModelInfo
  mismatch: boolean
  direction: 'downsize' | 'upsize' | 'ok'
  currentEstimate: Estimate
  suggestedEstimate: Estimate
  expectedOutputTokens: number
}

const COMPLEX_HINTS = [
  /refactor|architect|design system|multi[- ]?step|reason|prove|debug|algorithm|optimiz/i,
  /write (a |an )?(full |complete )?(app|system|module|class)/i,
  /compare.*(and|vs).*explain/i,
  /step[- ]by[- ]step/i,
]

const SIMPLE_HINTS = [
  /translate|สรุป|แปล|rewrite|rephrase|fix (typo|grammar|spelling)/i,
  /what (is|does|are)|define|synonym|capitalize/i,
  /one sentence|single sentence|briefly|in 1 (line|sentence)/i,
]

export function classifyComplexity(prompt: string): {
  complexity: Complexity
  reasons: string[]
  expectedOutputTokens: number
} {
  const text = prompt.trim()
  const len = text.length
  const reasons: string[] = []

  let score = 0

  if (len < 80) {
    score -= 2
    reasons.push('Short prompt — likely a focused task')
  } else if (len > 400) {
    score += 2
    reasons.push('Long prompt — higher context cost')
  }

  if (SIMPLE_HINTS.some((r) => r.test(text))) {
    score -= 2
    reasons.push('Wording matches a simple transform task')
  }
  if (COMPLEX_HINTS.some((r) => r.test(text))) {
    score += 3
    reasons.push('Wording suggests multi-step or reasoning work')
  }

  const lines = text.split('\n').filter(Boolean).length
  if (lines >= 5) {
    score += 1
    reasons.push('Multiple lines / structured instructions')
  }

  const codeLike = /```|function |const |import |class /.test(text)
  if (codeLike && len > 120) {
    score += 2
    reasons.push('Looks like coding / technical work')
  }

  let complexity: Complexity
  if (score <= -1) complexity = 'simple'
  else if (score >= 3) complexity = 'complex'
  else complexity = 'moderate'

  if (!reasons.length) {
    reasons.push(
      complexity === 'simple'
        ? 'Heuristic: low estimated task complexity'
        : complexity === 'complex'
          ? 'Heuristic: high estimated task complexity'
          : 'Heuristic: moderate task complexity',
    )
  }

  const expectedOutputTokens =
    complexity === 'simple' ? 80 : complexity === 'moderate' ? 350 : 900

  return { complexity, reasons, expectedOutputTokens }
}

function preferredTier(complexity: Complexity): ModelTier {
  if (complexity === 'simple') return 'small'
  if (complexity === 'complex') return 'large'
  return 'medium'
}

function pickSuggested(complexity: Complexity, currentId: ModelId): ModelInfo {
  const tier = preferredTier(complexity)
  const preferred = MODELS.filter((m) => m.tier === tier)
  const current = getModel(currentId)
  // Prefer same provider when possible for a fairer comparison
  const sameProvider = preferred.find((m) => m.provider === current.provider)
  return sameProvider ?? preferred[0]
}

export function recommend(prompt: string, modelId: ModelId): Recommendation {
  const { complexity, reasons, expectedOutputTokens } = classifyComplexity(prompt)
  const current = getModel(modelId)
  const suggested = pickSuggested(complexity, modelId)
  const currentEstimate = estimateRequest(prompt, current.id, expectedOutputTokens)
  const suggestedEstimate = estimateRequest(prompt, suggested.id, expectedOutputTokens)

  let direction: Recommendation['direction'] = 'ok'
  let mismatch = false

  if (complexity === 'simple' && current.tier === 'large') {
    direction = 'downsize'
    mismatch = true
  } else if (complexity === 'complex' && current.tier === 'small') {
    direction = 'upsize'
    mismatch = true
  } else if (complexity === 'moderate' && current.tier === 'large') {
    direction = 'downsize'
    mismatch = true
  } else if (complexity === 'simple' && current.tier === 'medium') {
    direction = 'downsize'
    mismatch = suggested.id !== current.id
  }

  if (suggested.id === current.id) {
    mismatch = false
    direction = 'ok'
  }

  return {
    complexity,
    reasons,
    suggested,
    current,
    mismatch,
    direction,
    currentEstimate,
    suggestedEstimate,
    expectedOutputTokens,
  }
}
