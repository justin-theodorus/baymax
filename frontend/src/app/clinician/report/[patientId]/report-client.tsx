'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const NAVY = '#3B4F7A'
const NAVY_LIGHT = '#EEF1F7'
const NAVY_TEXT = '#2C3E6B'

// Normal ranges for vitals gauge display
const VITAL_RANGES: Record<string, { min: number; max: number; borderlineBuffer: number; unit: string }> = {
  blood_glucose: { min: 4, max: 10, borderlineBuffer: 1, unit: 'mmol/L' },
  blood_pressure_systolic: { min: 90, max: 140, borderlineBuffer: 10, unit: 'mmHg' },
  blood_pressure_diastolic: { min: 60, max: 90, borderlineBuffer: 8, unit: 'mmHg' },
  heart_rate: { min: 60, max: 100, borderlineBuffer: 8, unit: 'bpm' },
  weight: { min: 40, max: 120, borderlineBuffer: 5, unit: 'kg' },
}

interface ReportClientProps {
  patientId: string
  accessToken: string
  report: Record<string, unknown>
}

// Unused but kept to satisfy the interface export contract
export type { ReportClientProps }

// Gauge status helpers
function getVitalStatus(vtype: string, avg: number): 'normal' | 'borderline' | 'abnormal' {
  const range = VITAL_RANGES[vtype]
  if (!range) return 'normal'
  const { min, max, borderlineBuffer } = range
  if (avg >= min && avg <= max) return 'normal'
  if (avg >= min - borderlineBuffer && avg <= max + borderlineBuffer) return 'borderline'
  return 'abnormal'
}

function statusColor(status: 'normal' | 'borderline' | 'abnormal'): string {
  if (status === 'normal') return '#16a34a'
  if (status === 'borderline') return '#d97706'
  return '#dc2626'
}

function statusBg(status: 'normal' | 'borderline' | 'abnormal'): string {
  if (status === 'normal') return '#f0fdf4'
  if (status === 'borderline') return '#fffbeb'
  return '#fef2f2'
}

function statusLabel(status: 'normal' | 'borderline' | 'abnormal'): string {
  if (status === 'normal') return 'In Range'
  if (status === 'borderline') return 'Borderline'
  return 'Out of Range'
}

// Horizontal gauge bar
function VitalGaugeBar({
  vtype,
  avg,
}: {
  vtype: string
  avg: number
  min: number
  max: number
}) {
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
        {/* Normal range band */}
        <div
          className="absolute top-0 h-full opacity-30"
          style={{
            left: `${normalStartPct}%`,
            width: `${normalEndPct - normalStartPct}%`,
            background: '#16a34a',
          }}
        />
        {/* Value fill */}
        <div
          className="absolute top-0 h-full rounded-full"
          style={{
            width: `${fillPct}%`,
            background: statusColor(status),
            opacity: 0.85,
          }}
        />
      </div>
      <div className="flex justify-between mt-0.5">
        <span className="text-xs text-gray-400">{displayMin.toFixed(0)}</span>
        <span className="text-xs" style={{ color: statusColor(status) }}>
          avg {avg} — {statusLabel(status)}
        </span>
        <span className="text-xs text-gray-400">{displayMax.toFixed(0)}</span>
      </div>
    </div>
  )
}

// Visual stat cards with color indicators and gauges
function VitalsGaugeBlock({
  readings,
}: {
  readings: Record<string, Record<string, unknown>>
}) {
  const priorityOrder = [
    'blood_glucose',
    'blood_pressure_systolic',
    'blood_pressure_diastolic',
    'heart_rate',
    'weight',
  ]
  const entries: [string, Record<string, unknown>][] = [
    ...priorityOrder
      .filter(k => k in readings)
      .map(k => [k, readings[k]] as [string, Record<string, unknown>]),
    ...Object.entries(readings).filter(([k]) => !priorityOrder.includes(k)),
  ]

  if (entries.length === 0) return null

  return (
    <div className="mt-4 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        Vitals at a Glance
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {entries.map(([vtype, data]) => {
          const avg = Number(data.avg ?? 0)
          const min = Number(data.min ?? 0)
          const max = Number(data.max ?? 0)
          const count = Number(data.count ?? 0)
          const unit = String(data.unit ?? VITAL_RANGES[vtype]?.unit ?? '')
          const status = getVitalStatus(vtype, avg)
          const label = vtype.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

          return (
            <div
              key={vtype}
              className="rounded-xl p-3 border"
              style={{
                background: statusBg(status),
                borderColor: statusColor(status) + '33',
              }}
            >
              <div className="flex justify-between items-start">
                <p className="text-xs font-medium text-gray-600">{label}</p>
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    color: statusColor(status),
                    background: statusColor(status) + '1A',
                  }}
                >
                  {statusLabel(status)}
                </span>
              </div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-bold" style={{ color: statusColor(status) }}>
                  {avg > 0 ? avg : '—'}
                </span>
                <span className="text-xs text-gray-500">{unit}</span>
              </div>
              {avg > 0 && <VitalGaugeBar vtype={vtype} avg={avg} min={min} max={max} />}
              {count > 0 && (
                <p className="text-xs text-gray-400 mt-1">
                  {min}–{max} range · {count} readings
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Props kept for API compatibility; PDF export uses window.print()
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function PdfExportButton(_props: {
  patientId: string
  accessToken: string
  startDate: string
  endDate: string
}) {
  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="flex items-center gap-2 no-print">
      <button
        onClick={handlePrint}
        className="flex items-center gap-2 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
        style={{ background: NAVY }}
      >
        ⬇ Export PDF
      </button>
    </div>
  )
}

export function DateRangeControls({
  patientId,
  accessToken,
}: {
  patientId: string
  accessToken: string
}) {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [report, setReport] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState('')

  const handleFetch = async () => {
    setIsRefreshing(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (startDate) params.set('start_date', startDate)
      if (endDate) params.set('end_date', endDate)
      const res = await fetch(
        `${API_BASE}/api/clinician/${patientId}/report?${params.toString()}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setReport(data.report)
    } catch {
      setError('Failed to load report for the selected date range.')
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 no-print">
        <p className="text-sm font-medium text-gray-600 mb-3">Custom Date Range</p>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">From</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">To</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <button
            onClick={handleFetch}
            disabled={isRefreshing}
            className="text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            style={{ background: NAVY_LIGHT, color: NAVY_TEXT }}
          >
            {isRefreshing ? 'Loading…' : 'Apply'}
          </button>
          <PdfExportButton
            patientId={patientId}
            accessToken={accessToken}
            startDate={startDate}
            endDate={endDate}
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {report && <ReportSections report={report} />}
    </div>
  )
}

export function ReportSections({ report }: { report: Record<string, unknown> }) {
  const adherence = (report.medication_adherence ?? {}) as Record<string, unknown>
  const vitals = (report.vitals_summary ?? {}) as Record<string, unknown>
  const lifestyle = (report.lifestyle_insights ?? {}) as Record<string, unknown>
  const symptoms = (report.patient_symptoms ?? []) as Array<Record<string, unknown>>
  const flags = (report.recommendation_flags ?? []) as Array<Record<string, unknown>>
  const transparency = (report.data_transparency ?? {}) as Record<string, unknown>
  const vitalsReadings = (vitals.readings ?? {}) as Record<string, Record<string, unknown>>

  return (
    <div className="space-y-5 print-full-width">
      {/* Medication Adherence */}
      <ReportCard title="Medication Adherence" icon="💊">
        <div className="flex items-baseline gap-2 mb-4">
          <span style={{ fontSize: '56px', fontWeight: 700, color: NAVY, lineHeight: 1 }}>
            {String(adherence.overall_pct ?? 0)}%
          </span>
          <span className="text-gray-400 text-sm">
            ({String(adherence.taken_doses ?? 0)}/{String(adherence.total_doses ?? 0)} doses taken)
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2.5 mb-4">
          <div
            className="h-2.5 rounded-full transition-all"
            style={{
              width: `${Math.min(Number(adherence.overall_pct ?? 0), 100)}%`,
              background: NAVY,
            }}
          />
        </div>
        {Object.entries(
          (adherence.per_medication ?? {}) as Record<string, Record<string, unknown>>
        ).map(([name, data]) => (
          <div
            key={name}
            className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0"
          >
            <div>
              <p className="font-medium text-gray-800 text-sm">{name}</p>
              {((data.barriers as string[]) ?? []).length > 0 && (
                <p className="text-xs text-amber-600 mt-0.5">
                  Barrier: {(data.barriers as string[]).join(', ')}
                </p>
              )}
            </div>
            <span className="text-sm font-semibold text-gray-600">
              {String(data.adherence_pct ?? 0)}%
            </span>
          </div>
        ))}
      </ReportCard>

      {/* Vitals Summary */}
      <ReportCard title="Vitals Summary" icon="📊">
        <div className="space-y-3">
          {Object.entries(vitalsReadings).map(([vtype, data]) => (
            <div key={vtype} className="flex justify-between items-center">
              <p className="text-sm text-gray-700">
                {vtype.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </p>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">
                  {String(data.avg ?? '—')} {String(data.unit ?? '')}
                </p>
                <p className="text-xs text-gray-400">
                  {String(data.min ?? '—')}–{String(data.max ?? '—')} ·{' '}
                  {String(data.count ?? 0)} readings
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Vitals at a Glance gauge block */}
        {Object.keys(vitalsReadings).length > 0 && (
          <VitalsGaugeBlock readings={vitalsReadings} />
        )}

        {((vitals.anomalies ?? []) as Array<Record<string, unknown>>).length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-medium text-red-600 uppercase tracking-wide">Anomalies</p>
            {((vitals.anomalies ?? []) as Array<Record<string, unknown>>).map((a, i) => (
              <div
                key={i}
                className="bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-sm text-red-700"
              >
                {String(a.description ?? '')}
              </div>
            ))}
          </div>
        )}
      </ReportCard>

      {/* Lifestyle Insights */}
      <ReportCard title="Lifestyle &amp; Behavioural Insights" icon="🌿">
        <div className="prose prose-sm max-w-none text-gray-700 text-sm leading-relaxed">
          <ReactMarkdown>
            {String(lifestyle.summary ?? 'No lifestyle data available.')}
          </ReactMarkdown>
        </div>
      </ReportCard>

      {/* Patient-Reported Symptoms */}
      <ReportCard title="Patient-Reported Symptoms" icon="🗣">
        {symptoms.length === 0 ? (
          <p className="text-gray-400 text-sm">No symptoms reported this period.</p>
        ) : (
          <div className="space-y-2">
            {symptoms.map((s, i) => (
              <div
                key={i}
                className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0"
              >
                <p className="font-medium text-gray-800 text-sm capitalize">
                  {String(s.symptom ?? '')}
                </p>
                <div className="text-right">
                  <span
                    className="text-xs px-2.5 py-1 rounded-full font-medium"
                    style={{ background: NAVY_LIGHT, color: NAVY_TEXT }}
                  >
                    {String(s.frequency ?? 1)}x
                  </span>
                  {s.last_mentioned != null && (
                    <p className="text-xs text-gray-400 mt-1">
                      {String(s.last_mentioned).slice(0, 10)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </ReportCard>

      {/* Recommendation Flags — hidden entirely when empty */}
      {flags.length === 0 ? null : (
        <ReportCard title="Recommendation Flags" icon="🚩">
          <div className="space-y-3">
            {flags.map((f, i) => {
              const ftype = String(f.type ?? 'discuss')
              const flagConfig = FLAG_CONFIG[ftype] ?? FLAG_CONFIG.discuss
              return (
                <div
                  key={i}
                  className={`rounded-lg px-4 py-3 flex items-start gap-3 ${flagConfig.bg}`}
                >
                  <span className="text-lg leading-none mt-0.5">{flagConfig.icon}</span>
                  <div className="flex-1">
                    <p
                      className={`text-xs font-bold uppercase tracking-wide mb-1 ${flagConfig.label}`}
                    >
                      {ftype}
                    </p>
                    <p className={`text-sm ${flagConfig.text}`}>{String(f.description ?? '')}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Source: {String(f.source ?? '')} · Confidence:{' '}
                      {Math.round(Number(f.confidence ?? 0) * 100)}%
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </ReportCard>
      )}

      {/* Data Transparency */}
      <details
        className="bg-white border border-gray-100 overflow-hidden"
        style={{ borderRadius: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
      >
        <summary className="px-5 py-4 cursor-pointer font-semibold text-gray-700 flex items-center gap-2 hover:bg-gray-50 select-none">
          <span>🔍</span> Data Transparency
        </summary>
        <div className="px-5 pb-5 border-t border-gray-50">
          <p className="text-sm text-gray-600 mt-3">
            <strong>Sources used:</strong>{' '}
            {((transparency.sources_used ?? []) as string[]).join(', ')}
          </p>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            {String(transparency.confidence_notes ?? '')}
          </p>
        </div>
      </details>
    </div>
  )
}

const FLAG_CONFIG: Record<string, { bg: string; icon: string; label: string; text: string }> = {
  review: {
    bg: 'bg-amber-50 border border-amber-100',
    icon: '⚠',
    label: 'text-amber-700',
    text: 'text-amber-900',
  },
  positive: {
    bg: 'bg-green-50 border border-green-100',
    icon: '✓',
    label: 'text-green-700',
    text: 'text-green-900',
  },
  discuss: {
    bg: 'bg-blue-50 border border-blue-100',
    icon: '📋',
    label: 'text-blue-700',
    text: 'text-blue-900',
  },
}

function ReportCard({
  title,
  icon,
  children,
}: {
  title: string
  icon: string
  children: React.ReactNode
}) {
  return (
    <div
      className="bg-white border border-gray-100 p-5"
      style={{ borderRadius: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
    >
      <h2 className="font-semibold text-gray-800 flex items-center gap-2 mb-4">
        <span>{icon}</span> {title}
      </h2>
      {children}
    </div>
  )
}
