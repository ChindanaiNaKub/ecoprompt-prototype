import { getModel, type ModelId } from './models'

export const GRID_INTENSITY_G_PER_WH = 0.475

export const METHODOLOGY_VERSION = '2026-09-sensitivity-v1'

export interface CarbonRange {
  lowG: number
  centralG: number
  highG: number
}

export interface Estimate {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  energyWh: number
  carbonG: number
  carbonRange: CarbonRange
  methodologyVersion: string
}

export function estimateTokensFromText(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return Math.max(1, Math.ceil(trimmed.length / 4))
}

export function estimateRequest(
  prompt: string,
  modelId: ModelId,
  expectedOutputTokens: number,
): Estimate {
  const model = getModel(modelId)
  const inputTokens = estimateTokensFromText(prompt)
  const outputTokens = Math.max(1, Math.round(expectedOutputTokens))
  const totalTokens = inputTokens + outputTokens
  
  const [lowWhPer1kTokens, centralWhPer1kTokens, highWhPer1kTokens] =
    model.energyWhRangePer1kTokens
    
  const energyWh = (totalTokens / 1000) * centralWhPer1kTokens
  const carbonG = energyWh * GRID_INTENSITY_G_PER_WH
  
  const carbonRange = {
    lowG: (totalTokens / 1000) * lowWhPer1kTokens * GRID_INTENSITY_G_PER_WH,
    centralG: carbonG,
    highG: (totalTokens / 1000) * highWhPer1kTokens * GRID_INTENSITY_G_PER_WH,
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    energyWh,
    carbonG,
    carbonRange,
    methodologyVersion: METHODOLOGY_VERSION,
  }
}

export function formatCarbon(g: number): string {
  if (g >= 1) return `~${g.toFixed(2)} gCO₂e`
  if (g >= 0.01) return `~${g.toFixed(3)} gCO₂e`
  return `~${g.toFixed(4)} gCO₂e`
}

export function formatCarbonRange(range: CarbonRange): string {
  return `~${range.lowG.toFixed(3)} – ${range.highG.toFixed(3)} gCO₂e`
}

export function formatTokens(n: number, isEstimate: boolean = false): string {
  const formatted = n.toLocaleString()
  return isEstimate ? `~${formatted}` : formatted
}

export function percentSaved(from: number, to: number): number {
  if (from <= 0) return 0
  return Math.round(((from - to) / from) * 100)
}