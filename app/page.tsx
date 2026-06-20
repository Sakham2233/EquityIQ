'use client'
import { useState } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import { StartupInput, EquityIQResult } from '@/lib/types'
import { fmt$, fmtPct } from '@/lib/utils'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend
} from 'recharts'

const STAGES: string[] = ['pre-seed', 'seed', 'series-a', 'series-b']
const INDUSTRIES = ['SaaS', 'FinTech', 'HealthTech', 'DeepTech', 'E-commerce', 'EdTech', 'CleanTech', 'Other']

const DEFAULT: StartupInput = {
  name: '', industry: 'SaaS', stage: 'seed', location: '',
  arr: 0, mrr: 0, growthRate: 0, burnRate: 0, runway: 0, customerCount: 0, pipelineValue: 0,
  capitalRequired: 0, valuation: 0, investorOffer: 0, equityRequested: 0,
  founderPct: 0, coFounderPct: 0, employeePoolPct: 0, existingInvestorPct: 0,
}

const inputBase: React.CSSProperties = {
  width: '100%', background: '#fff', border: '1px solid #e2ded8',
  borderRadius: 8, padding: '10px 12px', fontSize: 14, color: '#1c1917',
  outline: 'none', fontFamily: 'inherit',
}

function Field({ label, value, onChange, type = 'text', prefix, suffix, options, span }: {
  label: string; value: string | number; onChange: (v: string) => void
  type?: string; prefix?: string; suffix?: string; options?: string[]; span?: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, gridColumn: span ? 'span 2' : undefined }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#78716c', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</label>
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#4f46e5', marginBottom: 20 }}>
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
  const [authError, setAuthError] = useState('')
  const [localUser, setLocalUser] = useState<{ name: string; email: string } | null>(null)

  const user = session?.user ?? (localUser ? { name: localUser.name, email: localUser.email, image: null } : null)

  function handleAuth(e: React.FormEvent) {
    e.preventDefault()
    setAuthError('')
    if (!authEmail.includes('@')) { setAuthError('Enter a valid email.'); return }
    if (authPassword.length < 6) { setAuthError('Password must be at least 6 characters.'); return }
    if (authTab === 'signup' && !authName.trim()) { setAuthError('Name is required.'); return }
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
      setForm(f => ({ ...f, ...extracted }))
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
                <button key={t} onClick={() => { setAuthTab(t); setAuthError('') }} style={{
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
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#78716c', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Full Name</label>
                  <input value={authName} onChange={e => setAuthName(e.target.value)} placeholder="Jane Smith" style={{ ...inputBase, padding: '11px 14px' }} />
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#78716c', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Email</label>
                <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="you@startup.com" style={{ ...inputBase, padding: '11px 14px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#78716c', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Password</label>
                <input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} placeholder="••••••••" style={{ ...inputBase, padding: '11px 14px' }} />
              </div>
              {authError && <p style={{ fontSize: 13, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', margin: 0 }}>{authError}</p>}
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
                    <p style={{ fontSize: 12, color: '#059669', margin: 0, marginTop: 2 }}>✓ Form pre-filled from document</p>
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
                <Field label="Startup Name" value={form.name} onChange={set('name')} span />
                <Field label="Industry" value={form.industry} onChange={set('industry')} options={INDUSTRIES} />
                <Field label="Stage" value={form.stage} onChange={set('stage')} options={STAGES} />
                <Field label="Location" value={form.location} onChange={set('location')} />
              </div>
            </Card>

            <Card>
              <SectionTitle>Financials</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Field label="Annual Recurring Revenue" value={form.arr} onChange={set('arr')} type="number" prefix="$" />
                <Field label="Monthly Recurring Revenue" value={form.mrr} onChange={set('mrr')} type="number" prefix="$" />
                <Field label="Monthly Growth Rate" value={form.growthRate} onChange={set('growthRate')} type="number" suffix="%" />
                <Field label="Monthly Burn Rate" value={form.burnRate} onChange={set('burnRate')} type="number" prefix="$" />
                <Field label="Runway" value={form.runway} onChange={set('runway')} type="number" suffix="months" />
                <Field label="Customer Count" value={form.customerCount} onChange={set('customerCount')} type="number" />
              </div>
            </Card>

            <Card>
              <SectionTitle>Deal Terms</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Field label="Capital Required" value={form.capitalRequired} onChange={set('capitalRequired')} type="number" prefix="$" />
                <Field label="Pre-Money Valuation" value={form.valuation} onChange={set('valuation')} type="number" prefix="$" />
                <Field label="Investor Offer" value={form.investorOffer} onChange={set('investorOffer')} type="number" prefix="$" />
                <Field label="Equity Requested" value={form.equityRequested} onChange={set('equityRequested')} type="number" suffix="%" />
              </div>
            </Card>

            <Card>
              <SectionTitle>Current Cap Table</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Field label="Founder %" value={form.founderPct} onChange={set('founderPct')} type="number" suffix="%" />
                <Field label="Co-Founder %" value={form.coFounderPct} onChange={set('coFounderPct')} type="number" suffix="%" />
                <Field label="Employee Pool %" value={form.employeePoolPct} onChange={set('employeePoolPct')} type="number" suffix="%" />
                <Field label="Existing Investors %" value={form.existingInvestorPct} onChange={set('existingInvestorPct')} type="number" suffix="%" />
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
                value={fmt$(result.dilutionForecast[0].postMoneyValuation)}
                sub={`${fmtPct(result.dilutionForecast[0].newInvestorPct)} investor stake`} />
              <StatCard label="Founder Value at $100M Exit"
                value={fmt$(result.exitValues.find(e => e.exit === 100_000_000)?.founderValue ?? 0)}
                sub="after all modelled rounds" color="#059669" bg="rgba(5,150,105,0.04)" />
            </div>

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
                <BarChart data={result.exitValues.map(e => ({ exit: fmt$(e.exit), founder: e.founderValue, coFounder: e.coFounderValue }))} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0ede8" />
                  <XAxis dataKey="exit" tick={{ fill: '#a8a29e', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#a8a29e', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={v => fmt$(v)} />
                  <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2ded8', borderRadius: 10, color: '#1c1917', fontSize: 13 }}
                    formatter={(v) => [fmt$(v as number)]} />
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
          </div>
        )}

        {/* ── Screen 3: Scenario Comparison ── */}
        {screen === 'compare' && result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
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
                      <span style={{ fontSize: 12, color: '#1c1917', textAlign: 'right', fontWeight: 600 }}>{fmt$(r.preMoneyValuation)}</span>
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
                      <span style={{ fontSize: 12, color: '#1c1917', textAlign: 'right', fontWeight: 600 }}>{fmt$(r.preMoneyValuation)}</span>
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
                    <StatCard label="Valuation uplift (later)" value={fmt$(latF.postMoneyValuation - nowF.postMoneyValuation)} color="#4f46e5" sub="projected post-money diff" />
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
