import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function PatientHome() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/patient/login')
  }

  return (
    <main className="min-h-screen bg-sky-50 flex flex-col items-center justify-center p-6">
      <div className="text-center">
        <div className="text-5xl mb-4">👋</div>
        <h1 className="text-3xl font-bold text-sky-700 mb-2">Hello!</h1>
        <p className="text-xl text-gray-600">Patient portal coming in Phase 2.</p>
      </div>
    </main>
  )
}
