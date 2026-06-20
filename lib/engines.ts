import { StartupInput, DilutionRound, EquityIQResult } from './types'

// ── 1. Fundraising Readiness Engine ──────────────────────────────────────────
export function calcReadinessScore(input: StartupInput): { score: number; flags: string[] } {
  let score = 0
  const flags: string[] = []

  // Runway (30 pts)
  if (input.runway >= 18) { score += 30 }
  else if (input.runway >= 12) { score += 20 }
  else if (input.runway >= 6) { score += 10; flags.push('Runway below 12 months — raising from weakness') }
  else { score += 0; flags.push('Critical: less than 6 months runway') }

  // Growth rate (25 pts)
  if (input.growthRate >= 20) { score += 25 }
  else if (input.growthRate >= 10) { score += 18 }
  else if (input.growthRate >= 5) { score += 10 }
  else { score += 3; flags.push('Growth rate below 5% MoM — investors will question traction') }

  // ARR vs burn (20 pts)
  const burnCoverage = input.arr > 0 ? (input.arr / 12) / input.burnRate : 0
  if (burnCoverage >= 1) { score += 20 }
  else if (burnCoverage >= 0.5) { score += 12 }
  else { score += 4; flags.push('ARR covers less than 50% of monthly burn') }

  // Stage appropriateness for capital ask (15 pts)
  const stageValuationBenchmarks: Record<string, [number, number]> = {
    'pre-seed': [500_000, 3_000_000],
    'seed': [2_000_000, 15_000_000],
    'series-a': [10_000_000, 50_000_000],
    'series-b': [30_000_000, 150_000_000],
  }
  const [min, max] = stageValuationBenchmarks[input.stage]
  if (input.valuation >= min && input.valuation <= max) { score += 15 }
  else if (input.valuation < min) { score += 8; flags.push('Valuation appears low for stage') }
  else { score += 5; flags.push('Valuation may be hard to justify for stage') }

  // Customer traction (10 pts)
  const stageCustomerMin: Record<string, number> = { 'pre-seed': 0, 'seed': 5, 'series-a': 25, 'series-b': 100 }
  if (input.customerCount >= stageCustomerMin[input.stage]) { score += 10 }
  else { score += 4; flags.push('Customer count below typical for stage') }

  return { score: Math.min(100, score), flags }
}

// ── 2. Equity Dilution Simulator ─────────────────────────────────────────────
export function simulateDilution(
  input: StartupInput,
  overrideValuation?: number,
  overrideEquity?: number,
): DilutionRound[] {
  const rounds: DilutionRound[] = []

  // Current state (before raise)
  let founderPct = input.founderPct
  let coFounderPct = input.coFounderPct
  let employeePoolPct = input.employeePoolPct
  let existingInvestorPct = input.existingInvestorPct
  let currentValuation = overrideValuation ?? input.valuation

  // This round
  const newInvestorPct = overrideEquity ?? input.equityRequested
  const dilutionFactor = 1 - newInvestorPct / 100

  const thisRound: DilutionRound = {
    round: input.stage === 'pre-seed' ? 'Pre-Seed' : input.stage === 'seed' ? 'Seed' : input.stage === 'series-a' ? 'Series A' : 'Series B',
    preMoneyValuation: currentValuation,
    investment: overrideValuation ? (newInvestorPct / 100) * (overrideValuation + (input.investorOffer || input.capitalRequired)) : input.investorOffer || input.capitalRequired,
    newInvestorPct,
    founderPct: founderPct * dilutionFactor,
    coFounderPct: coFounderPct * dilutionFactor,
    employeePoolPct: employeePoolPct * dilutionFactor,
    existingInvestorPct: existingInvestorPct * dilutionFactor,
    postMoneyValuation: currentValuation + (input.investorOffer || input.capitalRequired),
  }
  rounds.push(thisRound)

  // Project future rounds with typical dilution
  const futureRounds = [
    { label: 'Next Round', dilution: 0.20, multiple: 3 },
    { label: 'Round After', dilution: 0.18, multiple: 4 },
  ]

  let prev = thisRound
  for (const fr of futureRounds) {
    const fd = 1 - fr.dilution
    rounds.push({
      round: fr.label,
      preMoneyValuation: prev.postMoneyValuation * fr.multiple,
      investment: prev.postMoneyValuation * fr.multiple * fr.dilution,
      newInvestorPct: fr.dilution * 100,
      founderPct: prev.founderPct * fd,
      coFounderPct: prev.coFounderPct * fd,
      employeePoolPct: prev.employeePoolPct * fd,
      existingInvestorPct: prev.existingInvestorPct * fd + fr.dilution * 100 * (1 - fd),
      postMoneyValuation: prev.postMoneyValuation * fr.multiple * (1 + fr.dilution),
    })
    prev = rounds[rounds.length - 1]
  }

  return rounds
}

// ── 3. Offer Quality Engine ───────────────────────────────────────────────────
export function calcOfferQuality(input: StartupInput): { score: number; flags: string[] } {
  let score = 100
  const flags: string[] = []

  // Typical equity ranges by stage
  const equityBenchmarks: Record<string, [number, number]> = {
    'pre-seed': [10, 25],
    'seed': [10, 25],
    'series-a': [15, 25],
    'series-b': [10, 20],
  }
  const [minEq, maxEq] = equityBenchmarks[input.stage]

  if (input.equityRequested > maxEq) {
    score -= 25
    flags.push(`Equity ask of ${input.equityRequested}% is above typical ${maxEq}% for ${input.stage}`)
  } else if (input.equityRequested < minEq) {
    score += 5 // favorable for founder
  }

  // Valuation vs ARR multiple benchmarks
  const arrMultiples: Record<string, [number, number]> = {
    'pre-seed': [5, 30],
    'seed': [10, 40],
    'series-a': [8, 25],
    'series-b': [5, 15],
  }
  const [minMul, maxMul] = arrMultiples[input.stage]
  const arrMultiple = input.arr > 0 ? input.valuation / input.arr : 0

  if (arrMultiple < minMul && input.arr > 0) {
    score -= 20
    flags.push(`Valuation implies ${arrMultiple.toFixed(1)}x ARR — below ${minMul}x typical floor for ${input.stage}`)
  } else if (arrMultiple > maxMul && input.arr > 0) {
    score -= 10
    flags.push(`High valuation at ${arrMultiple.toFixed(1)}x ARR may be hard to defend`)
  }

  // Capital efficiency: does ask match stage norms?
  const capitalBenchmarks: Record<string, [number, number]> = {
    'pre-seed': [100_000, 1_000_000],
    'seed': [500_000, 5_000_000],
    'series-a': [3_000_000, 20_000_000],
    'series-b': [10_000_000, 60_000_000],
  }
  const [minCap, maxCap] = capitalBenchmarks[input.stage]
  if (input.capitalRequired < minCap || input.capitalRequired > maxCap) {
    score -= 10
    flags.push(`Capital ask of $${(input.capitalRequired / 1_000_000).toFixed(1)}M is outside typical range for ${input.stage}`)
  }

  return { score: Math.max(0, Math.min(100, score)), flags }
}

// ── 4. Founder Value Preservation Engine ─────────────────────────────────────
export function calcFounderValuePreservation(
  input: StartupInput,
  dilutionRounds: DilutionRound[],
): { founderValuePreserved: number; exitValues: EquityIQResult['exitValues'] } {
  const finalRound = dilutionRounds[dilutionRounds.length - 1]
  const finalFounderPct = (finalRound.founderPct + finalRound.coFounderPct) / 100
  const exitScenarios = [10_000_000, 50_000_000, 100_000_000, 500_000_000]

  const exitValues = exitScenarios.map((exit) => ({
    exit,
    founderValue: finalRound.founderPct / 100 * exit,
    coFounderValue: finalRound.coFounderPct / 100 * exit,
  }))

  const initialFounderPct = (input.founderPct + input.coFounderPct) / 100
  const founderValuePreserved = initialFounderPct > 0
    ? (finalFounderPct / initialFounderPct) * 100
    : 0

  return { founderValuePreserved, exitValues }
}

// ── 5. Timing Recommendation ──────────────────────────────────────────────────
export function recommendTiming(readinessScore: number, input: StartupInput): EquityIQResult['recommendedTiming'] {
  if (input.runway < 6) return 'raise-now'
  if (readinessScore >= 70 && input.growthRate >= 10) return 'raise-now'
  if (readinessScore >= 50) return 'raise-later'
  return 'bootstrap'
}

// ── Master engine ─────────────────────────────────────────────────────────────
export function runEngines(input: StartupInput): Omit<EquityIQResult, 'aiRecommendation'> {
  const { score: raiseReadinessScore, flags: readinessFlags } = calcReadinessScore(input)
  const { score: offerQualityScore, flags: offerFlags } = calcOfferQuality(input)
  const flags = [...readinessFlags, ...offerFlags]

  const dilutionForecast = simulateDilution(input)

  // Raise later = wait 6 months, assume 30% more growth → higher valuation
  const laterValuation = input.valuation * 1.4
  const laterEquity = Math.max(input.equityRequested - 3, input.equityRequested * 0.85)
  const raiseLaterScenario = simulateDilution(input, laterValuation, laterEquity)
  const raiseNowScenario = dilutionForecast

  const ownershipForecast = dilutionForecast.map((r) => ({
    round: r.round,
    founderTotal: r.founderPct + r.coFounderPct,
  }))

  const { founderValuePreserved, exitValues } = calcFounderValuePreservation(input, dilutionForecast)
  const recommendedTiming = recommendTiming(raiseReadinessScore, input)

  return {
    raiseReadinessScore,
    offerQualityScore,
    dilutionForecast,
    ownershipForecast,
    founderValuePreserved,
    recommendedTiming,
    raiseNowScenario,
    raiseLaterScenario,
    exitValues,
    flags,
  }
}
