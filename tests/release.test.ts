import { expect, test } from 'bun:test'
import { orderLiveResults, preparePromptPayload, type LivePromptInput, type LivePromptResult } from '../src/lib/live'
import { initialGamification, onComparisonSeen, onRequestComplete } from '../src/lib/quests'
import { isCompleteStudyScore, scoreStudy } from '../src/lib/study'

const baseInput: LivePromptInput = {
  prompt: '  answer this  ',
  modelId: 'llama3-8b-8192',
  mode: 'single',
  detectedComplexity: 'simple',
  selectedComplexity: 'simple',
  wasRecommended: true,
  storePrompt: false,
  contextCleared: true,
  conversation: [
    { role: 'user', content: '  keep this  ' },
    { role: 'assistant', content: '  ' },
  ],
}

test('request payload keeps retained context and makes privacy choices explicit', () => {
  const payload = preparePromptPayload(baseInput)

  expect(payload.prompt).toBe('answer this')
  expect(payload.storePrompt).toBe(false)
  expect(payload.contextCleared).toBe(true)
  expect(payload.conversation).toEqual([{ role: 'user', content: 'keep this' }])
})

test('dual results follow requested model order and keep comparison linkage outside result ordering', () => {
  const result = (modelId: LivePromptResult['modelId'], output: string): LivePromptResult => ({
    modelId,
    providerModelId: modelId,
    output,
    inputTokens: 2,
    outputTokens: 3,
    totalTokens: 5,
    modelledCarbon: { lowG: 1, centralG: 2, highG: 3 },
  })

  expect(orderLiveResults(
    [result('mixtral-8x7b-32768', 'second'), result('llama3-8b-8192', 'first')],
    ['llama3-8b-8192', 'mixtral-8x7b-32768'],
  ).map((item) => item.output)).toEqual(['first', 'second'])
})

test('all five quest triggers award one stable badge and duplicate events do not advance completed quests', () => {
  let state = initialGamification()
  state = onRequestComplete(state, {
    switched: true, rightSized: true, promptLength: 100, carbonSavedG: 1, tokensSaved: 2,
    looksBatched: true, contextCleared: true,
  })
  state = onComparisonSeen(state)
  state = onRequestComplete(state, {
    switched: false, rightSized: true, promptLength: 100, carbonSavedG: 0, tokensSaved: 0,
    looksBatched: true, contextCleared: true,
  })
  state = onRequestComplete(state, {
    switched: false, rightSized: true, promptLength: 300, carbonSavedG: 0, tokensSaved: 0,
    looksBatched: false, contextCleared: false,
  })
  state = onRequestComplete(state, {
    switched: false, rightSized: true, promptLength: 300, carbonSavedG: 0, tokensSaved: 0,
    looksBatched: false, contextCleared: false,
  })
  state = onRequestComplete(state, {
    switched: false, rightSized: true, promptLength: 100, carbonSavedG: 0, tokensSaved: 0,
    looksBatched: true, contextCleared: true,
  })

  expect(state.quests.every((quest) => quest.progress === quest.target)).toBe(true)
  expect(new Set(state.badges.map((badge) => badge.name)).size).toBe(5)
  const completedState = onRequestComplete(state, {
    switched: false, rightSized: true, promptLength: 100, carbonSavedG: 0, tokensSaved: 0,
    looksBatched: true, contextCleared: true,
  })
  expect(completedState.badges).toHaveLength(5)
  expect(completedState.quests.find((quest) => quest.id === 'prompt-trim')?.progress).toBe(3)
})

test('a non-right-sized request resets an unfinished streak', () => {
  let state = initialGamification()
  state = onRequestComplete(state, {
    switched: false, rightSized: true, promptLength: 300, carbonSavedG: 0, tokensSaved: 0,
    looksBatched: false, contextCleared: false,
  })
  state = onRequestComplete(state, {
    switched: false, rightSized: false, promptLength: 300, carbonSavedG: 0, tokensSaved: 0,
    looksBatched: false, contextCleared: false,
  })

  expect(state.rightSizeStreak).toBe(0)
  expect(state.quests.find((quest) => quest.id === 'right-size-streak')?.progress).toBe(0)
})

test('study scoring accepts only complete three-question scores', () => {
  expect(scoreStudy({ emissions: 'b', usage: 'a', rightSizing: 'c' })).toBe(3)
  expect(isCompleteStudyScore(3)).toBe(true)
  expect(isCompleteStudyScore(4)).toBe(false)
  expect(isCompleteStudyScore(Number.NaN)).toBe(false)
})
