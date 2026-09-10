import { expect, test } from 'bun:test'
import { METHODOLOGY_VERSION, estimateRequest } from '../src/lib/estimate'

test('estimates a transparent low to high carbon range', () => {
  const estimate = estimateRequest('Translate this sentence to Thai.', 'llama3-8b-8192', 80)

  expect(estimate.methodologyVersion).toBe(METHODOLOGY_VERSION)
  expect(estimate.totalTokens).toBe(estimate.inputTokens + estimate.outputTokens)
  expect(estimate.carbonRange.lowG).toBeLessThan(estimate.carbonRange.centralG)
  expect(estimate.carbonRange.centralG).toBeLessThan(estimate.carbonRange.highG)
  expect(estimate.carbonG).toBe(estimate.carbonRange.centralG)
})
