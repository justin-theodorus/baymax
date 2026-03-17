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
    <div style={{ minHeight: '100vh', background: '#F7F5F2', display: 'flex', flexDirection: 'column' }}>
      <ClinicianNav />
      <main className="flex-1">
        {children}
      </main>
    </div>
  )
}
