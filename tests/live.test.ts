import { expect, test } from 'bun:test'
import { preparePromptPayload, orderLiveResults, type LivePromptInput, type LivePromptResult } from '../src/lib/live'

test('preparePromptPayload trims prompt text', () => {
  const input: LivePromptInput = {
    prompt: '  test prompt  ',
    modelId: 'llama3-8b-8192',
    mode: 'single',
    detectedComplexity: 'simple',
    selectedComplexity: 'simple',
    wasRecommended: false,
    storePrompt: false,
    contextCleared: false,
    conversation: [],
  }
  
  const payload = preparePromptPayload(input)
  expect(payload.prompt).toBe('test prompt')
})

test('preparePromptPayload generates operationId if missing', () => {
  const input: LivePromptInput = {
    prompt: 'test',
    modelId: 'llama3-8b-8192',
    mode: 'single',
    detectedComplexity: 'simple',
    selectedComplexity: 'simple',
    wasRecommended: false,
    storePrompt: false,
    contextCleared: false,
    conversation: [],
  }
  
  const payload = preparePromptPayload(input)
  expect(payload.operationId).toBeDefined()
  expect(payload.operationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
})

test('preparePromptPayload preserves provided operationId', () => {
  const input: LivePromptInput = {
    prompt: 'test',
    modelId: 'llama3-8b-8192',
    mode: 'single',
    detectedComplexity: 'simple',
    selectedComplexity: 'simple',
    wasRecommended: false,
    storePrompt: false,
    contextCleared: false,
    operationId: 'my-custom-id',
    conversation: [],
  }
  
  const payload = preparePromptPayload(input)
  expect(payload.operationId).toBe('my-custom-id')
})

test('preparePromptPayload trims conversation messages', () => {
  const input: LivePromptInput = {
    prompt: 'test',
    modelId: 'llama3-8b-8192',
    mode: 'single',
    detectedComplexity: 'simple',
    selectedComplexity: 'simple',
    wasRecommended: false,
    storePrompt: false,
    contextCleared: false,
    conversation: [
      { role: 'user', content: '  hello  ' },
      { role: 'assistant', content: '  world  ' },
    ],
  }
  
  const payload = preparePromptPayload(input)
  expect(payload.conversation).toHaveLength(2)
  expect(payload.conversation[0].content).toBe('hello')
  expect(payload.conversation[1].content).toBe('world')
})

test('preparePromptPayload filters empty conversation messages', () => {
  const input: LivePromptInput = {
    prompt: 'test',
    modelId: 'llama3-8b-8192',
    mode: 'single',
    detectedComplexity: 'simple',
    selectedComplexity: 'simple',
    wasRecommended: false,
    storePrompt: false,
    contextCleared: false,
    conversation: [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: '   ' },
      { role: 'user', content: 'world' },
    ],
  }
  
  const payload = preparePromptPayload(input)
  expect(payload.conversation).toHaveLength(2)
  expect(payload.conversation[0].content).toBe('hello')
  expect(payload.conversation[1].content).toBe('world')
})

test('preparePromptPayload converts storePrompt to boolean', () => {
  const input: LivePromptInput = {
    prompt: 'test',
    modelId: 'llama3-8b-8192',
    mode: 'single',
    detectedComplexity: 'simple',
    selectedComplexity: 'simple',
    wasRecommended: false,
    storePrompt: 1 as any,
    contextCleared: 0 as any,
    conversation: [],
  }
  
  const payload = preparePromptPayload(input)
  expect(payload.storePrompt).toBe(true)
  expect(payload.contextCleared).toBe(false)
  expect(typeof payload.storePrompt).toBe('boolean')
  expect(typeof payload.contextCleared).toBe('boolean')
})

test('orderLiveResults reorders results by model priority', () => {
  const result = (modelId: any): LivePromptResult => ({
    modelId,
    providerModelId: modelId,
    output: `response from ${modelId}`,
    inputTokens: 10,
    outputTokens: 20,
    totalTokens: 30,
    modelledCarbon: { lowG: 1, centralG: 2, highG: 3 },
  })

  const results = [
    result('mixtral-8x7b-32768'),
    result('llama3-8b-8192'),
    result('llama3-70b-8192'),
  ]

  const ordered = orderLiveResults(results, ['llama3-8b-8192', 'mixtral-8x7b-32768', 'llama3-70b-8192'])
  expect(ordered[0].modelId).toBe('llama3-8b-8192')
  expect(ordered[1].modelId).toBe('mixtral-8x7b-32768')
  expect(ordered[2].modelId).toBe('llama3-70b-8192')
})

test('orderLiveResults filters missing models', () => {
  const result = (modelId: any): LivePromptResult => ({
    modelId,
    providerModelId: modelId,
    output: `response from ${modelId}`,
    inputTokens: 10,
    outputTokens: 20,
    totalTokens: 30,
    modelledCarbon: { lowG: 1, centralG: 2, highG: 3 },
  })

  const results = [result('llama3-8b-8192'), result('mixtral-8x7b-32768')]
  const ordered = orderLiveResults(results, ['llama3-8b-8192', 'llama3-70b-8192'])
  
  expect(ordered).toHaveLength(1)
  expect(ordered[0].modelId).toBe('llama3-8b-8192')
})

test('orderLiveResults returns empty array when no models match', () => {
  const result = (modelId: any): LivePromptResult => ({
    modelId,
    providerModelId: modelId,
    output: `response from ${modelId}`,
    inputTokens: 10,
    outputTokens: 20,
    totalTokens: 30,
    modelledCarbon: { lowG: 1, centralG: 2, highG: 3 },
  })

  const results = [result('llama3-8b-8192')]
  const ordered = orderLiveResults(results, ['mixtral-8x7b-32768', 'llama3-70b-8192'])
  
  expect(ordered).toHaveLength(0)
})
