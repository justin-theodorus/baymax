import { ClinicianNav } from '@/components/clinician/clinician-nav'

export default function ClinicianLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[#f5f5f5] md:bg-white">
      <ClinicianNav />
      <div className="flex-1 md:ml-64 overflow-y-auto pb-[100px] md:pb-0">
        <div className="mx-auto max-w-[600px] md:max-w-none bg-white min-h-screen">
          {children}
        </div>
      </div>
    </div>
  )
}
