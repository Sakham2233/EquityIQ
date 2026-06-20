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

IMPORTANT: Only extract company info and financial metrics. Do NOT fill in deal terms, valuation, equity percentages, or cap table — leave those as 0. The founder will fill those in manually.

Fields to extract (company & financials only):
- name: company name (string)
- industry: one of SaaS, FinTech, HealthTech, DeepTech, E-commerce, EdTech, CleanTech, Other
- stage: one of pre-seed, seed, series-a, series-b
- location: city or country (string)
- businessModel: one of B2B, B2C, B2B2C, Marketplace, Hardware, Deep Tech (string)
- arr: annual recurring revenue in USD (number)
- mrr: monthly recurring revenue in USD (number)
- growthRate: monthly growth rate as a number e.g. 15 for 15% (number)
- burnRate: monthly burn rate in USD (number)
- runway: months of runway remaining (number)
- customerCount: number of customers (number)
- pipelineValue: pipeline value in USD (number)
- totalRaised: total funding raised to date in USD (number)
- teamSize: number of full-time employees (number)
- grossMargin: gross margin as a percentage e.g. 70 for 70% (number)
- churnRate: monthly customer churn rate as a percentage e.g. 3 for 3% (number)
- cac: customer acquisition cost in USD (number)

Do NOT extract these — return 0 for all:
- capitalRequired, valuation, investorOffer, equityRequested, founderPct, coFounderPct, employeePoolPct, existingInvestorPct

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
