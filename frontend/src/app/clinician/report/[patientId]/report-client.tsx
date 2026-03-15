'use client'

import { useState } from 'react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface ReportClientProps {
  patientId: string
  accessToken: string
  report: Record<string, unknown>
}

export function PdfExportButton({ patientId, accessToken, startDate, endDate }: {
  patientId: string
  accessToken: string
  startDate: string
  endDate: string
}) {
  const [isLoading, setIsLoading] = useState(false)

  const handleExport = async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (startDate) params.set('start_date', startDate)
      if (endDate) params.set('end_date', endDate)
      const res = await fetch(
        `${API_BASE}/api/clinician/${patientId}/report/pdf?${params.toString()}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `baymax_report_${patientId}_${new Date().toISOString().slice(0, 10)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('PDF export failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={isLoading}
      className="flex items-center gap-2 bg-violet-700 hover:bg-violet-800 disabled:bg-violet-400 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
    >
      {isLoading ? (
        <>
          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          Generating…
        </>
      ) : (
        <>⬇ Export PDF</>
      )}
    </button>
  )
}

export function DateRangeControls({ patientId, accessToken }: {
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
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <p className="text-sm font-medium text-gray-600 mb-3">Custom Date Range</p>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">From</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">To</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
          </div>
          <button
            onClick={handleFetch}
            disabled={isRefreshing}
            className="bg-violet-100 hover:bg-violet-200 text-violet-800 text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
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
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{error}</div>
      )}

      {report && <ReportSections report={report} />}
    </div>
  )
}

export function ReportSections({ report }: { report: Record<string, unknown> }) {
  const header = (report.header ?? {}) as Record<string, unknown>
  const adherence = (report.medication_adherence ?? {}) as Record<string, unknown>
  const vitals = (report.vitals_summary ?? {}) as Record<string, unknown>
  const lifestyle = (report.lifestyle_insights ?? {}) as Record<string, unknown>
  const symptoms = (report.patient_symptoms ?? []) as Array<Record<string, unknown>>
  const flags = (report.recommendation_flags ?? []) as Array<Record<string, unknown>>
  const transparency = (report.data_transparency ?? {}) as Record<string, unknown>

  return (
    <div className="space-y-5">
      {/* Medication Adherence */}
      <ReportCard title="Medication Adherence" icon="💊">
        <div className="flex items-baseline gap-2 mb-4">
          <span className="text-4xl font-bold text-violet-700">{String(adherence.overall_pct ?? 0)}%</span>
          <span className="text-gray-400 text-sm">
            ({String(adherence.taken_doses ?? 0)}/{String(adherence.total_doses ?? 0)} doses taken)
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2.5 mb-4">
          <div
            className="bg-violet-500 h-2.5 rounded-full transition-all"
            style={{ width: `${Math.min(Number(adherence.overall_pct ?? 0), 100)}%` }}
          />
        </div>
        {Object.entries((adherence.per_medication ?? {}) as Record<string, Record<string, unknown>>).map(([name, data]) => (
          <div key={name} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
            <div>
              <p className="font-medium text-gray-800 text-sm">{name}</p>
              {(data.barriers as string[] ?? []).length > 0 && (
                <p className="text-xs text-amber-600 mt-0.5">Barrier: {(data.barriers as string[]).join(', ')}</p>
              )}
            </div>
            <span className="text-sm font-semibold text-gray-600">{String(data.adherence_pct ?? 0)}%</span>
          </div>
        ))}
      </ReportCard>

      {/* Vitals Summary */}
      <ReportCard title="Vitals Summary" icon="📊">
        <div className="space-y-3">
          {Object.entries((vitals.readings ?? {}) as Record<string, Record<string, unknown>>).map(([vtype, data]) => (
            <div key={vtype} className="flex justify-between items-center">
              <p className="text-sm text-gray-700">{vtype.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</p>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">
                  {String(data.avg ?? '—')} {String(data.unit ?? '')}
                </p>
                <p className="text-xs text-gray-400">
                  {String(data.min ?? '—')}–{String(data.max ?? '—')} · {String(data.count ?? 0)} readings
                </p>
              </div>
            </div>
          ))}
        </div>
        {((vitals.anomalies ?? []) as Array<Record<string, unknown>>).length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-medium text-red-600 uppercase tracking-wide">Anomalies</p>
            {((vitals.anomalies ?? []) as Array<Record<string, unknown>>).map((a, i) => (
              <div key={i} className="bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-sm text-red-700">
                {String(a.description ?? '')}
              </div>
            ))}
          </div>
        )}
      </ReportCard>

      {/* Lifestyle Insights */}
      <ReportCard title="Lifestyle &amp; Behavioural Insights" icon="🌿">
        <p className="text-gray-700 text-sm leading-relaxed">{String(lifestyle.summary ?? 'No lifestyle data available.')}</p>
      </ReportCard>

      {/* Patient-Reported Symptoms */}
      <ReportCard title="Patient-Reported Symptoms" icon="🗣">
        {symptoms.length === 0 ? (
          <p className="text-gray-400 text-sm">No symptoms reported this period.</p>
        ) : (
          <div className="space-y-2">
            {symptoms.map((s, i) => (
              <div key={i} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                <p className="font-medium text-gray-800 text-sm capitalize">{String(s.symptom ?? '')}</p>
                <div className="text-right">
                  <span className="text-xs bg-violet-50 text-violet-700 px-2.5 py-1 rounded-full font-medium">
                    {String(s.frequency ?? 1)}x
                  </span>
                  {s.last_mentioned && (
                    <p className="text-xs text-gray-400 mt-1">{String(s.last_mentioned).slice(0, 10)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </ReportCard>

      {/* Recommendation Flags */}
      <ReportCard title="Recommendation Flags" icon="🚩">
        {flags.length === 0 ? (
          <p className="text-gray-400 text-sm">No recommendation flags generated.</p>
        ) : (
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
                    <p className={`text-xs font-bold uppercase tracking-wide mb-1 ${flagConfig.label}`}>
                      {ftype}
                    </p>
                    <p className={`text-sm ${flagConfig.text}`}>{String(f.description ?? '')}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Source: {String(f.source ?? '')} · Confidence: {Math.round(Number(f.confidence ?? 0) * 100)}%
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </ReportCard>

      {/* Data Transparency */}
      <details className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
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

function ReportCard({ title, icon, children }: {
  title: string
  icon: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <h2 className="font-semibold text-gray-800 flex items-center gap-2 mb-4">
        <span>{icon}</span> {title}
      </h2>
      {children}
    </div>
  )
}
