import { expect, test } from 'bun:test'
import { getModel, MODELS } from '../src/lib/models'

test('getModel returns correct model by id', () => {
  const smallModel = getModel('llama3-8b-8192')
  expect(smallModel.id).toBe('llama3-8b-8192')
  expect(smallModel.tier).toBe('small')
  expect(smallModel.capability).toBe(2)
  expect(smallModel.name).toContain('Llama 3 8B')

  const mediumModel = getModel('mixtral-8x7b-32768')
  expect(mediumModel.tier).toBe('medium')
  expect(mediumModel.capability).toBe(3)

  const largeModel = getModel('llama3-70b-8192')
  expect(largeModel.tier).toBe('large')
  expect(largeModel.capability).toBe(5)
})

test('getModel throws error for unknown model', () => {
  try {
    getModel('unknown-model' as any)
    expect(true).toBe(false) // Should not reach here
  } catch (error) {
    expect((error as Error).message).toContain('Unknown model')
  }
})

test('all models have consistent energy specifications', () => {
  for (const model of MODELS) {
    expect(model.energyWhRangePer1kTokens).toHaveLength(3)
    const [low, central, high] = model.energyWhRangePer1kTokens
    expect(low).toBeLessThan(central)
    expect(central).toBeLessThan(high)
    expect(model.energyWhPer1kTokens).toBe(central)
  }
})

test('models are ordered by tier and capability', () => {
  const tiers = MODELS.map((m) => m.tier)
  expect(tiers[0]).toBe('small')
  expect(tiers[1]).toBe('medium')
  expect(tiers[2]).toBe('large')

  const capabilities = MODELS.map((m) => m.capability)
  expect(capabilities[0]).toBeLessThan(capabilities[1])
  expect(capabilities[1]).toBeLessThan(capabilities[2])
})
