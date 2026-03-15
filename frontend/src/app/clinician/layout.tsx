import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ClinicianNav } from '@/components/clinician/clinician-nav'

export default async function ClinicianLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/clinician/login')
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <ClinicianNav />
      <main className="flex-1">
        {children}
      </main>
    </div>
  )
}
