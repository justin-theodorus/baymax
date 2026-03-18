import { CaregiverNav } from '@/components/caregiver/caregiver-nav'

export default function CaregiverLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[#f5f5f5] md:bg-white">
      <CaregiverNav />
      <div className="flex-1 md:ml-64 overflow-y-auto pb-[100px] md:pb-0">
        <div className="mx-auto max-w-[600px] md:max-w-none bg-white min-h-screen">
          {children}
        </div>
      </div>
    </div>
  )
}
