import { expect, test } from 'bun:test'
import { PRODUCTION_AUTH_CALLBACK_URL, resolveAuthCallbackUrl } from '../src/lib/auth-callback'

test('uses fixed production callback URL for deployed host', () => {
  const callback = resolveAuthCallbackUrl(
    { origin: 'https://chindanainakub.github.io', hostname: 'chindanainakub.github.io' },
    '/ecoprompt-prototype/',
  )

  expect(callback).toBe(PRODUCTION_AUTH_CALLBACK_URL)
})

test('uses localhost origin for local development', () => {
  const callback = resolveAuthCallbackUrl(
    { origin: 'http://localhost:5173', hostname: 'localhost' },
    '/',
  )

  expect(callback).toBe('http://localhost:5173/')
})

test('preserves configured local base path when provided', () => {
  const callback = resolveAuthCallbackUrl(
    { origin: 'http://127.0.0.1:5173', hostname: '127.0.0.1' },
    '/ecoprompt-prototype/',
  )

  expect(callback).toBe('http://127.0.0.1:5173/ecoprompt-prototype/')
})
