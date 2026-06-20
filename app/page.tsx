'use client'
import { useState, useEffect, useRef } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import { StartupInput, EquityIQResult } from '@/lib/types'
import { fmt$, fmtPct } from '@/lib/utils'
import { calcNegotiationScenarios, calcRunwayScenarios } from '@/lib/engines'
import { getBenchmark, BENCHMARK_LABELS, type Benchmark } from '@/lib/benchmarks'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend
} from 'recharts'

const CURRENCIES = [
  { code: 'USD', symbol: '$',   flag: '🇺🇸', name: 'US Dollar',          rate: 1      },
  { code: 'GBP', symbol: '£',   flag: '🇬🇧', name: 'British Pound',       rate: 0.79   },
  { code: 'EUR', symbol: '€',   flag: '🇪🇺', name: 'Euro',                rate: 0.92   },
  { code: 'INR', symbol: '₹',   flag: '🇮🇳', name: 'Indian Rupee',        rate: 83.5   },
  { code: 'CAD', symbol: 'C$',  flag: '🇨🇦', name: 'Canadian Dollar',     rate: 1.37   },
  { code: 'AUD', symbol: 'A$',  flag: '🇦🇺', name: 'Australian Dollar',   rate: 1.54   },
  { code: 'SGD', symbol: 'S$',  flag: '🇸🇬', name: 'Singapore Dollar',    rate: 1.34   },
  { code: 'AED', symbol: 'د.إ', flag: '🇦🇪', name: 'UAE Dirham',          rate: 3.67   },
]

const MONEY_FIELDS = ['arr', 'mrr', 'burnRate', 'pipelineValue', 'totalRaised', 'capitalRequired', 'valuation', 'investorOffer', 'cac'] as const

const STAGES: string[] = ['pre-seed', 'seed', 'series-a', 'series-b']
const INDUSTRIES = ['SaaS', 'FinTech', 'HealthTech', 'DeepTech', 'E-commerce', 'EdTech', 'CleanTech', 'Other']

const DEFAULT: StartupInput = {
  name: '', industry: 'SaaS', stage: 'seed', location: '', businessModel: 'B2B',
  arr: 0, mrr: 0, growthRate: 0, burnRate: 0, runway: 0, customerCount: 0, pipelineValue: 0,
  grossMargin: 0, churnRate: 0, cac: 0, teamSize: 0, totalRaised: 0,
  capitalRequired: 0, valuation: 0, investorOffer: 0, equityRequested: 0,
  founderPct: 0, coFounderPct: 0, employeePoolPct: 0, existingInvestorPct: 0,
}

const BUSINESS_MODELS = ['B2B', 'B2C', 'B2B2C', 'Marketplace', 'Hardware', 'Deep Tech']

const inputBase: React.CSSProperties = {
  width: '100%', background: '#fff', border: '1px solid #e2ded8',
  borderRadius: 8, padding: '10px 12px', fontSize: 14, color: '#1c1917',
  outline: 'none', fontFamily: 'inherit',
}

function FieldTooltip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false)
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: 5 }}
      onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}>
      <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#e2ded8', color: '#78716c', fontSize: 9, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'default', userSelect: 'none', lineHeight: 1 }}>i</span>
      {visible && (
        <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)', background: '#1c1917', color: '#f5f4f1', fontSize: 12, fontWeight: 400, lineHeight: 1.55, borderRadius: 9, padding: '9px 13px', width: 230, zIndex: 200, pointerEvents: 'none', boxShadow: '0 6px 20px rgba(0,0,0,0.22)', whiteSpace: 'normal' }}>
          {text}
          <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid #1c1917' }} />
        </div>
      )}
    </span>
  )
}

function Field({ label, value, onChange, type = 'text', prefix, suffix, options, span, tooltip }: {
  label: string; value: string | number; onChange: (v: string) => void
  type?: string; prefix?: string; suffix?: string; options?: string[]; span?: boolean; tooltip?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, gridColumn: span ? 'span 2' : undefined }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#78716c', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'flex', alignItems: 'center' }}>
        {label}{tooltip && <FieldTooltip text={tooltip} />}
      </label>
      {options ? (
        <select value={value} onChange={e => onChange(e.target.value)} style={{ ...inputBase, cursor: 'pointer' }}>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <div style={{ display: 'flex', border: '1px solid #e2ded8', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
          {prefix && <span style={{ padding: '10px 12px', fontSize: 14, color: '#78716c', background: '#f7f6f3', borderRight: '1px solid #e2ded8', whiteSpace: 'nowrap' }}>{prefix}</span>}
          <input type={type} value={value || ''} onChange={e => onChange(e.target.value)}
            style={{ flex: 1, border: 'none', padding: '10px 12px', fontSize: 14, color: '#1c1917', outline: 'none', background: 'transparent', fontFamily: 'inherit' }} />
          {suffix && <span style={{ padding: '10px 12px', fontSize: 14, color: '#78716c', background: '#f7f6f3', borderLeft: '1px solid #e2ded8', whiteSpace: 'nowrap' }}>{suffix}</span>}
        </div>
      )}
    </div>
  )
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2ded8', borderRadius: 16, padding: '28px 32px', ...style }}>
      {children}
    </div>
  )
}

function SectionTitle({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#4f46e5', marginBottom: 20, ...style }}>
      {children}
    </div>
  )
}

function ScoreRing({ score, label, color }: { score: number; label: string; color: string }) {
  const r = 38, circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#f0ede8" strokeWidth="7" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={`${dash} ${circ}`} strokeDashoffset={circ / 4}
          strokeLinecap="round" style={{ transition: 'stroke-dasharray 1s ease' }} />
        <text x="50" y="55" textAnchor="middle" fill="#1c1917" fontSize="22" fontWeight="800">{score}</text>
      </svg>
      <span style={{ fontSize: 12, color: '#78716c', fontWeight: 500, textAlign: 'center' }}>{label}</span>
    </div>
  )
}

function StatCard({ label, value, sub, color, bg }: { label: string; value: string; sub?: string; color?: string; bg?: string }) {
  return (
    <div style={{ background: bg || '#fff', border: '1px solid #e2ded8', borderRadius: 12, padding: '20px 24px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#78716c', marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: color || '#1c1917', letterSpacing: '-0.03em', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#a8a29e', marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

export default function Home() {
  const { data: session } = useSession()
  const [screen, setScreen] = useState<'form' | 'results' | 'compare'>('form')
  const [form, setForm] = useState<StartupInput>(DEFAULT)
  const [result, setResult] = useState<EquityIQResult | null>(null)
  const [currency, setCurrency] = useState(CURRENCIES[0])
  const prevRateRef = useRef(CURRENCIES[0].rate)

  useEffect(() => {
    const prev = prevRateRef.current
    if (prev === currency.rate) return
    const ratio = currency.rate / prev
    setForm(f => {
      const updated = { ...f }
      for (const k of MONEY_FIELDS) (updated as unknown as Record<string, number>)[k] = Math.round((f[k] as number) * ratio)
      return updated
    })
    prevRateRef.current = currency.rate
  }, [currency])

  const [loading, setLoading] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<string | null>(null)

  // Email/password auth UI state (local-only fallback)
  const [showAuth, setShowAuth] = useState(false)
  const [authTab, setAuthTab] = useState<'signin' | 'signup'>('signin')
  const [authName, setAuthName] = useState('')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authErrors, setAuthErrors] = useState<{ name?: string; email?: string; password?: string }>({})
  const [localUser, setLocalUser] = useState<{ name: string; email: string } | null>(null)

  const user = session?.user ?? (localUser ? { name: localUser.name, email: localUser.email, image: null } : null)

  function handleAuth(e: React.FormEvent) {
    e.preventDefault()
    const errs: { name?: string; email?: string; password?: string } = {}
    if (authTab === 'signup' && !authName.trim()) errs.name = 'Full name is required.'
    if (!authEmail.trim()) errs.email = 'Email address is required.'
    else if (!authEmail.includes('@') || !authEmail.includes('.')) errs.email = 'Enter a valid email address (e.g. you@startup.com).'
    if (!authPassword) errs.password = 'Password is required.'
    else if (authPassword.length < 6) errs.password = 'Password must be at least 6 characters.'
    if (Object.keys(errs).length) { setAuthErrors(errs); return }
    setAuthErrors({})
    const name = authTab === 'signup' ? authName.trim() : authEmail.split('@')[0]
    setLocalUser({ name, email: authEmail })
    setShowAuth(false)
    setAuthEmail(''); setAuthPassword(''); setAuthName('')
  }

  async function handleFile(file: File) {
    if (!file) return
    setExtracting(true)
    setError('')
    setUploadedFile(file.name)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/extract', { method: 'POST', body: fd })
      const extracted = await res.json()
      if (!res.ok) throw new Error(extracted?.error || 'Could not extract data from file')
      // Only auto-fill factual business data — deal terms and cap table must be entered manually
      const { name, industry, stage, location, businessModel, arr, mrr, growthRate, burnRate, runway, customerCount, pipelineValue, totalRaised, teamSize, grossMargin, churnRate, cac } = extracted
      setForm(f => ({ ...f, name, industry, stage, location, businessModel: businessModel || f.businessModel, arr, mrr, growthRate, burnRate, runway, customerCount, pipelineValue, totalRaised: totalRaised || f.totalRaised, teamSize: teamSize || f.teamSize, grossMargin: grossMargin || f.grossMargin, churnRate: churnRate || f.churnRate, cac: cac || f.cac }))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Extraction failed')
      setUploadedFile(null)
    } finally {
      setExtracting(false)
    }
  }

  function removeFile() {
    setUploadedFile(null)
    setForm(DEFAULT)
    setError('')
    const input = document.getElementById('pdf-upload') as HTMLInputElement
    if (input) input.value = ''
  }

  function set(key: keyof StartupInput) {
    return (v: string) => setForm(f => ({ ...f, [key]: typeof DEFAULT[key] === 'number' ? (parseFloat(v) || 0) : v }))
  }

  async function handleSubmit() {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/recommend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (!res.ok) throw new Error(await res.text())
      setResult(await res.json())
      setScreen('results')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally { setLoading(false) }
  }

  // Restore shared result from URL on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const shared = params.get('share')
    if (shared) {
      try {
        const decoded = JSON.parse(atob(decodeURIComponent(shared)))
        setForm(decoded.form)
        setResult(decoded.result)
        setScreen('results')
      } catch { /* invalid share link */ }
    }
  }, [])

  const [copying, setCopying] = useState(false)
  const [downloading, setDownloading] = useState(false)

  type CouncilAgent = { id: string; name: string; role: string; emoji: string; color: string; bg: string; border: string; verdict: string; priority: string; risk: string }
  const [council, setCouncil] = useState<CouncilAgent[] | null>(null)
  const [councilLoading, setCouncilLoading] = useState(false)

  type FAQ = { question: string; answer: string }
  const [faqs, setFaqs] = useState<FAQ[] | null>(null)
  const [faqLoading, setFaqLoading] = useState(false)
  const [faqOpen, setFaqOpen] = useState<number | null>(null)

  async function handleFAQ() {
    if (!result) return
    setFaqLoading(true)
    try {
      const res = await fetch('/api/faq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: form, result }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setFaqs(data)
      setFaqOpen(0)
    } catch {
      // silently fail — user can retry
    } finally {
      setFaqLoading(false)
    }
  }

  async function handleDownloadPDF(targetId: string, filename: string) {
    setDownloading(true)
    try {
      const { default: html2canvas } = await import('html2canvas')
      const { jsPDF } = await import('jspdf')
      const el = document.getElementById(targetId)
      if (!el) return
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#f7f6f3' })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [canvas.width / 2, canvas.height / 2] })
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width / 2, canvas.height / 2)
      pdf.save(filename)
    } finally {
      setDownloading(false)
    }
  }

  function handleShare() {
    if (!result) return
    setCopying(true)
    const payload = btoa(JSON.stringify({ form, result }))
    const url = `${window.location.origin}${window.location.pathname}?share=${encodeURIComponent(payload)}`
    navigator.clipboard.writeText(url).finally(() => setTimeout(() => setCopying(false), 2000))
  }

  async function fetchCouncil() {
    if (!result) return
    setCouncilLoading(true)
    setCouncil(null)
    try {
      const res = await fetch('/api/council', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: form, calc: result }),
      })
      const data = await res.json()
      setCouncil(data)
    } catch { /* silent */ } finally {
      setCouncilLoading(false)
    }
  }

  const timingBadge = result ? {
    'raise-now':   { label: '⚡ Raise Now',   color: '#b45309', bg: 'rgba(180,83,9,0.08)',   border: 'rgba(180,83,9,0.25)' },
    'raise-later': { label: '⏳ Raise Later', color: '#059669', bg: 'rgba(5,150,105,0.08)', border: 'rgba(5,150,105,0.25)' },
    'bootstrap':   { label: '🌱 Bootstrap',  color: '#4f46e5', bg: 'rgba(79,70,229,0.08)', border: 'rgba(79,70,229,0.25)' },
  }[result.recommendedTiming] : null

  return (
    <div style={{ minHeight: '100vh', background: '#f7f6f3' }}>

      {/* Header */}
      <header style={{ background: '#fff', borderBottom: '1px solid #e2ded8', padding: '0 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 72, position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 28, lineHeight: 1 }}>⚖️</span>
            <span style={{ fontWeight: 900, fontSize: 24, letterSpacing: '-0.04em', color: '#1c1917', lineHeight: 1 }}>EquityIQ</span>
          </div>
          <span style={{ fontSize: 11.5, color: '#78716c', fontWeight: 500, letterSpacing: '0.01em', paddingLeft: 2 }}>Raise smarter. Dilute less.</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {result && (
            <nav style={{ display: 'flex', gap: 4 }}>
              {(['form', 'results', 'compare'] as const).map(s => (
                <button key={s} onClick={() => setScreen(s)} style={{
                  padding: '7px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  border: screen === s ? '1px solid #4f46e5' : '1px solid transparent',
                  background: screen === s ? 'rgba(79,70,229,0.07)' : 'transparent',
                  color: screen === s ? '#4f46e5' : '#78716c',
                }}>
                  {s === 'form' ? 'Input' : s === 'results' ? 'Results' : 'Scenarios'}
                </button>
              ))}
            </nav>
          )}

          <select
            value={currency.code}
            onChange={e => setCurrency(CURRENCIES.find(c => c.code === e.target.value) || CURRENCIES[0])}
            style={{ fontSize: 13, fontWeight: 600, border: '1px solid #e2ded8', borderRadius: 8, padding: '6px 10px', background: '#fff', color: '#44403c', cursor: 'pointer', outline: 'none' }}
          >
            {CURRENCIES.map(c => (
              <option key={c.code} value={c.code}>{c.flag} {c.code}</option>
            ))}
          </select>

          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'default', userSelect: 'none' }}>
                {(user.name ?? user.email ?? '?').charAt(0).toUpperCase()}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#1c1917' }}>{user.name ?? user.email}</span>
                <span style={{ fontSize: 11, color: '#a8a29e' }}>{user.email}</span>
              </div>
              <button onClick={() => { signOut(); setLocalUser(null) }} style={{ marginLeft: 4, fontSize: 12, color: '#a8a29e', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 6 }}>
                Sign out
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setAuthTab('signin'); setShowAuth(true) }} style={{ padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid #e2ded8', background: '#fff', color: '#44403c' }}>
                Sign in
              </button>
              <button onClick={() => { setAuthTab('signup'); setShowAuth(true) }} style={{ padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none', background: '#4f46e5', color: '#fff' }}>
                Sign up
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Auth Modal */}
      {showAuth && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) setShowAuth(false) }}>
          <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 420, padding: '36px 36px 32px', boxShadow: '0 24px 64px rgba(0,0,0,0.18)' }}>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 0, background: '#f7f6f3', borderRadius: 10, padding: 4, marginBottom: 28 }}>
              {(['signin', 'signup'] as const).map(t => (
                <button key={t} onClick={() => { setAuthTab(t); setAuthErrors({}) }} style={{
                  flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700,
                  background: authTab === t ? '#fff' : 'transparent',
                  color: authTab === t ? '#1c1917' : '#78716c',
                  boxShadow: authTab === t ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s',
                }}>
                  {t === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>

            {/* Google */}
            <button
              type="button"
              onClick={() => signIn('google')}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '11px 0', borderRadius: 10, border: '1px solid #e2ded8', background: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#1c1917', marginBottom: 16 }}
            >
              <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#4285F4" d="M47.5 24.6c0-1.6-.1-3.1-.4-4.6H24v8.7h13.2c-.6 3-2.3 5.5-4.9 7.2v6h7.9c4.6-4.3 7.3-10.6 7.3-17.3z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.9-6c-2.1 1.4-4.8 2.3-8 2.3-6.1 0-11.3-4.1-13.2-9.7H2.7v6.2C6.6 42.6 14.7 48 24 48z"/><path fill="#FBBC05" d="M10.8 28.8A14.8 14.8 0 0 1 10.8 19.2v-6.2H2.7A23.9 23.9 0 0 0 .1 24c0 3.9.9 7.5 2.6 10.8l8.1-6z"/><path fill="#EA4335" d="M24 9.5c3.4 0 6.5 1.2 8.9 3.5l6.7-6.7C35.9 2.4 30.4 0 24 0 14.7 0 6.6 5.4 2.7 13.2l8.1 6.2C12.7 13.6 17.9 9.5 24 9.5z"/></svg>
              Continue with Google
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1, height: 1, background: '#e2ded8' }} />
              <span style={{ fontSize: 12, color: '#a8a29e', whiteSpace: 'nowrap' }}>or continue with email</span>
              <div style={{ flex: 1, height: 1, background: '#e2ded8' }} />
            </div>

            <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {authTab === 'signup' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: authErrors.name ? '#dc2626' : '#78716c', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Full Name</label>
                  <input value={authName} onChange={e => { setAuthName(e.target.value); setAuthErrors(p => ({ ...p, name: undefined })) }} placeholder="Jane Smith"
                    style={{ ...inputBase, padding: '11px 14px', border: `1px solid ${authErrors.name ? '#fca5a5' : '#e2ded8'}`, background: authErrors.name ? '#fef2f2' : '#fff' }} />
                  {authErrors.name && <span style={{ fontSize: 12, color: '#dc2626', marginTop: 2 }}>⚠ {authErrors.name}</span>}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: authErrors.email ? '#dc2626' : '#78716c', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Email</label>
                <input type="email" value={authEmail} onChange={e => { setAuthEmail(e.target.value); setAuthErrors(p => ({ ...p, email: undefined })) }} placeholder="you@startup.com"
                  style={{ ...inputBase, padding: '11px 14px', border: `1px solid ${authErrors.email ? '#fca5a5' : '#e2ded8'}`, background: authErrors.email ? '#fef2f2' : '#fff' }} />
                {authErrors.email && <span style={{ fontSize: 12, color: '#dc2626', marginTop: 2 }}>⚠ {authErrors.email}</span>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: authErrors.password ? '#dc2626' : '#78716c', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Password</label>
                <input type="password" value={authPassword} onChange={e => { setAuthPassword(e.target.value); setAuthErrors(p => ({ ...p, password: undefined })) }} placeholder="••••••••"
                  style={{ ...inputBase, padding: '11px 14px', border: `1px solid ${authErrors.password ? '#fca5a5' : '#e2ded8'}`, background: authErrors.password ? '#fef2f2' : '#fff' }} />
                {authErrors.password && <span style={{ fontSize: 12, color: '#dc2626', marginTop: 2 }}>⚠ {authErrors.password}</span>}
              </div>
              <button type="submit" style={{ marginTop: 4, padding: '13px 0', borderRadius: 10, border: 'none', cursor: 'pointer', background: '#4f46e5', color: '#fff', fontWeight: 700, fontSize: 15 }}>
                {authTab === 'signin' ? 'Sign in →' : 'Create account →'}
              </button>
              {authTab === 'signin' && (
                <p style={{ textAlign: 'center', fontSize: 12, color: '#a8a29e', margin: 0 }}>
                  Don&apos;t have an account?{' '}
                  <span onClick={() => setAuthTab('signup')} style={{ color: '#4f46e5', cursor: 'pointer', fontWeight: 600 }}>Sign up</span>
                </p>
              )}
            </form>
          </div>
        </div>
      )}

      <main style={{ maxWidth: 880, margin: '0 auto', padding: '44px 24px 100px' }}>

        {/* ── Screen 1: Form ── */}
        {screen === 'form' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ marginBottom: 8 }}>
              <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', color: '#1c1917', marginBottom: 8 }}>Fundraising Decision Engine</h1>
              <p style={{ color: '#78716c', fontSize: 15, lineHeight: 1.6 }}>Enter your startup details. The financial engines run first — AI provides the analysis after.</p>
            </div>

            {/* PDF Upload */}
            {uploadedFile ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', border: '1px solid #e2ded8', borderRadius: 14, padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, background: 'rgba(79,70,229,0.08)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>📄</div>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#1c1917', margin: 0 }}>{uploadedFile}</p>
                    <p style={{ fontSize: 12, color: '#059669', margin: 0, marginTop: 2 }}>✓ Company & financials pre-filled — complete deal terms below</p>
                  </div>
                </div>
                <button onClick={removeFile} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  🗑 Remove
                </button>
              </div>
            ) : (
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
                style={{
                  border: `2px dashed ${dragOver ? '#4f46e5' : '#ccc9c2'}`,
                  borderRadius: 14, padding: '32px 24px', textAlign: 'center',
                  background: dragOver ? 'rgba(79,70,229,0.04)' : '#fff',
                  transition: 'all 0.15s', cursor: 'pointer',
                }}
                onClick={() => document.getElementById('pdf-upload')?.click()}
              >
                <input id="pdf-upload" type="file" accept=".pdf" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
                {extracting ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, border: '3px solid #e2ded8', borderTopColor: '#4f46e5', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    <p style={{ fontSize: 14, color: '#78716c', fontWeight: 500 }}>Reading your pitch deck…</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 32 }}>📄</div>
                    <p style={{ fontSize: 15, fontWeight: 600, color: '#1c1917', margin: 0 }}>Upload pitch deck or document</p>
                    <p style={{ fontSize: 13, color: '#a8a29e', margin: 0 }}>Drag & drop or click to browse · PDF only · AI will pre-fill the form</p>
                  </div>
                )}
              </div>
            )}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

            <Card>
              <SectionTitle>Company</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Field label="Startup Name" value={form.name} onChange={set('name')} span tooltip="The legal or trading name of your company." />
                <Field label="Industry" value={form.industry} onChange={set('industry')} options={INDUSTRIES} tooltip="The primary sector your startup operates in. Used to benchmark your metrics against industry norms." />
                <Field label="Stage" value={form.stage} onChange={set('stage')} options={STAGES} tooltip="Your current funding stage. Pre-Seed is idea/MVP, Seed is early traction, Series A is scaling, Series B is growth." />
                <Field label="Location" value={form.location} onChange={set('location')} tooltip="The city or country where your company is headquartered. Affects investor network and market context." />
                <Field label="Business Model" value={form.businessModel} onChange={set('businessModel')} options={BUSINESS_MODELS} tooltip="How your company generates revenue. B2B = sells to businesses, B2C = sells to consumers, Marketplace = connects buyers and sellers." />
                <Field label="Team Size" value={form.teamSize} onChange={set('teamSize')} type="number" suffix="people" tooltip="Total number of full-time employees currently on payroll. Used to calculate burn per employee efficiency." />
              </div>
            </Card>

            <Card>
              <SectionTitle>Financials</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Field label="Annual Recurring Revenue" value={form.arr} onChange={set('arr')} type="number" prefix={currency.symbol} tooltip="Annualised subscription or contract revenue. Excludes one-off payments. For non-SaaS, use your projected annual revenue." />
                <Field label="Monthly Recurring Revenue" value={form.mrr} onChange={set('mrr')} type="number" prefix={currency.symbol} tooltip="Predictable revenue collected each month from active subscriptions or contracts. ARR ÷ 12 for subscription businesses." />
                <Field label="Monthly Growth Rate" value={form.growthRate} onChange={set('growthRate')} type="number" suffix="%" tooltip="Month-over-month percentage increase in MRR. 10–20% MoM is considered strong at seed stage." />
                <Field label="Monthly Burn Rate" value={form.burnRate} onChange={set('burnRate')} type="number" prefix={currency.symbol} tooltip="Total cash spent per month across salaries, infrastructure, marketing, and operations." />
                <Field label="Runway" value={form.runway} onChange={set('runway')} type="number" suffix="months" tooltip="How many months of cash you have left at the current burn rate. Cash in bank ÷ monthly burn. 18+ months is ideal before raising." />
                <Field label="Customer Count" value={form.customerCount} onChange={set('customerCount')} type="number" tooltip="Total number of active paying customers today. Used to benchmark traction for your stage." />
                <Field label="Total Raised to Date" value={form.totalRaised} onChange={set('totalRaised')} type="number" prefix={currency.symbol} tooltip="All external funding received across previous rounds (grants, angels, VCs). Helps investors understand your funding history." />
                <Field label="Pipeline Value" value={form.pipelineValue} onChange={set('pipelineValue')} type="number" prefix={currency.symbol} tooltip="Estimated total value of deals currently in your sales pipeline — prospects who have not yet signed but are in active conversations." />
              </div>
            </Card>

            <Card>
              <SectionTitle>Unit Economics</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Field label="Gross Margin" value={form.grossMargin} onChange={set('grossMargin')} type="number" suffix="%" tooltip="Revenue minus direct cost of delivering your product/service, as a % of revenue. SaaS targets 70%+. Lower margins mean less capital efficiency." />
                <Field label="Monthly Churn Rate" value={form.churnRate} onChange={set('churnRate')} type="number" suffix="%" tooltip="Percentage of customers (or revenue) lost each month. Under 2% is healthy for B2B SaaS. High churn undermines the value of your ARR." />
                <Field label="Customer Acquisition Cost" value={form.cac} onChange={set('cac')} type="number" prefix={currency.symbol} tooltip="Average total cost to acquire one new paying customer — includes sales salaries, marketing spend, and commissions." />
                <Field label="Avg Revenue Per Customer" value={form.customerCount > 0 ? Math.round(form.arr / form.customerCount) : 0} onChange={() => {}} type="number" prefix={currency.symbol} tooltip="ARR divided by number of customers. Calculated automatically. Higher ARPU means faster payback on your CAC." />
              </div>
              <div style={{ marginTop: 12, padding: '10px 14px', background: '#f7f6f3', borderRadius: 8, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 12 }}>
                  <span style={{ color: '#78716c' }}>LTV:CAC  </span>
                  <span style={{ fontWeight: 700, color: form.cac > 0 && form.churnRate > 0 ? '#4f46e5' : '#a8a29e' }}>
                    {form.cac > 0 && form.churnRate > 0 ? `${((form.arr / form.customerCount || 0) / (form.churnRate / 100) / form.cac).toFixed(1)}x` : '—'}
                  </span>
                </div>
                <div style={{ fontSize: 12 }}>
                  <span style={{ color: '#78716c' }}>Rule of 40  </span>
                  <span style={{ fontWeight: 700, color: (form.growthRate * 12 + form.grossMargin - 100) >= 40 ? '#059669' : '#b45309' }}>
                    {form.growthRate > 0 || form.grossMargin > 0 ? `${Math.round(form.growthRate * 12 + form.grossMargin - 100)}` : '—'}
                  </span>
                </div>
                <div style={{ fontSize: 12 }}>
                  <span style={{ color: '#78716c' }}>Burn per employee  </span>
                  <span style={{ fontWeight: 700, color: '#1c1917' }}>
                    {form.teamSize > 0 && form.burnRate > 0 ? `${currency.symbol}${Math.round(form.burnRate / form.teamSize).toLocaleString()}` : '—'}
                  </span>
                </div>
              </div>
            </Card>

            <Card>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <SectionTitle style={{ margin: 0 }}>Deal Terms</SectionTitle>
                {uploadedFile && <span style={{ fontSize: 11, color: '#b45309', background: 'rgba(180,83,9,0.08)', border: '1px solid rgba(180,83,9,0.2)', borderRadius: 6, padding: '3px 8px', fontWeight: 600 }}>✏️ Fill in manually</span>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Field label="Capital Required" value={form.capitalRequired} onChange={set('capitalRequired')} type="number" prefix={currency.symbol} tooltip="The total amount you are looking to raise in this round. Should give you 18–24 months of runway post-close." />
                <Field label="Pre-Money Valuation" value={form.valuation} onChange={set('valuation')} type="number" prefix={currency.symbol} tooltip="Your company's agreed value before new investment is added. Post-money = pre-money + investment. This is what determines how much equity you give away." />
                <Field label="Investor Offer" value={form.investorOffer} onChange={set('investorOffer')} type="number" prefix={currency.symbol} tooltip="The actual amount the investor is willing to put in — may differ from your ask. Used to calculate their resulting ownership stake." />
                <Field label="Equity Requested" value={form.equityRequested} onChange={set('equityRequested')} type="number" suffix="%" tooltip="The ownership percentage the investor wants in exchange for their investment. Typical ranges: 10–25% at pre-seed/seed, 15–25% at Series A." />
              </div>
            </Card>

            <Card>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <SectionTitle style={{ margin: 0 }}>Current Cap Table</SectionTitle>
                {uploadedFile && <span style={{ fontSize: 11, color: '#b45309', background: 'rgba(180,83,9,0.08)', border: '1px solid rgba(180,83,9,0.2)', borderRadius: 6, padding: '3px 8px', fontWeight: 600 }}>✏️ Fill in manually</span>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Field label="Founder %" value={form.founderPct} onChange={set('founderPct')} type="number" suffix="%" tooltip="Percentage of the company owned by the primary founder before this round closes." />
                <Field label="Co-Founder %" value={form.coFounderPct} onChange={set('coFounderPct')} type="number" suffix="%" tooltip="Combined percentage owned by all co-founders. Enter 0 if there is only one founder." />
                <Field label="Employee Pool %" value={form.employeePoolPct} onChange={set('employeePoolPct')} type="number" suffix="%" tooltip="Shares reserved for the employee stock option plan (ESOP). Typically 10–20%. These vest over time and are used to attract and retain talent." />
                <Field label="Existing Investors %" value={form.existingInvestorPct} onChange={set('existingInvestorPct')} type="number" suffix="%" tooltip="Combined ownership held by all previous investors (angels, pre-seed VCs, etc.). Enter 0 if this is your first external round." />
              </div>
            </Card>

            {error && <p style={{ color: '#dc2626', fontSize: 14, padding: '12px 16px', background: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca' }}>{error}</p>}

            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={handleSubmit} disabled={loading || !form.name} style={{
                flex: 1, background: loading || !form.name ? '#e2ded8' : '#4f46e5',
                color: loading || !form.name ? '#a8a29e' : '#fff',
                border: 'none', borderRadius: 12, padding: '16px 32px',
                fontSize: 15, fontWeight: 700, cursor: loading || !form.name ? 'not-allowed' : 'pointer',
                letterSpacing: '-0.01em', transition: 'background 0.15s',
              }}>
                {loading ? 'Running engines…' : 'Run EquityIQ Analysis →'}
              </button>
              <button onClick={() => { setForm(DEFAULT); setUploadedFile(null); setError(''); const input = document.getElementById('pdf-upload') as HTMLInputElement; if (input) input.value = '' }} style={{
                padding: '16px 24px', borderRadius: 12, border: '1px solid #e2ded8',
                background: '#fff', color: '#78716c', fontSize: 15, fontWeight: 600, cursor: 'pointer',
              }}>
                Clear
              </button>
            </div>

          </div>
        )}

        {/* ── Screen 2: Results ── */}
        {screen === 'results' && result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Action bar */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={handleShare} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: '1px solid #e2ded8', background: '#fff', color: '#44403c', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {copying ? '✓ Link copied!' : '🔗 Share results'}
              </button>
              <button onClick={() => handleDownloadPDF('results-content', `${form.name}-results.pdf`)} disabled={downloading} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', background: '#4f46e5', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {downloading ? 'Generating…' : '⬇ Download PDF'}
              </button>
            </div>

            <div id="results-content">
            {/* Title row */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: '#1c1917', marginBottom: 4 }}>{form.name}</h1>
                <p style={{ color: '#78716c', fontSize: 14 }}>{form.stage} · {form.industry} · {form.location}</p>
              </div>
              {timingBadge && (
                <div style={{ padding: '8px 18px', borderRadius: 20, fontSize: 13, fontWeight: 700, border: `1px solid ${timingBadge.border}`, background: timingBadge.bg, color: timingBadge.color, whiteSpace: 'nowrap' }}>
                  {timingBadge.label}
                </div>
              )}
            </div>

            {/* Score rings */}
            <Card style={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: 24, padding: '36px 32px' }}>
              <ScoreRing score={result.raiseReadinessScore} label="Raise Readiness" color={scoreColor(result.raiseReadinessScore)} />
              <div style={{ width: 1, background: '#e2ded8', alignSelf: 'stretch' }} />
              <ScoreRing score={result.offerQualityScore} label="Offer Quality" color={scoreColor(result.offerQualityScore)} />
              <div style={{ width: 1, background: '#e2ded8', alignSelf: 'stretch' }} />
              <ScoreRing score={Math.round(result.founderValuePreserved)} label="Value Preserved %" color="#059669" />
            </Card>

            {/* Key stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <StatCard label="Founder Ownership (Final)"
                value={fmtPct(result.dilutionForecast[result.dilutionForecast.length - 1].founderPct + result.dilutionForecast[result.dilutionForecast.length - 1].coFounderPct)}
                sub="combined, after all rounds" color="#4f46e5" bg="rgba(79,70,229,0.04)" />
              <StatCard label="Post-Money Valuation"
                value={fmt$(result.dilutionForecast[0].postMoneyValuation, currency.symbol)}
                sub={`${fmtPct(result.dilutionForecast[0].newInvestorPct)} investor stake`} />
              <StatCard label={`Founder Value at ${currency.symbol}100M Exit`}
                value={fmt$(result.exitValues.find(e => e.exit === 100_000_000)?.founderValue ?? 0, currency.symbol)}
                sub="after all modelled rounds" color="#059669" bg="rgba(5,150,105,0.04)" />
            </div>

            {/* ── Industry Benchmarks ── */}
            {(() => {
              const bm = getBenchmark(form.stage, form.industry)
              type BmKey = keyof Benchmark
              const rows: { key: BmKey; yours: number | null; median: number; fmt: (n: number) => string; lowerIsBetter?: boolean }[] = [
                { key: 'arr',         yours: form.arr > 0 ? form.arr : null,               median: bm.arr,         fmt: n => fmt$(n, currency.symbol) },
                { key: 'growthRate',  yours: form.growthRate > 0 ? form.growthRate : null,  median: bm.growthRate,  fmt: n => `${n}%` },
                { key: 'grossMargin', yours: form.grossMargin > 0 ? form.grossMargin : null, median: bm.grossMargin, fmt: n => `${n}%` },
                { key: 'churnRate',   yours: form.churnRate > 0 ? form.churnRate : null,    median: bm.churnRate,   fmt: n => `${n}%`, lowerIsBetter: true },
                { key: 'burnRate',    yours: form.burnRate > 0 ? form.burnRate : null,      median: bm.burnRate,    fmt: n => fmt$(n, currency.symbol), lowerIsBetter: true },
                { key: 'runway',      yours: form.runway > 0 ? form.runway : null,          median: bm.runway,      fmt: n => `${n} mo` },
                ...(bm.arrMultiple > 0 && form.arr > 0 && form.valuation > 0
                  ? [{ key: 'arrMultiple' as BmKey, yours: Math.round(form.valuation / form.arr), median: bm.arrMultiple, fmt: (n: number) => `${n}x` }]
                  : []),
              ]
              return (
                <Card>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                    <SectionTitle style={{ margin: 0 }}>Industry Benchmarks</SectionTitle>
                    <span style={{ fontSize: 12, color: '#78716c', background: '#f7f6f3', border: '1px solid #e2ded8', borderRadius: 20, padding: '3px 12px' }}>
                      Median · {form.stage} {form.industry}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {rows.map((row, i) => {
                      const hasVal = row.yours !== null
                      const above = hasVal && row.yours! > row.median
                      const good = row.lowerIsBetter ? !above : above
                      const pct = hasVal ? Math.round(((row.yours! - row.median) / row.median) * 100) : 0
                      const barPct = hasVal ? Math.min(Math.abs(pct), 100) : 0
                      return (
                        <div key={row.key} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 90px 90px', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: i < rows.length - 1 ? '1px solid #f0ede8' : 'none' }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#78716c' }}>{BENCHMARK_LABELS[row.key]}</span>
                          <div style={{ position: 'relative', height: 6, background: '#f0ede8', borderRadius: 3, overflow: 'visible' }}>
                            {/* median marker */}
                            <div style={{ position: 'absolute', left: '50%', top: -3, width: 2, height: 12, background: '#c8c4be', borderRadius: 1 }} />
                            {hasVal && (
                              <div style={{ position: 'absolute', left: above ? '50%' : `${50 - barPct / 2}%`, width: `${barPct / 2}%`, height: '100%', background: good ? '#059669' : '#dc2626', borderRadius: 3, opacity: 0.7 }} />
                            )}
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#1c1917', textAlign: 'right' }}>{hasVal ? row.fmt(row.yours!) : '—'}</span>
                          <span style={{ fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                            {hasVal ? (
                              <span style={{ fontWeight: 700, color: good ? '#059669' : '#dc2626', background: good ? 'rgba(5,150,105,0.08)' : 'rgba(220,38,38,0.08)', borderRadius: 6, padding: '2px 7px' }}>
                                {pct > 0 ? '+' : ''}{pct}%
                              </span>
                            ) : (
                              <span style={{ color: '#a8a29e', fontSize: 11 }}>vs {row.fmt(row.median)}</span>
                            )}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ marginTop: 14, fontSize: 11, color: '#a8a29e' }}>
                    Benchmarks are median values for funded {form.stage} {form.industry} companies. Green = above median, red = below (or above for churn/burn).
                  </div>
                </Card>
              )
            })()}

            {/* Dilution chart */}
            <Card>
              <SectionTitle>Ownership Dilution Over Rounds</SectionTitle>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={result.dilutionForecast} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="gf" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.12} />
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#059669" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0ede8" />
                  <XAxis dataKey="round" tick={{ fill: '#a8a29e', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#a8a29e', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={v => `${v.toFixed(0)}%`} />
                  <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2ded8', borderRadius: 10, color: '#1c1917', fontSize: 13 }}
                    formatter={(v) => [`${(v as number).toFixed(1)}%`]} />
                  <Area type="monotone" dataKey="founderPct" name="Founder" stroke="#4f46e5" fill="url(#gf)" strokeWidth={2.5} />
                  <Area type="monotone" dataKey="coFounderPct" name="Co-Founder" stroke="#059669" fill="url(#gc)" strokeWidth={2.5} strokeDasharray="5 3" />
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            {/* Exit scenarios */}
            <Card>
              <SectionTitle>Founder Value at Exit Scenarios</SectionTitle>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={result.exitValues.map(e => ({ exit: fmt$(e.exit, currency.symbol), founder: e.founderValue, coFounder: e.coFounderValue }))} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0ede8" />
                  <XAxis dataKey="exit" tick={{ fill: '#a8a29e', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#a8a29e', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={v => fmt$(v, currency.symbol)} />
                  <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2ded8', borderRadius: 10, color: '#1c1917', fontSize: 13 }}
                    formatter={(v) => [fmt$(v as number, currency.symbol)]} />
                  <Legend wrapperStyle={{ color: '#78716c', fontSize: 12 }} />
                  <Bar dataKey="founder" name="Founder" fill="#4f46e5" radius={[5, 5, 0, 0]} />
                  <Bar dataKey="coFounder" name="Co-Founder" fill="#059669" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* Flags */}
            {result.flags.length > 0 && (
              <div style={{ background: 'rgba(180,83,9,0.05)', border: '1px solid rgba(180,83,9,0.2)', borderRadius: 14, padding: '20px 24px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#b45309', marginBottom: 12 }}>⚠ Flags to Address</div>
                <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, listStyle: 'none', padding: 0, margin: 0 }}>
                  {result.flags.map((f, i) => <li key={i} style={{ fontSize: 14, color: '#92400e', paddingLeft: 16, position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 0 }}>·</span>{f}
                  </li>)}
                </ul>
              </div>
            )}

            {/* AI Recommendation */}
            <div style={{ background: 'rgba(79,70,229,0.04)', border: '1px solid rgba(79,70,229,0.15)', borderRadius: 14, padding: '24px 28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <div style={{ width: 24, height: 24, background: '#4f46e5', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>✦</div>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '0.08em' }}>AI Recommendation</span>
              </div>
              <p style={{ fontSize: 15, lineHeight: 1.8, color: '#44403c', whiteSpace: 'pre-line' }}>{result.aiRecommendation}</p>
            </div>

            {/* ── AI Council ── */}
            <div style={{ background: '#fff', border: '1px solid #e2ded8', borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #f0ede8', background: '#fafaf9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#1c1917', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>🧠</span> AI Council
                  </div>
                  <div style={{ fontSize: 12, color: '#78716c', marginTop: 3 }}>Four agents, four perspectives — they will disagree. That&apos;s the point.</div>
                </div>
                <button
                  onClick={fetchCouncil}
                  disabled={councilLoading}
                  style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: council ? '#f7f6f3' : '#1c1917', color: council ? '#44403c' : '#fff', fontSize: 13, fontWeight: 700, cursor: councilLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  {councilLoading ? (
                    <>
                      <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                      Consulting council…
                    </>
                  ) : council ? '↺ Reconvene council' : '▶ Convene the council'}
                </button>
              </div>

              {!council && !councilLoading && (
                <div style={{ padding: '36px 24px', textAlign: 'center', color: '#a8a29e', fontSize: 13 }}>
                  Four AI agents will each analyse your data from a different angle — a VC bull, a skeptic, an operator, and a founder ally. Click to convene.
                </div>
              )}

              {councilLoading && (
                <div style={{ padding: '36px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 16 }}>
                    {['🐂', '🐻', '📊', '🛡️'].map((e, i) => (
                      <div key={i} style={{ width: 44, height: 44, borderRadius: 12, background: '#f7f6f3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, animation: `pulse ${0.8 + i * 0.2}s ease-in-out infinite alternate` }}>{e}</div>
                    ))}
                  </div>
                  <span style={{ fontSize: 13, color: '#78716c' }}>4 agents deliberating in parallel…</span>
                  <style>{`@keyframes pulse { from { opacity: 0.4; transform: scale(0.95); } to { opacity: 1; transform: scale(1.05); } }`}</style>
                </div>
              )}

              {council && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
                  {council.map((agent, i) => (
                    <div key={agent.id} style={{ padding: '20px 24px', borderBottom: '1px solid #f0ede8', borderRight: i % 2 === 0 ? '1px solid #f0ede8' : 'none', background: agent.bg }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, border: `1.5px solid ${agent.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, background: '#fff' }}>{agent.emoji}</div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: agent.color }}>{agent.name}</div>
                          <div style={{ fontSize: 11, color: '#78716c' }}>{agent.role}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {[
                          { label: 'Verdict', text: agent.verdict, icon: '⚖️' },
                          { label: 'Priority', text: agent.priority, icon: '🎯' },
                          { label: 'Risk', text: agent.risk, icon: '⚠️' },
                        ].map(row => (
                          <div key={row.label} style={{ display: 'flex', gap: 8 }}>
                            <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>{row.icon}</span>
                            <div>
                              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#a8a29e' }}>{row.label} </span>
                              <span style={{ fontSize: 13, color: '#1c1917', lineHeight: 1.6 }}>{row.text}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Investor FAQ ── */}
            <div style={{ background: '#fff', border: '1px solid #e2ded8', borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #f0ede8', background: '#fafaf9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#1c1917', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>🎤</span> Investor FAQ Generator
                  </div>
                  <div style={{ fontSize: 12, color: '#78716c', marginTop: 3 }}>5 tough questions a VC will ask — with suggested answers using your numbers</div>
                </div>
                <button
                  onClick={handleFAQ}
                  disabled={faqLoading}
                  style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: faqs ? '#f7f6f3' : '#1c1917', color: faqs ? '#44403c' : '#fff', fontSize: 13, fontWeight: 700, cursor: faqLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}
                >
                  {faqLoading ? (
                    <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: faqs ? '#44403c' : '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Generating…</>
                  ) : faqs ? '↺ Regenerate' : '▶ Generate questions'}
                </button>
              </div>
              {!faqs && !faqLoading && (
                <div style={{ padding: '28px 24px', textAlign: 'center', color: '#a8a29e', fontSize: 13 }}>
                  Click to generate the 5 toughest questions an investor will ask — and how to answer them using your actual numbers.
                </div>
              )}
              {faqLoading && (
                <div style={{ padding: '28px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[0,1,2,3,4].map(i => (
                      <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: '#4f46e5', opacity: 0.3, animation: `pulse 1s ease-in-out ${i * 0.15}s infinite alternate` }} />
                    ))}
                  </div>
                  <span style={{ fontSize: 13, color: '#78716c' }}>Thinking like a VC…</span>
                </div>
              )}
              {faqs && (
                <div style={{ padding: '8px 0' }}>
                  {faqs.map((faq, i) => (
                    <div key={i} style={{ borderBottom: i < faqs.length - 1 ? '1px solid #f0ede8' : 'none' }}>
                      <button
                        onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                        style={{ width: '100%', padding: '16px 24px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 12, textAlign: 'left' }}
                      >
                        <div style={{ width: 22, height: 22, borderRadius: 6, background: '#f0ede8', color: '#78716c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0, marginTop: 1 }}>Q{i + 1}</div>
                        <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#1c1917', lineHeight: 1.5 }}>{faq.question}</span>
                        <span style={{ fontSize: 16, color: '#a8a29e', flexShrink: 0, transform: faqOpen === i ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>›</span>
                      </button>
                      {faqOpen === i && (
                        <div style={{ padding: '0 24px 18px 58px' }}>
                          <div style={{ background: 'rgba(79,70,229,0.05)', border: '1px solid rgba(79,70,229,0.15)', borderRadius: 10, padding: '14px 16px' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#4f46e5', marginBottom: 8 }}>💡 Suggested answer</div>
                            <p style={{ fontSize: 13, color: '#1c1917', lineHeight: 1.65, margin: 0 }}>{faq.answer}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Negotiation Simulator ── */}
            {(() => {
              const scenarios = calcNegotiationScenarios(form)
              if (!scenarios.length) return null
              return (
                <div style={{ background: '#fff', border: '1px solid #e2ded8', borderRadius: 16, overflow: 'hidden' }}>
                  <div style={{ padding: '20px 24px', borderBottom: '1px solid #f0ede8', background: '#fafaf9', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#1c1917', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>⚡</span> Term Sheet Negotiation Simulator
                      </div>
                      <div style={{ fontSize: 12, color: '#78716c', marginTop: 3 }}>Exact dollar value of each negotiation — ranked by what&apos;s worth fighting for most</div>
                    </div>
                    <div style={{ fontSize: 11, background: 'rgba(79,70,229,0.08)', color: '#4f46e5', fontWeight: 700, padding: '4px 10px', borderRadius: 20, whiteSpace: 'nowrap' }}>Deterministic · Not AI</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 0 }}>
                    {scenarios.map((s, i) => (
                      <div key={i} style={{ padding: '20px 24px', borderBottom: '1px solid #f0ede8', borderRight: i % 2 === 0 ? '1px solid #f0ede8' : 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 22, height: 22, borderRadius: 6, background: s.priority === 1 ? '#4f46e5' : '#f0ede8', color: s.priority === 1 ? '#fff' : '#78716c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>#{s.priority}</div>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#1c1917' }}>{s.title}</span>
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: s.difficulty === 'Easy' ? 'rgba(5,150,105,0.08)' : s.difficulty === 'Medium' ? 'rgba(180,83,9,0.08)' : 'rgba(220,38,38,0.08)', color: s.difficulty === 'Easy' ? '#059669' : s.difficulty === 'Medium' ? '#b45309' : '#dc2626' }}>{s.difficulty}</span>
                        </div>
                        <div style={{ fontSize: 12, color: '#78716c', marginBottom: 12 }}>{s.ask}</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <div style={{ background: '#f7f6f3', borderRadius: 8, padding: '10px 12px' }}>
                            <div style={{ fontSize: 10, color: '#a8a29e', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>At {currency.symbol}50M exit</div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: '#059669', marginTop: 3 }}>+{fmt$(s.valueAt50M, currency.symbol)}</div>
                          </div>
                          <div style={{ background: '#f7f6f3', borderRadius: 8, padding: '10px 12px' }}>
                            <div style={{ fontSize: 10, color: '#a8a29e', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>At {currency.symbol}100M exit</div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: '#4f46e5', marginTop: 3 }}>+{fmt$(s.valueAt100M, currency.symbol)}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}

            {/* ── Runway Extension Planner ── */}
            {(() => {
              if (!form.burnRate || !form.runway) return null
              const scenarios = calcRunwayScenarios(form)
              const baseScore = result.raiseReadinessScore
              return (
                <div style={{ background: '#fff', border: '1px solid #e2ded8', borderRadius: 16, overflow: 'hidden' }}>
                  <div style={{ padding: '20px 24px', borderBottom: '1px solid #f0ede8', background: '#fafaf9', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#1c1917', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>📈</span> Runway Extension Planner
                      </div>
                      <div style={{ fontSize: 12, color: '#78716c', marginTop: 3 }}>Exactly what changes move the needle — modelled against your current numbers</div>
                    </div>
                    <div style={{ fontSize: 11, background: 'rgba(5,150,105,0.08)', color: '#059669', fontWeight: 700, padding: '4px 10px', borderRadius: 20, whiteSpace: 'nowrap' }}>Deterministic · Not AI</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {scenarios.map((s, i) => {
                      const scoreDelta = s.newReadinessScore - baseScore
                      const runwayGain = s.newRunway - form.runway
                      return (
                        <div key={i} style={{ padding: '18px 24px', borderBottom: i < scenarios.length - 1 ? '1px solid #f0ede8' : 'none', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                          <div style={{ flex: '1 1 200px' }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#1c1917', marginBottom: 4 }}>{s.label}</div>
                            <div style={{ fontSize: 12, color: '#78716c' }}>{s.description}</div>
                          </div>
                          <div style={{ display: 'flex', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
                            <div style={{ textAlign: 'center', background: '#f7f6f3', borderRadius: 10, padding: '10px 16px', minWidth: 80 }}>
                              <div style={{ fontSize: 10, color: '#a8a29e', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>New runway</div>
                              <div style={{ fontSize: 18, fontWeight: 800, color: '#1c1917', marginTop: 3 }}>{s.newRunway}mo</div>
                            </div>
                            <div style={{ textAlign: 'center', background: runwayGain > 0 ? 'rgba(5,150,105,0.06)' : '#f7f6f3', borderRadius: 10, padding: '10px 16px', minWidth: 80 }}>
                              <div style={{ fontSize: 10, color: '#a8a29e', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Extension</div>
                              <div style={{ fontSize: 18, fontWeight: 800, color: runwayGain > 0 ? '#059669' : '#78716c', marginTop: 3 }}>{runwayGain > 0 ? '+' : ''}{s.extensionMonths}mo</div>
                            </div>
                            <div style={{ textAlign: 'center', background: scoreDelta > 0 ? 'rgba(79,70,229,0.06)' : '#f7f6f3', borderRadius: 10, padding: '10px 16px', minWidth: 80 }}>
                              <div style={{ fontSize: 10, color: '#a8a29e', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Readiness</div>
                              <div style={{ fontSize: 18, fontWeight: 800, color: scoreDelta > 0 ? '#4f46e5' : '#78716c', marginTop: 3 }}>{scoreDelta > 0 ? '+' : ''}{scoreDelta.toFixed(0)}pts</div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {/* Funding Matches */}
            <div style={{ background: '#fff', border: '1px solid #e2ded8', borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #f0ede8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1c1917' }}>💰 Funding & Grant Matches</div>
                  <div style={{ fontSize: 12, color: '#78716c', marginTop: 2 }}>Opportunities matched to your stage and industry</div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, background: 'rgba(79,70,229,0.08)', color: '#4f46e5', padding: '4px 10px', borderRadius: 20 }}>
                  {form.stage} · {form.industry}
                </div>
              </div>

              {/* Visible matches */}
              {[
                { name: 'Innovate UK Smart Grant', type: 'Government Grant', amount: '£25,000 – £500,000', match: 94, tag: '🏛️ Grant', deadline: 'Rolling' },
                { name: 'Seedcamp Fund VIII', type: 'Pre-Seed VC', amount: '$500K – $1M', match: 88, tag: '💸 VC', deadline: 'Open' },
              ].map((f, i) => (
                <div key={i} style={{ padding: '16px 24px', borderBottom: '1px solid #f0ede8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: '#f7f6f3', border: '1px solid #e2ded8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                      {f.tag.split(' ')[0]}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#1c1917' }}>{f.name}</div>
                      <div style={{ fontSize: 12, color: '#78716c', marginTop: 2 }}>{f.type} · {f.amount} · Deadline: {f.deadline}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#059669', background: 'rgba(5,150,105,0.08)', padding: '4px 10px', borderRadius: 20 }}>{f.match}% match</div>
                    <button style={{ fontSize: 12, fontWeight: 600, color: '#4f46e5', background: 'rgba(79,70,229,0.06)', border: '1px solid rgba(79,70,229,0.2)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>Apply →</button>
                  </div>
                </div>
              ))}

              {/* Blurred locked matches */}
              <div style={{ position: 'relative' }}>
                {[
                  { name: 'Horizon Europe EIC Accelerator', type: 'EU Grant', amount: '€500K – €2.5M', match: 91, tag: '🏛️' },
                  { name: 'Y Combinator W25', type: 'Accelerator', amount: '$500K', match: 85, tag: '🚀' },
                  { name: 'British Business Bank Start Up Loans', type: 'Govt Loan', amount: '£500 – £25,000', match: 82, tag: '🏦' },
                  { name: 'Antler Residency Programme', type: 'Pre-Seed VC', amount: '$250K', match: 79, tag: '💸' },
                ].map((f, i) => (
                  <div key={i} style={{ padding: '16px 24px', borderBottom: '1px solid #f0ede8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, filter: 'blur(4px)', userSelect: 'none', pointerEvents: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: '#f7f6f3', border: '1px solid #e2ded8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{f.tag}</div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#1c1917' }}>{f.name}</div>
                        <div style={{ fontSize: 12, color: '#78716c', marginTop: 2 }}>{f.type} · {f.amount}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#059669', background: 'rgba(5,150,105,0.08)', padding: '4px 10px', borderRadius: 20 }}>{f.match}% match</div>
                  </div>
                ))}

                {/* Lock overlay */}
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(247,246,243,0.7)', backdropFilter: 'blur(2px)', gap: 10 }}>
                  <div style={{ fontSize: 28 }}>🔒</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#1c1917', letterSpacing: '-0.02em' }}>4 more matches locked</div>
                  <div style={{ fontSize: 13, color: '#78716c', textAlign: 'center', maxWidth: 280 }}>Upgrade to Premium to see all funding sources, grants, and accelerators you qualify for</div>
                  <button style={{ marginTop: 4, padding: '10px 24px', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: '#fff', fontWeight: 700, fontSize: 13, boxShadow: '0 4px 14px rgba(79,70,229,0.35)' }}>
                    Unlock Premium →
                  </button>
                </div>
              </div>
            </div>

            {/* Premium unlock banner */}
            <div style={{ borderRadius: 18, overflow: 'hidden', border: '1px solid rgba(99,102,241,0.25)' }}>
              <div style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 55%, #4338ca 100%)', padding: '32px 32px 28px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32, alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ flex: '1 1 300px' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 20, padding: '3px 11px', marginBottom: 14 }}>
                      <span>🔒</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#c7d2fe', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Unlock Premium</span>
                    </div>
                    <h3 style={{ fontSize: 20, fontWeight: 900, color: '#fff', margin: '0 0 10px', lineHeight: 1.3, letterSpacing: '-0.03em' }}>
                      Discover grants & funding you can actually secure
                    </h3>
                    <p style={{ fontSize: 13.5, color: '#a5b4fc', margin: '0 0 16px', lineHeight: 1.7 }}>
                      Based on your profile, our Premium engine searches 500+ funding databases to surface the exact grants, VC programmes, and accelerators you qualify for right now.
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {['🔍 Matched grants', '💸 Investor fit score', '🏛️ Accelerators', '📊 Grant vs equity', '🔔 Opportunity alerts'].map(t => (
                        <span key={t} style={{ fontSize: 12, color: '#c7d2fe', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20, padding: '4px 12px' }}>{t}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{ flex: '0 1 200px', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'stretch' }}>
                    <button style={{
                      padding: '13px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
                      background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                      color: '#fff', fontWeight: 700, fontSize: 14,
                      boxShadow: '0 4px 18px rgba(99,102,241,0.5)',
                    }}>
                      Join the Waitlist →
                    </button>
                    <p style={{ fontSize: 11, color: '#818cf8', textAlign: 'center', margin: 0 }}>No credit card required</p>
                  </div>
                </div>
              </div>
            </div>

            <button onClick={() => setScreen('compare')} style={{
              background: '#fff', color: '#4f46e5', border: '1px solid rgba(79,70,229,0.3)',
              borderRadius: 12, padding: '14px 28px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              letterSpacing: '-0.01em',
            }}>
              View Raise Now vs Raise Later →
            </button>
            </div> {/* end results-content */}
          </div>
        )}

        {/* ── Screen 3: Scenario Comparison ── */}
        {screen === 'compare' && result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Action bar */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={handleShare} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: '1px solid #e2ded8', background: '#fff', color: '#44403c', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {copying ? '✓ Link copied!' : '🔗 Share scenarios'}
              </button>
              <button onClick={() => handleDownloadPDF('compare-content', `${form.name}-scenarios.pdf`)} disabled={downloading} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', background: '#4f46e5', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {downloading ? 'Generating…' : '⬇ Download PDF'}
              </button>
            </div>

            <div id="compare-content">
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: '#1c1917', marginBottom: 8 }}>Scenario Comparison</h1>
              <p style={{ color: '#78716c', fontSize: 14 }}>Raise Now vs Raise Later — modelled with a 40% higher valuation if you wait 6 months and grow.</p>
            </div>

            {/* Side by side */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Card style={{ borderTop: '3px solid #b45309' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 20 }}>⚡ Raise Now</div>
                {result.raiseNowScenario.map((r, i) => (
                  <div key={i} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: i < result.raiseNowScenario.length - 1 ? '1px solid #f0ede8' : 'none' }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: '#1c1917' }}>{r.round}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                      <span style={{ fontSize: 12, color: '#78716c' }}>Pre-money</span>
                      <span style={{ fontSize: 12, color: '#1c1917', textAlign: 'right', fontWeight: 600 }}>{fmt$(r.preMoneyValuation, currency.symbol)}</span>
                      <span style={{ fontSize: 12, color: '#78716c' }}>Founder ownership</span>
                      <span style={{ fontSize: 12, color: '#4f46e5', textAlign: 'right', fontWeight: 700 }}>{fmtPct(r.founderPct + r.coFounderPct)}</span>
                      <span style={{ fontSize: 12, color: '#78716c' }}>Investor stake</span>
                      <span style={{ fontSize: 12, color: '#dc2626', textAlign: 'right', fontWeight: 600 }}>{fmtPct(r.newInvestorPct)}</span>
                    </div>
                  </div>
                ))}
              </Card>

              <Card style={{ borderTop: '3px solid #059669' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 20 }}>⏳ Raise Later (+6 months)</div>
                {result.raiseLaterScenario.map((r, i) => (
                  <div key={i} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: i < result.raiseLaterScenario.length - 1 ? '1px solid #f0ede8' : 'none' }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: '#1c1917' }}>{r.round}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                      <span style={{ fontSize: 12, color: '#78716c' }}>Pre-money</span>
                      <span style={{ fontSize: 12, color: '#1c1917', textAlign: 'right', fontWeight: 600 }}>{fmt$(r.preMoneyValuation, currency.symbol)}</span>
                      <span style={{ fontSize: 12, color: '#78716c' }}>Founder ownership</span>
                      <span style={{ fontSize: 12, color: '#059669', textAlign: 'right', fontWeight: 700 }}>{fmtPct(r.founderPct + r.coFounderPct)}</span>
                      <span style={{ fontSize: 12, color: '#78716c' }}>Investor stake</span>
                      <span style={{ fontSize: 12, color: '#dc2626', textAlign: 'right', fontWeight: 600 }}>{fmtPct(r.newInvestorPct)}</span>
                    </div>
                  </div>
                ))}
              </Card>
            </div>

            {/* Delta */}
            {(() => {
              const nowF = result.raiseNowScenario[result.raiseNowScenario.length - 1]
              const latF = result.raiseLaterScenario[result.raiseLaterScenario.length - 1]
              const delta = (latF.founderPct + latF.coFounderPct) - (nowF.founderPct + nowF.coFounderPct)
              return (
                <Card>
                  <SectionTitle>Impact of Waiting 6 Months</SectionTitle>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                    <StatCard label="Ownership gain from waiting" value={`${delta >= 0 ? '+' : ''}${fmtPct(delta)}`} color={delta >= 0 ? '#059669' : '#dc2626'} sub="founder + co-founder" />
                    <StatCard label="Valuation uplift (later)" value={fmt$(latF.postMoneyValuation - nowF.postMoneyValuation, currency.symbol)} color="#4f46e5" sub="projected post-money diff" />
                    <StatCard label="Recommended path" value={result.recommendedTiming === 'raise-now' ? 'Raise Now' : 'Raise Later'} color="#4f46e5" />
                  </div>
                </Card>
              )
            })()}

            {/* Chart */}
            <Card>
              <SectionTitle>Founder Ownership: Now vs Later</SectionTitle>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={result.raiseNowScenario.map((r, i) => ({
                  round: r.round,
                  'Raise Now': r.founderPct + r.coFounderPct,
                  'Raise Later': (result.raiseLaterScenario[i]?.founderPct ?? 0) + (result.raiseLaterScenario[i]?.coFounderPct ?? 0),
                }))} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0ede8" />
                  <XAxis dataKey="round" tick={{ fill: '#a8a29e', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#a8a29e', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={v => `${v.toFixed(0)}%`} />
                  <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2ded8', borderRadius: 10, color: '#1c1917', fontSize: 13 }}
                    formatter={(v) => [`${(v as number).toFixed(1)}%`]} />
                  <Legend wrapperStyle={{ color: '#78716c', fontSize: 12 }} />
                  <Bar dataKey="Raise Now" fill="#e2ded8" radius={[5, 5, 0, 0]} />
                  <Bar dataKey="Raise Later" fill="#4f46e5" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
            </div> {/* end compare-content */}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #e2ded8', background: '#fff', marginTop: 40 }}>

        {/* Top row — stats bar */}
        <div style={{ borderBottom: '1px solid #f0ede8', background: '#fafaf9' }}>
          <div style={{ maxWidth: 880, margin: '0 auto', padding: '14px 24px', display: 'flex', gap: 0, justifyContent: 'space-between', alignItems: 'center' }}>
            {[
              { value: '500+', label: 'Funding sources tracked' },
              { value: '5', label: 'Financial engines' },
              { value: 'AI', label: 'Powered analysis' },
              { value: 'Free', label: 'Core plan' },
            ].map((s, i, arr) => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                <div style={{ textAlign: 'center', padding: '0 28px' }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#4f46e5', letterSpacing: '-0.03em' }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: '#a8a29e', marginTop: 2 }}>{s.label}</div>
                </div>
                {i < arr.length - 1 && <div style={{ width: 1, height: 28, background: '#e2ded8' }} />}
              </div>
            ))}
          </div>
        </div>

        {/* Main footer row — single line */}
        <div style={{ maxWidth: 880, margin: '0 auto', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 16 }}>⚖️</span>
            <span style={{ fontWeight: 900, fontSize: 14, letterSpacing: '-0.02em', color: '#1c1917' }}>EquityIQ</span>
            <span style={{ width: 1, height: 14, background: '#e2ded8', margin: '0 4px' }} />
            <span style={{ fontSize: 12, color: '#78716c' }}>AI-powered fundraising decisions for founders. Know your worth before you raise.</span>
          </div>
          <a href="mailto:2824642t@student.gla.ac.uk" style={{ fontSize: 12, color: '#4f46e5', textDecoration: 'none', whiteSpace: 'nowrap' }}>2824642t@student.gla.ac.uk</a>
        </div>

        {/* Bottom bar */}
        <div style={{ borderTop: '1px solid #f0ede8', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 12, color: '#a8a29e' }}>© {new Date().getFullYear()} EquityIQ. Built for founders, by founders.</span>
          <span style={{ fontSize: 12, color: '#a8a29e' }}>Not financial advice. For informational purposes only.</span>
        </div>
      </footer>
    </div>
  )
}

function scoreColor(s: number) {
  if (s >= 70) return '#059669'
  if (s >= 45) return '#b45309'
  return '#dc2626'
}
