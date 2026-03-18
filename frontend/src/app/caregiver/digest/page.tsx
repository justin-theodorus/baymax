'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface DigestSummary {
  type: string
  digest_text: string
  adherence_pct: number
  vitals_summary: string
  alert_count: number
}

interface DigestReport {
  id: string
  patient_id: string
  period_start: string
  period_end: string
  summary: DigestSummary
  generated_at: string
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// ── Vitals helpers (mirrors clinician report) ─────────────────────────────────

const VITAL_RANGES: Record<string, { min: number; max: number; borderlineBuffer: number; unit: string }> = {
  blood_glucose: { min: 4, max: 10, borderlineBuffer: 1, unit: 'mmol/L' },
  blood_pressure_systolic: { min: 90, max: 140, borderlineBuffer: 10, unit: 'mmHg' },
  blood_pressure_diastolic: { min: 60, max: 90, borderlineBuffer: 8, unit: 'mmHg' },
  heart_rate: { min: 60, max: 100, borderlineBuffer: 8, unit: 'bpm' },
  weight: { min: 40, max: 120, borderlineBuffer: 5, unit: 'kg' },
}

function getVitalStatus(vtype: string, avg: number): 'normal' | 'borderline' | 'abnormal' {
  const range = VITAL_RANGES[vtype]
  if (!range) return 'normal'
  const { min, max, borderlineBuffer } = range
  if (avg >= min && avg <= max) return 'normal'
  if (avg >= min - borderlineBuffer && avg <= max + borderlineBuffer) return 'borderline'
  return 'abnormal'
}

function statusColor(s: 'normal' | 'borderline' | 'abnormal') {
  if (s === 'normal') return '#16a34a'
  if (s === 'borderline') return '#d97706'
  return '#dc2626'
}
function statusBg(s: 'normal' | 'borderline' | 'abnormal') {
  if (s === 'normal') return '#f0fdf4'
  if (s === 'borderline') return '#fffbeb'
  return '#fef2f2'
}
function statusLabel(s: 'normal' | 'borderline' | 'abnormal') {
  if (s === 'normal') return 'In Range'
  if (s === 'borderline') return 'Borderline'
  return 'Out of Range'
}

function VitalGaugeBar({ vtype, avg }: { vtype: string; avg: number }) {
  const range = VITAL_RANGES[vtype]
  if (!range || avg === 0) return null
  const displayMin = Math.min(range.min * 0.7, avg * 0.9)
  const displayMax = Math.max(range.max * 1.3, avg * 1.1)
  const totalSpan = displayMax - displayMin
  const fillPct = Math.min(Math.max(((avg - displayMin) / totalSpan) * 100, 2), 100)
  const normalStartPct = ((range.min - displayMin) / totalSpan) * 100
  const normalEndPct = ((range.max - displayMin) / totalSpan) * 100
  const status = getVitalStatus(vtype, avg)
  return (
    <div className="mt-1.5">
      <div className="relative h-3 rounded-full overflow-hidden" style={{ background: '#e5e7eb' }}>
        <div className="absolute top-0 h-full opacity-30" style={{ left: `${normalStartPct}%`, width: `${normalEndPct - normalStartPct}%`, background: '#16a34a' }} />
        <div className="absolute top-0 h-full rounded-full" style={{ width: `${fillPct}%`, background: statusColor(status), opacity: 0.85 }} />
      </div>
      <div className="flex justify-between mt-0.5">
        <span className="text-xs text-gray-400">{displayMin.toFixed(0)}</span>
        <span className="text-xs" style={{ color: statusColor(status) }}>avg {avg} — {statusLabel(status)}</span>
        <span className="text-xs text-gray-400">{displayMax.toFixed(0)}</span>
      </div>
    </div>
  )
}

function parseVitalsSummary(text: string): Record<string, { avg: number; min: number; max: number; count: number; unit: string }> {
  const buckets: Record<string, number[]> = {}
  const units: Record<string, string> = {}
  text.split(';').forEach(part => {
    const m = part.trim().match(/^([\w_]+):\s*([\d.]+)\s*(.*)$/)
    if (!m) return
    const [, key, val, unit] = m
    if (!buckets[key]) buckets[key] = []
    buckets[key].push(parseFloat(val))
    if (unit.trim()) units[key] = unit.trim()
  })
  const result: Record<string, { avg: number; min: number; max: number; count: number; unit: string }> = {}
  for (const [key, vals] of Object.entries(buckets)) {
    const avg = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
    result[key] = { avg, min: Math.min(...vals), max: Math.max(...vals), count: vals.length, unit: units[key] ?? VITAL_RANGES[key]?.unit ?? '' }
  }
  return result
}

function VitalsBlock({ vitalsText }: { vitalsText: string }) {
  const readings = parseVitalsSummary(vitalsText)
  const priorityOrder = ['blood_glucose', 'blood_pressure_systolic', 'blood_pressure_diastolic', 'heart_rate', 'weight']
  const entries = [
    ...priorityOrder.filter(k => k in readings).map(k => [k, readings[k]] as const),
    ...Object.entries(readings).filter(([k]) => !priorityOrder.includes(k)),
  ]
  if (!entries.length) return null
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {entries.map(([vtype, data]) => {
        const status = getVitalStatus(vtype, data.avg)
        const label = vtype.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        return (
          <div key={vtype} className="rounded-xl p-3 border" style={{ background: statusBg(status), borderColor: statusColor(status) + '33' }}>
            <div className="flex justify-between items-start">
              <p className="text-xs font-medium text-gray-600">{label}</p>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ color: statusColor(status), background: statusColor(status) + '1A' }}>
                {statusLabel(status)}
              </span>
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-2xl font-bold" style={{ color: statusColor(status) }}>{data.avg > 0 ? data.avg : '—'}</span>
              <span className="text-xs text-gray-500">{data.unit}</span>
            </div>
            {data.avg > 0 && <VitalGaugeBar vtype={vtype} avg={data.avg} />}
            {data.count > 1 && <p className="text-xs text-gray-400 mt-1">{data.min}–{data.max} range · {data.count} readings</p>}
          </div>
        )
      })}
    </div>
  )
}

// ── Date formatting ───────────────────────────────────────────────────────────

function formatDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-SG', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function stripMarkdown(text: string): string {
  return text
    .replace(/^#+\s*/gm, '')           // headings
    .replace(/\*\*(.*?)\*\*/g, '$1')   // bold
    .replace(/\*(.*?)\*/g, '$1')       // italic
    .replace(/^[•\-*]\s*/gm, '')       // bullet chars
    .trim()
}

interface DigestItem {
  label: string
  body: string
}

function parseDigestItems(text: string | undefined | null): DigestItem[] {
  if (!text) return []
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const items: DigestItem[] = []

  for (const line of lines) {
    // Skip pure heading lines (# Title) and date-range lines like "*Week of 8–15 March 2026*"
    if (/^#+\s/.test(line)) continue
    if (/week of/i.test(line)) continue

    // Strip bullet prefix
    const stripped = line.replace(/^[•\-*]\s*/, '')

    // If line contains "**Label**: body" pattern, split it
    const match = stripped.match(/^\*{0,2}([^*:]+)\*{0,2}:\s*(.+)/)
    if (match) {
      items.push({ label: match[1].trim(), body: match[2].trim() })
    } else {
      // Plain line — use empty label
      const clean = stripMarkdown(stripped)
      if (clean) items.push({ label: '', body: clean })
    }
  }
  return items
}

function renderDigestText(text: string | undefined | null) {
  const items = parseDigestItems(text)
  if (!items.length) return null

  return items.map((item, i) => (
    <div key={i} className="bg-white rounded-[15px] px-4 py-3 flex flex-col gap-1">
      {item.label && (
        <p className="text-[#464646] text-sm font-semibold">{item.label}</p>
      )}
      <p className="text-[#8f8f8f] text-sm leading-relaxed">{item.body}</p>
    </div>
  ))
}

export default function DigestPage() {
  const router = useRouter()
  const supabase = createClient()

  const [patientId, setPatientId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [digest, setDigest] = useState<DigestReport | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState('')
  const [generateMessage, setGenerateMessage] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.push('/caregiver/login')
        return
      }
      setAccessToken(session.access_token)

      try {
        const payload = JSON.parse(atob(session.access_token.split('.')[1]))
        const caregiverId = payload.app_user_id

        const { data: caregiverData } = await supabase
          .from('caregivers')
          .select('patient_ids')
          .eq('id', caregiverId)
          .single()

        const patientIds: string[] = caregiverData?.patient_ids ?? []
        if (patientIds.length) {
          setPatientId(patientIds[0])
        }
      } catch {
        setPatientId('')
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!patientId || !accessToken) return

    const fetchDigest = async () => {
      setIsLoading(true)
      setError('')
      try {
        const res = await fetch(`${API_BASE}/api/caregiver/${patientId}/digest`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        setDigest(data.digest ?? null)
      } catch {
        setError('Failed to load digest.')
      } finally {
        setIsLoading(false)
      }
    }

    fetchDigest()
  }, [patientId, accessToken])

  const handleGenerate = async () => {
    if (isGenerating || !patientId || !accessToken) return
    setIsGenerating(true)
    setGenerateMessage('')
    setError('')

    try {
      const res = await fetch(`${API_BASE}/api/caregiver/${patientId}/digest/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()

      if (data.success) {
        setGenerateMessage('Digest generated and sent to Telegram!')
        const refreshRes = await fetch(`${API_BASE}/api/caregiver/${patientId}/digest`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json()
          setDigest(refreshData.digest ?? null)
        }
      } else {
        setError(data.reason ?? 'Failed to generate digest.')
      }
    } catch {
      setError('Failed to generate digest. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  if (isLoading) {
    return (
      <main className="bg-white min-h-screen px-8 md:px-12 pt-12 md:pt-16">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-gray-200 rounded-full" />
          <div className="h-40 bg-gray-200 rounded-[20px]" />
        </div>
      </main>
    )
  }

  return (
    <main className="bg-white min-h-screen">
      {/* Header */}
      <div className="px-8 md:px-12 pt-12 md:pt-16 pb-6">
        <p className="text-black text-2xl font-bold">Weekly Digest</p>
        <p className="text-[#8f8f8f] text-base mt-1">AI-generated health summary for your loved one</p>
      </div>

      <div className="flex flex-col gap-5 px-8 md:px-12 pb-8">
        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="bg-[#4894fe] text-white rounded-[20px] px-6 py-4 flex items-center justify-center gap-3 font-semibold text-base transition-opacity disabled:opacity-60"
          style={{ minHeight: '0', minWidth: '0' }}
        >
          {isGenerating ? (
            <>
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
              </svg>
              Generate New Digest
            </>
          )}
        </button>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-[20px] px-5 py-4 text-red-700 text-base">
            {error}
          </div>
        )}

        {generateMessage && (
          <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-[20px] px-5 py-4 text-[#166534] text-base flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path fillRule="evenodd" d="M19.916 4.626a.75.75 0 01.208 1.04l-9 13.5a.75.75 0 01-1.154.114l-6-6a.75.75 0 011.06-1.06l5.353 5.353 8.493-12.74a.75.75 0 011.04-.207z" clipRule="evenodd" />
            </svg>
            {generateMessage}
          </div>
        )}

        {digest ? (
          <>
            {/* Report period card */}
            <div className="bg-[#4894fe] rounded-[20px] p-6 flex flex-col gap-5">
              <div>
                <p className="text-white text-xs font-semibold uppercase tracking-wider opacity-70">Report Period</p>
                <p className="text-white text-xl font-bold mt-1">
                  {formatDateShort(digest.period_start)} — {formatDateShort(digest.period_end)}
                </p>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[rgba(255,255,255,0.2)] rounded-[15px] px-4 py-3">
                  <p className="text-white text-3xl font-bold">
                    {digest.summary.adherence_pct}
                    <span className="text-lg opacity-70">%</span>
                  </p>
                  <p className="text-white text-xs opacity-70 mt-1">Med Adherence</p>
                </div>
                <div className="bg-[rgba(255,255,255,0.2)] rounded-[15px] px-4 py-3">
                  <p className="text-white text-3xl font-bold">{digest.summary.alert_count}</p>
                  <p className="text-white text-xs opacity-70 mt-1">Alerts This Week</p>
                </div>
              </div>

              {/* Vitals section */}
              {digest.summary.vitals_summary && (
                <div className="bg-white rounded-[15px] px-4 py-4">
                  <p className="text-[#8f8f8f] text-xs font-semibold uppercase tracking-wider mb-3">Vitals at a Glance</p>
                  <VitalsBlock vitalsText={digest.summary.vitals_summary} />
                </div>
              )}
            </div>

            {/* Summary card */}
            <div className="bg-[#f5f5f5] rounded-[20px] p-6">
              <p className="text-black text-base font-bold mb-3">Summary</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {renderDigestText(digest.summary.digest_text)}
              </div>
            </div>

            <p className="text-[#b4b4b4] text-xs text-center">
              Generated: {new Date(digest.generated_at).toLocaleString('en-SG')} · AI-Generated Summary — not a clinical record
            </p>
          </>
        ) : (
          <div className="text-center py-16 bg-white rounded-[20px] shadow-[0px_0px_100px_0px_rgba(0,0,0,0.05)]">
            <div className="text-5xl mb-4">📋</div>
            <p className="text-black text-xl font-bold">No digest yet</p>
            <p className="text-[#b4b4b4] text-base mt-2 mb-6">
              Generate a weekly digest to see an AI-powered summary of your loved one&apos;s health.
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
