import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function CaregiverHome() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/caregiver/login')
  }

  return (
    <main className="min-h-screen bg-emerald-50 flex flex-col items-center justify-center p-6">
      <div className="text-center">
        <div className="text-5xl mb-4">💚</div>
        <h1 className="text-3xl font-bold text-emerald-700 mb-2">Caregiver Dashboard</h1>
        <p className="text-xl text-gray-600">Full dashboard coming in Phase 6.</p>
      </div>
    </main>
  )
}
