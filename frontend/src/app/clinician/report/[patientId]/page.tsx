import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { DateRangeControls, PdfExportButton, ReportSections } from './report-client'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface ReportPageProps {
  params: { patientId: string }
  searchParams: { view?: string }
}

async function fetchReport(patientId: string, accessToken: string) {
  try {
    const res = await fetch(`${API_BASE}/api/clinician/${patientId}/report`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

async function fetchPatient(patientId: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('patients')
    .select('id, name, age, conditions, language_pref')
    .eq('id', patientId)
    .single()
  return data
}

export default async function ReportPage({ params, searchParams }: ReportPageProps) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) redirect('/clinician/login')

  const { patientId } = params
  const [patient, reportData] = await Promise.all([
    fetchPatient(patientId),
    fetchReport(patientId, session.access_token),
  ])

  if (!patient) notFound()

  const report = reportData?.report
  const header = report?.header ?? {}
  const generatedAt = header.generated_at
    ? new Date(String(header.generated_at)).toLocaleString('en-SG', {
        dateStyle: 'medium', timeStyle: 'short',
      })
    : null

  const periodStart = header.period_start ? String(header.period_start).slice(0, 10) : ''
  const periodEnd = header.period_end ? String(header.period_end).slice(0, 10) : ''

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link href="/clinician" className="hover:text-violet-600 transition-colors">
          Patients
        </Link>
        <span>/</span>
        <span className="text-gray-700">{patient.name}</span>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{patient.name}</h1>
          <p className="text-gray-500 text-sm mt-1">
            Age {patient.age} · {(patient.conditions ?? []).join(', ')}
          </p>
          {generatedAt && (
            <p className="text-gray-400 text-xs mt-1">
              Report generated {generatedAt} UTC · Period: {periodStart} – {periodEnd}
            </p>
          )}
        </div>
        <PdfExportButton
          patientId={patientId}
          accessToken={session.access_token}
          startDate=""
          endDate=""
        />
      </div>

      {/* AI disclaimer */}
      <div className="bg-amber-50 border-2 border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
        <span className="text-lg leading-none mt-0.5">⚠</span>
        <span>
          <strong>AI-Generated Summary</strong> — for clinical review only, not a clinical record.
          All findings require professional clinical judgement before action.
        </span>
      </div>

      {/* Date range customizer */}
      <DateRangeControls patientId={patientId} accessToken={session.access_token} />

      {/* Default report (last 7 days) */}
      {report ? (
        <>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">
            Default report — last 7 days
          </p>
          <ReportSections report={report} />
        </>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-gray-500">Could not load the report. The patient may have insufficient data.</p>
        </div>
      )}
    </div>
  )
}
