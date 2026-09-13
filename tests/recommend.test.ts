import { expect, test } from 'bun:test'
import { classifyComplexity, recommend, type Complexity } from '../src/lib/recommend'

test('classifyComplexity detects simple prompts', () => {
  const simple = classifyComplexity('Translate this to Thai.')
  expect(simple.complexity).toBe('simple')
  expect(simple.expectedOutputTokens).toBe(80)
  expect(simple.reasons.length).toBeGreaterThan(0)

  const rewrite = classifyComplexity('Rewrite this paragraph.')
  expect(rewrite.complexity).toBe('simple')
})

test('classifyComplexity detects complex prompts', () => {
  const complex = classifyComplexity('Design a multi-step algorithm to optimize this complex process and explain your reasoning for each step. Consider performance implications and architectural patterns.')
  expect(complex.complexity).toBe('complex')
  expect(complex.expectedOutputTokens).toBe(512)

  const coding = classifyComplexity('Write a full application that manages form state with complex multi-step logic and handles all edge cases properly.')
  expect(coding.complexity).toBe('complex')
})

test('classifyComplexity detects moderate prompts', () => {
  const moderate = classifyComplexity('Explain the key differences between these two approaches. Consider performance implications.')
  expect(moderate.complexity).toBe('moderate')
  expect(moderate.expectedOutputTokens).toBe(256)
})

test('classifyComplexity considers prompt length', () => {
  const short = classifyComplexity('hi')
  expect(short.reasons.some((r) => r.includes('Short'))).toBe(true)

  const long = classifyComplexity('a'.repeat(500))
  expect(long.reasons.some((r) => r.includes('Long'))).toBe(true)
})

test('classifyComplexity detects code-like prompts', () => {
  const withCode = classifyComplexity('Here is my code: function calculateTotal(items) { return items.reduce((a, b) => a + b.price, 0); } Help me optimize this for large datasets.')
  expect(withCode.reasons.some((r) => r.includes('coding'))).toBe(true)
})

test('classifyComplexity handles Thai text hints', () => {
  const thai = classifyComplexity('โปรแกรมเพื่อวิเคราะห์ข้อมูลการสำรวจจำนวนมากที่มีความซับซ้อนและต้องการระบุรูปแบบอย่างลึกซึ้งเพิ่มเติม')
  expect(thai.complexity).toBe('complex')
})

test('recommend suggests right model for simple prompts', () => {
  const rec = recommend('Translate this sentence.', 'llama3-70b-8192')
  expect(rec.complexity).toBe('simple')
  expect(rec.suggested.tier).toBe('small')
  expect(rec.direction).toBe('downsize')
  expect(rec.mismatch).toBe(true)
})

test('recommend suggests right model for complex prompts', () => {
  const rec = recommend('Design and architect a distributed system with multi-step reasoning and optimization patterns.', 'llama3-8b-8192')
  expect(rec.complexity).toBe('complex')
  expect(rec.suggested.tier).toBe('large')
  expect(rec.direction).toBe('upsize')
  expect(rec.mismatch).toBe(true)
})

test('recommend detects no mismatch when model is appropriate', () => {
  const rec = recommend('Explain the key concepts of machine learning with examples. How do they compare with traditional approaches?', 'mixtral-8x7b-32768')
  expect(rec.complexity).toBe('moderate')
  expect(rec.suggested.tier).toBe('medium')
  expect(rec.direction).toBe('ok')
  expect(rec.mismatch).toBe(false)
})

test('recommend with complexity override changes recommendation', () => {
  const override = recommend('Simple task', 'llama3-8b-8192', 'complex')
  expect(override.detectedComplexity).toBe('simple')
  expect(override.selectedComplexity).toBe('complex')
  expect(override.reasons).toContain('Manual override: treating this as complex')
  expect(override.suggested.tier).toBe('large')
})

test('recommend provides carbon estimates for comparison', () => {
  const rec = recommend('Test prompt', 'llama3-8b-8192')
  expect(rec.currentEstimate.carbonG).toBeGreaterThan(0)
  expect(rec.suggestedEstimate.carbonG).toBeGreaterThan(0)
  expect(rec.currentEstimate.totalTokens).toBe(rec.suggestedEstimate.totalTokens)
})

test('recommend handles medium to large downsizing', () => {
  const rec = recommend('Short task', 'llama3-70b-8192')
  expect(rec.complexity).toBe('simple')
  expect(rec.direction).toBe('downsize')
})

test('recommend detects batching from prompt hints', () => {
  const batched = classifyComplexity('First: translate this. Second: format it nicely.')
  expect(batched.reasons.length).toBeGreaterThan(0)
})
