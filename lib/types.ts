export interface StartupInput {
  // Company info
  name: string
  industry: string
  stage: 'pre-seed' | 'seed' | 'series-a' | 'series-b'
  location: string

  // Financials
  arr: number        // Annual Recurring Revenue ($)
  mrr: number        // Monthly Recurring Revenue ($)
  growthRate: number // Monthly growth rate (%)
  burnRate: number   // Monthly burn ($)
  runway: number     // Months of runway
  customerCount: number
  pipelineValue: number
  grossMargin: number    // Gross margin (%)
  churnRate: number      // Monthly churn (%)
  cac: number            // Customer Acquisition Cost ($)
  teamSize: number       // Number of full-time employees
  totalRaised: number    // Total funding raised to date ($)
  businessModel: string  // B2B / B2C / Marketplace / B2B2C

  // Deal terms
  capitalRequired: number  // $ seeking
  valuation: number        // Pre-money valuation ($)
  investorOffer: number    // $ investor is offering
  equityRequested: number  // % investor wants

  // Cap table
  founderPct: number
  coFounderPct: number
  employeePoolPct: number
  existingInvestorPct: number
}

export interface DilutionRound {
  round: string
  preMoneyValuation: number
  investment: number
  newInvestorPct: number
  founderPct: number
  coFounderPct: number
  employeePoolPct: number
  existingInvestorPct: number
  postMoneyValuation: number
}

export interface EquityIQResult {
  raiseReadinessScore: number       // 0–100
  offerQualityScore: number         // 0–100
  dilutionForecast: DilutionRound[]
  ownershipForecast: { round: string; founderTotal: number }[]
  founderValuePreserved: number     // % of exit value retained by founders
  recommendedTiming: 'raise-now' | 'raise-later' | 'bootstrap'
  raiseNowScenario: DilutionRound[]
  raiseLaterScenario: DilutionRound[]
  exitValues: { exit: number; founderValue: number; coFounderValue: number }[]
  aiRecommendation: string
  flags: string[]  // warning flags
}
