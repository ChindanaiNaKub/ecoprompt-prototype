import { getModel, type ModelId } from './models'

/** Thailand / SE Asia grid intensity estimate (gCO₂e / Wh) — labeled as approximation */
export const GRID_INTENSITY_G_PER_WH = 0.48

/** Rough phone-charge equivalence: ~12 Wh per full charge */
export const PHONE_CHARGE_WH = 12

export interface Estimate {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  energyWh: number
  carbonG: number
  phoneCharges: number
  /** Human-readable equivalence */
  equivalence: string
}

/** Naive tokenizer: ~4 chars per token for English/code mix */
export function estimateTokensFromText(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return Math.max(1, Math.ceil(trimmed.length / 4))
}

/**
 * Carbon (gCO₂e) = Energy per prompt (Wh) × Grid Carbon Intensity (gCO₂e/Wh)
 * Energy ≈ (total tokens / 1000) × model Wh-per-1k
 * Output tokens estimated from task complexity heuristic (passed in).
 */
export function estimateRequest(
  prompt: string,
  modelId: ModelId,
  expectedOutputTokens: number,
): Estimate {
  const model = getModel(modelId)
  const inputTokens = estimateTokensFromText(prompt)
  const outputTokens = Math.max(1, Math.round(expectedOutputTokens))
  const totalTokens = inputTokens + outputTokens
  const energyWh = (totalTokens / 1000) * model.energyWhPer1kTokens
  const carbonG = energyWh * GRID_INTENSITY_G_PER_WH
  const phoneCharges = energyWh / PHONE_CHARGE_WH

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    energyWh,
    carbonG,
    phoneCharges,
    equivalence: formatEquivalence(carbonG, phoneCharges),
  }
}

function formatEquivalence(carbonG: number, phoneCharges: number): string {
  if (phoneCharges >= 0.05) {
    const n = phoneCharges < 1 ? phoneCharges.toFixed(2) : phoneCharges.toFixed(1)
    return `≈ charging a phone ${n}×`
  }
  if (carbonG >= 0.01) {
    return `≈ ${carbonG.toFixed(3)} gCO₂e (estimate)`
  }
  return `≈ ${carbonG.toFixed(4)} gCO₂e (estimate)`
}

export function formatCarbon(g: number): string {
  if (g >= 1) return `${g.toFixed(2)} gCO₂e`
  if (g >= 0.01) return `${g.toFixed(3)} gCO₂e`
  return `${g.toFixed(4)} gCO₂e`
}

export function formatTokens(n: number): string {
  return n.toLocaleString()
}

export function percentSaved(from: number, to: number): number {
  if (from <= 0) return 0
  return Math.round(((from - to) / from) * 100)
}
