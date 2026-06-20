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

  // Gross margin / Rule of 40 (bonus up to +10, penalty -10)
  if (input.grossMargin > 0) {
    const rule40 = input.growthRate * 12 + input.grossMargin - 100 // annualised growth + margin - cost base
    if (rule40 >= 40) { score += 10 }
    else if (rule40 >= 20) { score += 5 }
    else if (rule40 < 0) { score -= 10; flags.push('Rule of 40 is negative — growth + margins are poor') }
    if (input.grossMargin < 50 && input.industry === 'SaaS') { flags.push('Gross margin below 50% is low for SaaS') }
  }

  // Churn rate (penalty only)
  if (input.churnRate > 0) {
    if (input.churnRate > 10) { score -= 10; flags.push(`Monthly churn of ${input.churnRate}% is high — investors will discount MRR`) }
    else if (input.churnRate > 5) { score -= 5; flags.push('Monthly churn above 5% — retention needs improvement') }
  }

  // LTV:CAC ratio (bonus up to +5)
  if (input.cac > 0 && input.churnRate > 0 && input.customerCount > 0) {
    const arpu = input.arr / input.customerCount
    const ltv = arpu / (input.churnRate / 100)
    const ltvCac = ltv / input.cac
    if (ltvCac >= 3) { score += 5 }
    else if (ltvCac < 1) { score -= 5; flags.push('LTV:CAC below 1x — acquiring customers costs more than they are worth') }
  }

  return { score: Math.min(100, Math.max(0, score)), flags }
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

  // High gross margin boosts offer quality (+5 for SaaS-like margins)
  if (input.grossMargin >= 70) { score += 5 }
  else if (input.grossMargin > 0 && input.grossMargin < 40) {
    score -= 10
    flags.push(`Gross margin of ${input.grossMargin}% is low — investors will demand a lower valuation`)
  }

  // High churn is a red flag for offer quality
  if (input.churnRate > 5) {
    score -= 10
    flags.push('High churn undermines the ARR multiple justification')
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

// ── 6. Term Sheet Negotiation Simulator ──────────────────────────────────────
export interface NegotiationScenario {
  title: string
  ask: string
  equityDelta: number      // percentage points founder keeps extra
  valueAt50M: number       // extra $ founder gets at $50M exit
  valueAt100M: number
  difficulty: 'Easy' | 'Medium' | 'Hard'
  priority: number         // 1 = highest
}

export function calcNegotiationScenarios(input: StartupInput): NegotiationScenario[] {
  const finalDilution = simulateDilution(input)
  const finalFounderPct = finalDilution[finalDilution.length - 1].founderPct + finalDilution[finalDilution.length - 1].coFounderPct

  const scenarios: NegotiationScenario[] = []

  // Scenario 1: Push valuation up 20%
  if (input.valuation > 0 && input.equityRequested > 0) {
    const newVal = input.valuation * 1.2
    const newEq = (input.capitalRequired / (newVal + input.capitalRequired)) * 100
    const eqDelta = input.equityRequested - newEq
    const afterDilution = simulateDilution(input, newVal, newEq)
    const newFounderPct = afterDilution[afterDilution.length - 1].founderPct + afterDilution[afterDilution.length - 1].coFounderPct
    const delta = newFounderPct - finalFounderPct
    scenarios.push({
      title: 'Negotiate valuation up 20%',
      ask: `Push pre-money from $${(input.valuation / 1_000_000).toFixed(1)}M to $${(newVal / 1_000_000).toFixed(1)}M`,
      equityDelta: delta,
      valueAt50M: (delta / 100) * 50_000_000,
      valueAt100M: (delta / 100) * 100_000_000,
      difficulty: 'Medium',
      priority: 0,
    })
  }

  // Scenario 2: Reduce equity 3%
  if (input.equityRequested > 3) {
    const newEq = input.equityRequested - 3
    const afterDilution = simulateDilution(input, input.valuation, newEq)
    const newFounderPct = afterDilution[afterDilution.length - 1].founderPct + afterDilution[afterDilution.length - 1].coFounderPct
    const delta = newFounderPct - finalFounderPct
    scenarios.push({
      title: 'Reduce equity by 3%',
      ask: `Drop from ${input.equityRequested}% to ${newEq}% — common at this stage`,
      equityDelta: delta,
      valueAt50M: (delta / 100) * 50_000_000,
      valueAt100M: (delta / 100) * 100_000_000,
      difficulty: 'Easy',
      priority: 0,
    })
  }

  // Scenario 3: Reduce equity 5%
  if (input.equityRequested > 5) {
    const newEq = input.equityRequested - 5
    const afterDilution = simulateDilution(input, input.valuation, newEq)
    const newFounderPct = afterDilution[afterDilution.length - 1].founderPct + afterDilution[afterDilution.length - 1].coFounderPct
    const delta = newFounderPct - finalFounderPct
    scenarios.push({
      title: 'Reduce equity by 5%',
      ask: `Firm at ${newEq}% — requires strong justification`,
      equityDelta: delta,
      valueAt50M: (delta / 100) * 50_000_000,
      valueAt100M: (delta / 100) * 100_000_000,
      difficulty: 'Hard',
      priority: 0,
    })
  }

  // Scenario 4: Waive pro-rata (keep 2% extra in future rounds)
  const proRataDelta = 2
  scenarios.push({
    title: 'Remove investor pro-rata rights',
    ask: 'No automatic right to follow-on — preserves ~2% in future rounds',
    equityDelta: proRataDelta,
    valueAt50M: (proRataDelta / 100) * 50_000_000,
    valueAt100M: (proRataDelta / 100) * 100_000_000,
    difficulty: 'Hard',
    priority: 0,
  })

  // Rank by value at $50M exit
  scenarios.sort((a, b) => b.valueAt50M - a.valueAt50M)
  return scenarios.map((s, i) => ({ ...s, priority: i + 1 }))
}

// ── 7. Runway Extension Planner ───────────────────────────────────────────────
export interface RunwayScenario {
  label: string
  description: string
  newRunway: number
  extensionMonths: number
  newReadinessScore: number
  burnChange: number   // % change in burn
  mrrChange: number    // % change in MRR
}

export function calcRunwayScenarios(input: StartupInput): RunwayScenario[] {
  const cash = input.burnRate * input.runway
  const baseScore = calcReadinessScore(input).score

  function runway(burn: number, mrr: number): number {
    const effectiveBurn = Math.max(burn - mrr, 0)
    return effectiveBurn > 0 ? cash / effectiveBurn : 99
  }

  function readiness(burn: number, mrr: number, growthRate: number): number {
    return calcReadinessScore({ ...input, burnRate: burn, mrr, arr: mrr * 12, growthRate,
      runway: Math.min(runway(burn, mrr), 36) }).score
  }

  const scenarios: RunwayScenario[] = [
    {
      label: 'Cut burn 20%',
      description: 'Reduce non-essential spend, defer hires, renegotiate SaaS tools',
      newRunway: runway(input.burnRate * 0.8, input.mrr),
      extensionMonths: runway(input.burnRate * 0.8, input.mrr) - input.runway,
      newReadinessScore: readiness(input.burnRate * 0.8, input.mrr, input.growthRate),
      burnChange: -20,
      mrrChange: 0,
    },
    {
      label: 'Grow MRR 15%/mo for 3 months',
      description: 'Close pipeline, activate trials, upsell existing customers',
      newRunway: runway(input.burnRate, input.mrr * Math.pow(1.15, 3)),
      extensionMonths: runway(input.burnRate, input.mrr * Math.pow(1.15, 3)) - input.runway,
      newReadinessScore: readiness(input.burnRate, input.mrr * Math.pow(1.15, 3), 15),
      burnChange: 0,
      mrrChange: 15,
    },
    {
      label: 'Cut burn 20% + Grow MRR 15%',
      description: 'Combined efficiency + growth — strongest fundraising position',
      newRunway: runway(input.burnRate * 0.8, input.mrr * Math.pow(1.15, 3)),
      extensionMonths: runway(input.burnRate * 0.8, input.mrr * Math.pow(1.15, 3)) - input.runway,
      newReadinessScore: readiness(input.burnRate * 0.8, input.mrr * Math.pow(1.15, 3), 15),
      burnChange: -20,
      mrrChange: 15,
    },
  ]

  return scenarios.map(s => ({
    ...s,
    newRunway: Math.min(Math.round(s.newRunway), 36),
    extensionMonths: Math.round(s.extensionMonths * 10) / 10,
    scoreDelta: s.newReadinessScore - baseScore,
  } as RunwayScenario))
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
