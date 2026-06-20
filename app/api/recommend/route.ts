import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { runEngines } from '@/lib/engines'
import { StartupInput, EquityIQResult } from '@/lib/types'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(req: NextRequest) {
  const input: StartupInput = await req.json()
  const calc = runEngines(input)

  const prompt = `You are EquityIQ, an AI decision engine for startup fundraising. A founder has submitted their startup data and the financial engines have already run all calculations. Your job is to interpret the numbers and give a direct, actionable recommendation. Be specific — reference the actual numbers.

STARTUP: ${input.name} (${input.stage}, ${input.industry}, ${input.location})

FINANCIALS:
- ARR: $${input.arr.toLocaleString()} | MRR: $${input.mrr.toLocaleString()}
- Growth rate: ${input.growthRate}% MoM | Burn: $${input.burnRate.toLocaleString()}/mo
- Runway: ${input.runway} months | Customers: ${input.customerCount}
- Pipeline: $${input.pipelineValue.toLocaleString()}

DEAL TERMS:
- Seeking: $${input.capitalRequired.toLocaleString()} at $${input.valuation.toLocaleString()} pre-money
- Investor offer: $${input.investorOffer.toLocaleString()} for ${input.equityRequested}% equity

CAP TABLE (current):
- Founders: ${input.founderPct}% + ${input.coFounderPct}% | ESOP: ${input.employeePoolPct}% | Existing investors: ${input.existingInvestorPct}%

ENGINE RESULTS:
- Raise Readiness Score: ${calc.raiseReadinessScore}/100
- Offer Quality Score: ${calc.offerQualityScore}/100
- Recommended timing: ${calc.recommendedTiming}
- Founder ownership after all modelled rounds: ${(calc.dilutionForecast[calc.dilutionForecast.length - 1].founderPct + calc.dilutionForecast[calc.dilutionForecast.length - 1].coFounderPct).toFixed(1)}%
- Founder value preserved vs today: ${calc.founderValuePreserved.toFixed(1)}%
- Warning flags: ${calc.flags.length > 0 ? calc.flags.join('; ') : 'none'}

Give a 3-paragraph recommendation covering: (1) whether to raise now or wait and why, (2) whether the offer terms are fair and what to negotiate, (3) what the founder should focus on in the next 90 days to maximise their position. Be direct. No hedging. Reference specific numbers.`

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 600,
  })

  const aiRecommendation = completion.choices[0]?.message?.content || 'Unable to generate recommendation.'

  const result: EquityIQResult = { ...calc, aiRecommendation }
  return NextResponse.json(result)
}
