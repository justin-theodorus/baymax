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
    <main className="bg-white min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-8 pt-16 pb-4">
        <div>
          <p className="text-[#8f8f8f] text-lg font-medium">Good Afternoon</p>
          <p className="text-black text-2xl font-bold">Doctor!</p>
        </div>
        <div className="w-[60px] h-[60px] rounded-full bg-[#4894fe] flex items-center justify-center flex-shrink-0">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
            <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
          </svg>
        </div>
      </div>

      <div className="flex flex-col gap-6 px-8 pb-8">
        {/* My Patients card */}
        <div className="bg-white rounded-[20px] shadow-[0px_0px_100px_0px_rgba(0,0,0,0.05)] flex flex-col gap-5 p-6">
          <div className="flex items-center gap-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="#4894fe">
              <path fillRule="evenodd" d="M8.25 6.75a3.75 3.75 0 117.5 0 3.75 3.75 0 01-7.5 0zM15.75 9.75a3 3 0 116 0 3 3 0 01-6 0zM2.25 9.75a3 3 0 116 0 3 3 0 01-6 0zM6.31 15.117A6.745 6.745 0 0112 12a6.745 6.745 0 016.709 7.498.75.75 0 01-.372.568A12.696 12.696 0 0112 21.75c-2.305 0-4.47-.612-6.337-1.684a.75.75 0 01-.372-.568 6.787 6.787 0 011.019-4.38z" clipRule="evenodd" />
              <path d="M5.082 14.254a8.287 8.287 0 00-1.308 5.135 9.687 9.687 0 01-1.764-.44l-.115-.04a.563.563 0 01-.373-.487l-.01-.121a3.75 3.75 0 013.57-4.047zM20.226 19.389a8.287 8.287 0 00-1.308-5.135 3.75 3.75 0 013.57 4.047l-.01.121a.563.563 0 01-.373.486l-.115.04c-.567.2-1.156.349-1.764.441z" />
            </svg>
            <div>
              <p className="text-black text-xl font-bold">My Patients</p>
              <p className="text-[#8f8f8f] text-sm">Select a patient to view their AI-generated clinical summary</p>
            </div>
          </div>

          {/* Disclaimer */}
          <div className="bg-[#f5f5f5] rounded-[15px] px-4 py-3 flex items-start gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#F4A261" className="flex-shrink-0 mt-0.5">
              <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
            </svg>
            <p className="text-[#8f8f8f] text-sm leading-relaxed">
              <span className="font-semibold text-[#464646]">AI-Generated Summaries</span> — All reports are AI-derived from patient data. For informational review only, not a clinical record.
            </p>
          </div>

          {/* Patient list */}
          {patients.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-[#b4b4b4] text-base">No patients assigned to your panel yet.</p>
              <p className="text-[#b4b4b4] text-sm mt-1">Contact your administrator to have patients linked.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {patients.map(patient => (
                <PatientCard key={patient.id} patient={patient} />
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

function PatientCard({ patient }: { patient: PatientSummary }) {
  return (
    <div className="bg-[#4894fe] rounded-[20px] p-5 flex flex-col gap-4">
      {/* Patient info */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-[rgba(255,255,255,0.2)] flex items-center justify-center flex-shrink-0">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
            <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
          </svg>
        </div>
        <div>
          <p className="text-white text-xl font-bold">{patient.name}</p>
          <p className="text-white text-sm opacity-70">
            Age {patient.age} · {LANGUAGE_LABELS[patient.language_pref] ?? patient.language_pref}
          </p>
        </div>
      </div>

      {/* Conditions */}
      <div className="flex flex-wrap gap-2">
        {(patient.conditions ?? []).map(condition => (
          <span
            key={condition}
            className="bg-[rgba(255,255,255,0.2)] text-white text-xs px-3 py-1 rounded-full font-medium"
          >
            {condition}
          </span>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <Link
          href={`/clinician/report/${patient.id}`}
          className="flex-1 bg-white text-[#4894fe] text-sm font-semibold py-3 rounded-[15px] text-center"
          style={{ minHeight: '0', minWidth: '0' }}
        >
          View Report
        </Link>
        <Link
          href={`/clinician/report/${patient.id}?view=flags`}
          className="flex-1 bg-[rgba(255,255,255,0.2)] text-white text-sm font-semibold py-3 rounded-[15px] text-center"
          style={{ minHeight: '0', minWidth: '0' }}
        >
          Quick Flags
        </Link>
      </div>
    </div>
  )
}
