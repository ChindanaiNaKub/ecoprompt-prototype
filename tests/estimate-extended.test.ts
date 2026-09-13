import { expect, test } from 'bun:test'
import {
  estimateTokensFromText,
  formatCarbon,
  formatCarbonRange,
  formatTokens,
  percentSaved,
  type CarbonRange,
} from '../src/lib/estimate'

test('estimateTokensFromText handles edge cases', () => {
  expect(estimateTokensFromText('')).toBe(0)
  expect(estimateTokensFromText('   ')).toBe(0)
  expect(estimateTokensFromText('a')).toBe(1)
  expect(estimateTokensFromText('ab')).toBe(1)
  expect(estimateTokensFromText('abcd')).toBe(1)
  expect(estimateTokensFromText('abcde')).toBe(2)
  expect(estimateTokensFromText('   hello world   ')).toBe(3)
})

test('formatCarbon formats different carbon amounts correctly', () => {
  expect(formatCarbon(5)).toContain('5.00')
  expect(formatCarbon(0.5)).toContain('0.500')
  expect(formatCarbon(0.005)).toContain('0.0050')
  expect(formatCarbon(0.0001)).toContain('0.0001')
  expect(formatCarbon(0)).toContain('0.0000')
})

test('formatCarbonRange shows low and high values', () => {
  const range: CarbonRange = {
    lowG: 1.234,
    centralG: 2.0,
    highG: 3.456,
  }
  const formatted = formatCarbonRange(range)
  expect(formatted).toContain('1.234')
  expect(formatted).toContain('3.456')
  expect(formatted).toContain('–')
})

test('formatTokens with and without estimate flag', () => {
  expect(formatTokens(1000, false)).toBe('1,000')
  expect(formatTokens(1000, true)).toContain('~')
  expect(formatTokens(1000000, false)).toContain('1,000,000')
  expect(formatTokens(1, false)).toBe('1')
  expect(formatTokens(0, false)).toBe('0')
})

test('percentSaved calculates savings correctly', () => {
  expect(percentSaved(100, 50)).toBe(50)
  expect(percentSaved(100, 0)).toBe(100)
  expect(percentSaved(100, 100)).toBe(0)
  expect(percentSaved(1000, 500)).toBe(50)
  expect(percentSaved(0, 50)).toBe(0)
  expect(percentSaved(-10, 5)).toBe(0)
})
