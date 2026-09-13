import { expect, test } from 'bun:test'
import { initialGamification, onRequestComplete } from '../src/lib/quests'

test('initialGamification creates correct initial state', () => {
  const state = initialGamification()
  
  expect(state.quests).toHaveLength(5)
  expect(state.badges).toHaveLength(0)
  expect(state.rightSizeStreak).toBe(0)
  expect(state.totalCarbonSavedG).toBe(0)
  expect(state.totalTokensSaved).toBe(0)
  expect(state.requestsSent).toBe(0)
  expect(state.switchesAccepted).toBe(0)

  const questIds = state.quests.map((q) => q.id)
  expect(questIds).toContain('right-size-streak')
  expect(questIds).toContain('prompt-trim')
  expect(questIds).toContain('batch-once')
  expect(questIds).toContain('compare-models')
  expect(questIds).toContain('context-clear')
})

test('onRequestComplete increments request counter', () => {
  let state = initialGamification()
  state = onRequestComplete(state, {
    switched: false,
    rightSized: true,
    promptLength: 300,
    carbonSavedG: 0,
    tokensSaved: 0,
    looksBatched: false,
    contextCleared: false,
  })
  
  expect(state.requestsSent).toBe(1)
})

test('onRequestComplete tracks right-sized requests correctly', () => {
  let state = initialGamification()
  state = onRequestComplete(state, {
    switched: false,
    rightSized: true,
    promptLength: 300,
    carbonSavedG: 0,
    tokensSaved: 0,
    looksBatched: false,
    contextCleared: false,
  })
  
  expect(state.rightSizeStreak).toBe(1)
  const rightSizeQuest = state.quests.find((q) => q.id === 'right-size-streak')
  expect(rightSizeQuest?.progress).toBe(1)
})

test('onRequestComplete tracks switched requests and savings', () => {
  let state = initialGamification()
  state = onRequestComplete(state, {
    switched: true,
    rightSized: true,
    promptLength: 300,
    carbonSavedG: 10.5,
    tokensSaved: 250,
    looksBatched: false,
    contextCleared: false,
  })
  
  expect(state.switchesAccepted).toBe(1)
  expect(state.totalCarbonSavedG).toBe(10.5)
  expect(state.totalTokensSaved).toBe(250)
})

test('onRequestComplete ignores negative savings', () => {
  let state = initialGamification()
  state = onRequestComplete(state, {
    switched: true,
    rightSized: true,
    promptLength: 300,
    carbonSavedG: -5,
    tokensSaved: -100,
    looksBatched: false,
    contextCleared: false,
  })
  
  expect(state.totalCarbonSavedG).toBe(0)
  expect(state.totalTokensSaved).toBe(0)
})

test('onRequestComplete tracks prompt efficiency', () => {
  let state = initialGamification()
  state = onRequestComplete(state, {
    switched: false,
    rightSized: true,
    promptLength: 150,
    carbonSavedG: 0,
    tokensSaved: 0,
    looksBatched: false,
    contextCleared: false,
  })
  
  const promptTrimQuest = state.quests.find((q) => q.id === 'prompt-trim')
  expect(promptTrimQuest?.progress).toBe(1)
})

test('onRequestComplete ignores prompt efficiency for long prompts', () => {
  let state = initialGamification()
  state = onRequestComplete(state, {
    switched: false,
    rightSized: true,
    promptLength: 250,
    carbonSavedG: 0,
    tokensSaved: 0,
    looksBatched: false,
    contextCleared: false,
  })
  
  const promptTrimQuest = state.quests.find((q) => q.id === 'prompt-trim')
  expect(promptTrimQuest?.progress).toBe(0)
})

test('onRequestComplete tracks batching detection', () => {
  let state = initialGamification()
  state = onRequestComplete(state, {
    switched: false,
    rightSized: true,
    promptLength: 300,
    carbonSavedG: 0,
    tokensSaved: 0,
    looksBatched: true,
    contextCleared: false,
  })
  
  const batchQuest = state.quests.find((q) => q.id === 'batch-once')
  expect(batchQuest?.progress).toBe(1)
})

test('onRequestComplete tracks context clearing', () => {
  let state = initialGamification()
  state = onRequestComplete(state, {
    switched: false,
    rightSized: true,
    promptLength: 300,
    carbonSavedG: 0,
    tokensSaved: 0,
    looksBatched: false,
    contextCleared: true,
  })
  
  const contextQuest = state.quests.find((q) => q.id === 'context-clear')
  expect(contextQuest?.progress).toBe(1)
})

test('onRequestComplete accumulates multiple improvements in one request', () => {
  let state = initialGamification()
  state = onRequestComplete(state, {
    switched: true,
    rightSized: true,
    promptLength: 100,
    carbonSavedG: 5,
    tokensSaved: 100,
    looksBatched: true,
    contextCleared: true,
  })
  
  expect(state.quests.find((q) => q.id === 'right-size-streak')?.progress).toBe(1)
  expect(state.quests.find((q) => q.id === 'prompt-trim')?.progress).toBe(1)
  expect(state.quests.find((q) => q.id === 'batch-once')?.progress).toBe(1)
  expect(state.quests.find((q) => q.id === 'context-clear')?.progress).toBe(1)
})

test('does not mutate original state', () => {
  const state = initialGamification()
  const stateCopy = JSON.parse(JSON.stringify(state))
  onRequestComplete(state, {
    switched: true,
    rightSized: true,
    promptLength: 100,
    carbonSavedG: 5,
    tokensSaved: 100,
    looksBatched: true,
    contextCleared: true,
  })
  
  expect(JSON.stringify(state)).toBe(JSON.stringify(stateCopy))
})
