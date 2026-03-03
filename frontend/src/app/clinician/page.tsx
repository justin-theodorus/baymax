import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function ClinicianHome() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/clinician/login')
  }

  return (
    <main className="min-h-screen bg-violet-50 flex flex-col items-center justify-center p-6">
      <div className="text-center">
        <div className="text-5xl mb-4">🩺</div>
        <h1 className="text-3xl font-bold text-violet-700 mb-2">Clinician View</h1>
        <p className="text-xl text-gray-600">Report viewer coming in Phase 7.</p>
      </div>
    </main>
  )
}
