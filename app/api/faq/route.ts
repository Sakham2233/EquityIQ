import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { StartupInput, EquityIQResult } from '@/lib/types'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(req: NextRequest) {
  const { input, result }: { input: StartupInput; result: EquityIQResult } = await req.json()

  const context = `
STARTUP: ${input.name} (${input.stage}, ${input.industry})
ARR: $${input.arr.toLocaleString()} | Growth: ${input.growthRate}%/mo | Burn: $${input.burnRate.toLocaleString()}/mo | Runway: ${input.runway} months
Valuation: $${input.valuation.toLocaleString()} pre-money | Equity requested: ${input.equityRequested}%
Readiness score: ${result.raiseReadinessScore}/100 | Offer quality: ${result.offerQualityScore}/100
Flags: ${result.flags.length ? result.flags.join('; ') : 'none'}
`.trim()

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a seasoned VC partner who has reviewed 500+ pitch decks. Generate the 5 toughest, most specific questions you would ask this founder in a first meeting.',
        },
        {
          role: 'user',
          content: `${context}\n\nGenerate exactly 5 questions in this JSON format. Return ONLY valid JSON, no markdown:\n[\n  { "question": "...", "answer": "..." }\n]\nEach answer should be 2-3 sentences of suggested talking points that use the actual numbers from the startup data.`,
        },
      ],
      max_tokens: 900,
      temperature: 0.7,
    })

    const raw = completion.choices[0]?.message?.content ?? ''
    const parsed = JSON.parse(raw)
    return NextResponse.json(parsed)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
