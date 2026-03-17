import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

interface PatientSummary {
  id: string
  name: string
  age: number
  conditions: string[]
  language_pref: string
}

async function getClinicianPatients(userId: string): Promise<PatientSummary[]> {
  const supabase = createClient()

  const { data: clinicianData } = await supabase
    .from('clinicians')
    .select('patient_ids')
    .eq('user_id', userId)
    .single()

  const patientIds: string[] = clinicianData?.patient_ids ?? []
  if (!patientIds.length) return []

  const { data: patients } = await supabase
    .from('patients')
    .select('id, name, age, conditions, language_pref')
    .in('id', patientIds)

  return (patients ?? []) as PatientSummary[]
}

const CONDITION_COLORS: Record<string, string> = {
  'Type 2 Diabetes': 'bg-amber-100 text-amber-800',
  Hypertension: 'bg-red-100 text-red-800',
  'Heart Disease': 'bg-rose-100 text-rose-800',
  Asthma: 'bg-blue-100 text-blue-800',
}

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  zh: 'Mandarin',
  ms: 'Malay',
  ta: 'Tamil',
}

export default async function ClinicianHome() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/clinician/login')

  const patients = await getClinicianPatients(user.id)

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Patients</h1>
        <p className="text-gray-500 text-sm mt-1">
          Select a patient to view their AI-generated clinical summary
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
        <span className="text-lg leading-none mt-0.5">⚠</span>
        <span>
          <strong>AI-Generated Summaries</strong> — All reports are AI-derived from patient data.
          They are for informational review only and do not constitute a clinical record.
        </span>
      </div>

      {patients.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <div className="text-5xl mb-4">👩‍⚕️</div>
          <p className="text-gray-500 text-lg">No patients assigned to your panel yet.</p>
          <p className="text-gray-400 text-sm mt-2">Contact your administrator to have patients linked to your account.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {patients.map(patient => (
            <PatientCard key={patient.id} patient={patient} />
          ))}
        </div>
      )}
    </div>
  )
}

function PatientCard({ patient }: { patient: PatientSummary }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-violet-200 transition-all overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-violet-100 flex items-center justify-center text-2xl shrink-0">
              👤
            </div>
            <div>
              <h2 className="font-semibold text-gray-900 text-lg leading-tight">{patient.name}</h2>
              <p className="text-gray-400 text-sm">
                Age {patient.age} · {LANGUAGE_LABELS[patient.language_pref] ?? patient.language_pref}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          {(patient.conditions ?? []).map(condition => (
            <span
              key={condition}
              className={`text-xs px-2.5 py-1 rounded-full font-medium ${CONDITION_COLORS[condition] ?? 'bg-gray-100 text-gray-700'}`}
            >
              {condition}
            </span>
          ))}
        </div>
      </div>

      <div className="border-t border-gray-50 px-5 py-3 bg-gray-50 flex gap-3">
        <Link
          href={`/clinician/report/${patient.id}`}
          className="flex-1 bg-violet-700 hover:bg-violet-800 text-white text-sm font-medium py-2 px-4 rounded-lg text-center transition-colors"
        >
          View Report
        </Link>
        <Link
          href={`/clinician/report/${patient.id}?view=flags`}
          className="flex-1 bg-white hover:bg-gray-100 text-gray-700 text-sm font-medium py-2 px-4 rounded-lg text-center border border-gray-200 transition-colors"
        >
          Quick Flags
        </Link>
      </div>
    </div>
  )
}
