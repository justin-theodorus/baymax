import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { DateRangeControls, PdfExportButton, ReportSections } from './report-client'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface ReportPageProps {
  params: { patientId: string }
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

export default async function ReportPage({ params }: ReportPageProps) {
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
    <main className="bg-white min-h-screen">
      {/* Header */}
      <div className="px-8 pt-16 pb-4">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-[#b4b4b4] mb-4">
          <Link href="/clinician" className="hover:text-[#4894fe] transition-colors">
            Patients
          </Link>
          <span>/</span>
          <span className="text-[#8f8f8f]">{patient.name}</span>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-black text-2xl font-bold">{patient.name}</p>
            <p className="text-[#8f8f8f] text-base mt-1">
              Age {patient.age} · {(patient.conditions ?? []).join(', ')}
            </p>
            {generatedAt && (
              <p className="text-[#b4b4b4] text-sm mt-1">
                Report generated {generatedAt} · Period: {periodStart} – {periodEnd}
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
      </div>

      <div className="flex flex-col gap-5 px-8 pb-8">
        {/* AI disclaimer */}
        <div className="bg-[#f5f5f5] rounded-[20px] px-5 py-4 flex items-start gap-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#F4A261" className="flex-shrink-0 mt-0.5">
            <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
          </svg>
          <p className="text-[#8f8f8f] text-sm leading-relaxed">
            <span className="font-semibold text-[#464646]">AI-Generated Summary</span> — for clinical review only, not a clinical record. All findings require professional clinical judgement before action.
          </p>
        </div>

        {/* Date range customizer */}
        <DateRangeControls patientId={patientId} accessToken={session.access_token} />

        {/* Default report (last 7 days) */}
        {report ? (
          <>
            <p className="text-[#b4b4b4] text-xs font-semibold uppercase tracking-wider">
              Default Report — Last 7 days
            </p>
            <ReportSections report={report} />
          </>
        ) : (
          <div className="bg-[#f5f5f5] rounded-[20px] p-10 text-center">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-[#8f8f8f] text-base">Could not load the report. The patient may have insufficient data.</p>
          </div>
        )}
      </div>
    </main>
  )
}
