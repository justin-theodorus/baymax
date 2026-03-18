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
    <div className="flex flex-col min-h-screen bg-[#f5f5f5]">
      <div className="flex-1 overflow-y-auto pb-[100px]">
        <div className="mx-auto max-w-[600px] bg-white min-h-screen">
          {children}
        </div>
      </div>
      <ClinicianNav />
    </div>
  )
}
