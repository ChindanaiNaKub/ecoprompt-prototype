import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

const migration = readFileSync(new URL('../supabase/migrations/202609100003_release_completion.sql', import.meta.url), 'utf8')
const edge = readFileSync(new URL('../supabase/functions/execute-prompt/index.ts', import.meta.url), 'utf8')

test('release migration contains every request field written by the edge function RPC', () => {
  for (const field of [
    'comparison_id', 'request_mode', 'model_id', 'provider_model_id',
    'complexity_detected', 'complexity_selected', 'was_recommended',
    'input_tokens', 'output_tokens', 'total_tokens', 'modelled_carbon_low_g',
    'modelled_carbon_central_g', 'modelled_carbon_high_g', 'prompt_length',
    'prompt_text', 'prompt_storage_consented', 'context_cleared',
    'methodology_version', 'initial_model_id', 'recommended_model_id',
    'model_decision', 'study_session_id', 'switched', 'right_sized',
    'looks_batched', 'carbon_saved_g', 'tokens_saved',
    'operation_id',
  ]) expect(migration).toContain(field)
})

test('edge response exposes the LivePromptResult contract', () => {
  for (const field of ['providerModelId', 'inputTokens', 'outputTokens', 'totalTokens', 'modelledCarbon']) {
    expect(edge).toContain(field)
  }
})

test('edge function validates model, mode, complexity, and dual payloads', () => {
  expect(edge).toContain("['simple', 'moderate', 'complex'].includes(String(input.detectedComplexity))")
  expect(edge).toContain("input.mode === 'single' || input.mode === 'dual'")
  expect(edge).toContain("payload.mode === 'dual' && (!payload.comparisonModelId")
  expect(edge).toContain("!MODELS[payload.modelId]")
})
