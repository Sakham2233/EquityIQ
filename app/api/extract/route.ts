import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { extractText } from 'unpdf'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const { text } = await extractText(new Uint8Array(buffer), { mergePages: true })

    if (!text || text.trim().length < 20) {
      return NextResponse.json(
        { error: 'Could not read text from this PDF. Make sure it is a text-based PDF, not a scanned image.' },
        { status: 422 }
      )
    }

    const prompt = `You are a startup data extractor. Read the following pitch deck or document text and extract structured startup information. Return ONLY a valid JSON object with no markdown or explanation. If a value is not found, use 0 for numbers and "" for strings.

Fields to extract:
- name: company name (string)
- industry: one of SaaS, FinTech, HealthTech, DeepTech, E-commerce, EdTech, CleanTech, Other
- stage: one of pre-seed, seed, series-a, series-b
- location: city or country (string)
- arr: annual recurring revenue in USD (number)
- mrr: monthly recurring revenue in USD (number)
- growthRate: monthly growth rate as a number e.g. 15 for 15% (number)
- burnRate: monthly burn rate in USD (number)
- runway: months of runway remaining (number)
- customerCount: number of customers (number)
- pipelineValue: pipeline value in USD (number)
- capitalRequired: amount being raised in USD (number)
- valuation: pre-money valuation in USD (number)
- investorOffer: investor offer amount in USD (number)
- equityRequested: equity percentage as a number e.g. 20 for 20% (number)
- founderPct: founder ownership percentage (number)
- coFounderPct: co-founder ownership percentage (number)
- employeePoolPct: employee option pool percentage (number)
- existingInvestorPct: existing investor ownership percentage (number)

Document text:
${text.slice(0, 14000)}`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 700,
      temperature: 0,
    })

    const raw = completion.choices[0]?.message?.content?.trim() || '{}'
    let parsed: Record<string, unknown>
    try {
      const clean = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
      parsed = JSON.parse(clean)
    } catch {
      const match = raw.match(/\{[\s\S]*\}/)
      parsed = match ? JSON.parse(match[0]) : {}
    }

    return NextResponse.json(parsed)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Extraction failed'
    console.error('[extract] error:', message, err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
