import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { StartupInput, EquityIQResult } from '@/lib/types'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const AGENTS = [
  {
    id: 'bull',
    name: 'The Bull',
    role: 'Growth-at-all-costs VC',
    emoji: '🐂',
    color: '#059669',
    bg: 'rgba(5,150,105,0.06)',
    border: 'rgba(5,150,105,0.2)',
    persona: `You are an aggressive growth-focused VC partner. You believe speed and market capture matter more than dilution or perfect terms. You push founders to raise NOW, go bigger, and grow fast. You are optimistic about the upside and dismissive of caution. You speak in sharp, punchy sentences.`,
  },
  {
    id: 'bear',
    name: 'The Skeptic',
    role: 'Devil\'s advocate',
    emoji: '🐻',
    color: '#dc2626',
    bg: 'rgba(220,38,38,0.06)',
    border: 'rgba(220,38,38,0.2)',
    persona: `You are a contrarian analyst who always stress-tests assumptions. You look for what could go wrong, what's being ignored, and what the founder is being naïve about. You challenge valuations, question traction, and point out the worst-case scenarios. You are not negative for its own sake — you are rigorous.`,
  },
  {
    id: 'operator',
    name: 'The Operator',
    role: 'CFO / unit economics lens',
    emoji: '📊',
    color: '#b45309',
    bg: 'rgba(180,83,9,0.06)',
    border: 'rgba(180,83,9,0.2)',
    persona: `You are a seasoned CFO and operator who has scaled three companies. You care deeply about unit economics, burn efficiency, and capital allocation. You think fundraising should be earned through operational discipline. You give very specific, numbers-driven advice about what to fix before or instead of raising.`,
  },
  {
    id: 'advocate',
    name: 'The Founder Ally',
    role: 'Equity & founder-wealth focus',
    emoji: '🛡️',
    color: '#4f46e5',
    bg: 'rgba(79,70,229,0.06)',
    border: 'rgba(79,70,229,0.2)',
    persona: `You are a founder-first advisor who has founded and exited two companies. You are obsessed with protecting founder equity, negotiating fair terms, and long-term wealth preservation. You always ask "what does this mean for the founder in 7 years?" You are empathetic but direct.`,
  },
]

export async function POST(req: NextRequest) {
  const { input, calc }: { input: StartupInput; calc: Omit<EquityIQResult, 'aiRecommendation'> } = await req.json()

  const context = `
STARTUP: ${input.name} (${input.stage}, ${input.industry}, ${input.location || 'undisclosed'})
ARR: $${input.arr.toLocaleString()} | MRR: $${input.mrr.toLocaleString()} | Growth: ${input.growthRate}%/mo
Burn: $${input.burnRate.toLocaleString()}/mo | Runway: ${input.runway} months | Customers: ${input.customerCount}
Seeking: $${input.capitalRequired.toLocaleString()} at $${input.valuation.toLocaleString()} pre-money
Investor offer: $${input.investorOffer.toLocaleString()} for ${input.equityRequested}% equity
Cap table: Founders ${input.founderPct + input.coFounderPct}% | ESOP ${input.employeePoolPct}% | Existing investors ${input.existingInvestorPct}%
Readiness score: ${calc.raiseReadinessScore}/100 | Offer quality: ${calc.offerQualityScore}/100
Engine recommendation: ${calc.recommendedTiming}
Flags: ${calc.flags.length ? calc.flags.join('; ') : 'none'}
`.trim()

  const responses = await Promise.all(
    AGENTS.map(async (agent) => {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: agent.persona },
          {
            role: 'user',
            content: `${context}\n\nGive your verdict in exactly 3 parts, each a single sentence:\n1. VERDICT: Your one-sentence take on whether they should raise now or not.\n2. PRIORITY: The single most important thing they must do right now.\n3. RISK: The one risk you'd bet money they're underestimating.\n\nBe direct, specific, and use their actual numbers.`,
          },
        ],
        max_tokens: 220,
        temperature: 0.85,
      })
      const text = completion.choices[0]?.message?.content || ''
      const verdict = text.match(/VERDICT[:\s]+(.*?)(?=\n|PRIORITY|$)/i)?.[1]?.trim() || ''
      const priority = text.match(/PRIORITY[:\s]+(.*?)(?=\n|RISK|$)/i)?.[1]?.trim() || ''
      const risk = text.match(/RISK[:\s]+(.*?)(?=\n|$)/i)?.[1]?.trim() || ''
      return { id: agent.id, name: agent.name, role: agent.role, emoji: agent.emoji, color: agent.color, bg: agent.bg, border: agent.border, verdict, priority, risk }
    })
  )

  return NextResponse.json(responses)
}
