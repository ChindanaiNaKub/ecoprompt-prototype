import { expect, test } from 'bun:test'
import { METHODOLOGY_VERSION, estimateRequest } from '../src/lib/estimate'
import { recommend } from '../src/lib/recommend'

test('estimates a transparent low to high carbon range', () => {
  const estimate = estimateRequest('Translate this sentence to Thai.', 'llama3-8b-8192', 80)

  expect(estimate.methodologyVersion).toBe(METHODOLOGY_VERSION)
  expect(estimate.totalTokens).toBe(estimate.inputTokens + estimate.outputTokens)
  expect(estimate.carbonRange.lowG).toBeLessThan(estimate.carbonRange.centralG)
  expect(estimate.carbonRange.centralG).toBeLessThan(estimate.carbonRange.highG)
  expect(estimate.carbonG).toBe(estimate.carbonRange.centralG)
})

test('manual complexity override preserves detected complexity and changes recommendation', () => {
  const recommendation = recommend('Translate this sentence to Thai.', 'llama3-70b-8192', 'complex')

  expect(recommendation.detectedComplexity).toBe('simple')
  expect(recommendation.selectedComplexity).toBe('complex')
  expect(recommendation.suggested.id).toBe('llama3-70b-8192')
  expect(recommendation.mismatch).toBe(false)
})
