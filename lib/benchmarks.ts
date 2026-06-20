export interface Benchmark {
  arr: number          // median ARR in USD
  growthRate: number   // median MoM growth %
  grossMargin: number  // median gross margin %
  churnRate: number    // median monthly churn %
  burnRate: number     // median monthly burn USD
  runway: number       // median months
  arrMultiple: number  // median valuation / ARR multiple
  ltvCac: number       // median LTV:CAC ratio
}

export const BENCHMARK_LABELS: Record<keyof Benchmark, string> = {
  arr: 'Annual Recurring Revenue',
  growthRate: 'Monthly Growth Rate',
  grossMargin: 'Gross Margin',
  churnRate: 'Monthly Churn',
  burnRate: 'Monthly Burn',
  runway: 'Runway',
  arrMultiple: 'ARR Multiple (Valuation)',
  ltvCac: 'LTV:CAC Ratio',
}

const STAGE_BENCHMARKS: Record<string, Benchmark> = {
  'pre-seed': {
    arr: 50000,
    growthRate: 8,
    grossMargin: 60,
    churnRate: 6,
    burnRate: 30000,
    runway: 12,
    arrMultiple: 0,
    ltvCac: 1.5,
  },
  'seed': {
    arr: 500000,
    growthRate: 15,
    grossMargin: 68,
    churnRate: 4,
    burnRate: 100000,
    runway: 18,
    arrMultiple: 20,
    ltvCac: 2.5,
  },
  'series-a': {
    arr: 3000000,
    growthRate: 12,
    grossMargin: 72,
    churnRate: 3,
    burnRate: 350000,
    runway: 20,
    arrMultiple: 15,
    ltvCac: 3,
  },
  'series-b': {
    arr: 12000000,
    growthRate: 8,
    grossMargin: 75,
    churnRate: 2,
    burnRate: 900000,
    runway: 22,
    arrMultiple: 10,
    ltvCac: 4,
  },
}

interface IndustryAdjustment {
  grossMargin?: number
  churnRate?: number
  burnRate?: number
  growthRate?: number
  arrMultiple?: number
}

const INDUSTRY_ADJUSTMENTS: Record<string, IndustryAdjustment> = {
  SaaS:       { grossMargin: 1.1,  churnRate: 0.8,              arrMultiple: 1.2 },
  FinTech:    { grossMargin: 0.85,              burnRate: 1.2,  arrMultiple: 0.9 },
  HealthTech: { grossMargin: 0.9,               burnRate: 1.3,  growthRate: 0.85, arrMultiple: 0.8 },
  DeepTech:   { grossMargin: 0.75,              burnRate: 1.5,  growthRate: 0.7,  arrMultiple: 0.7 },
  'E-commerce': { grossMargin: 0.45, churnRate: 1.5, burnRate: 1.1, arrMultiple: 0.5 },
  EdTech:     { grossMargin: 0.9,  churnRate: 1.2,              arrMultiple: 0.85 },
  CleanTech:  { grossMargin: 0.8,               burnRate: 1.4,  growthRate: 0.75, arrMultiple: 0.75 },
  Other:      {},
}

export function getBenchmark(stage: string, industry: string): Benchmark {
  const base = STAGE_BENCHMARKS[stage] ?? STAGE_BENCHMARKS['seed']
  const adj = INDUSTRY_ADJUSTMENTS[industry] ?? {}

  return {
    arr:         Math.round(base.arr),
    growthRate:  Math.round(base.growthRate  * (adj.growthRate  ?? 1)),
    grossMargin: Math.round(base.grossMargin * (adj.grossMargin ?? 1)),
    churnRate:   Math.round(base.churnRate   * (adj.churnRate   ?? 1)),
    burnRate:    Math.round(base.burnRate    * (adj.burnRate    ?? 1)),
    runway:      Math.round(base.runway),
    arrMultiple: Math.round(base.arrMultiple * (adj.arrMultiple ?? 1)),
    ltvCac:      base.ltvCac,
  }
}
