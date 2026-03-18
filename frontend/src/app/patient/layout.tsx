import { BottomNav } from '@/components/patient/bottom-nav'

export default function PatientLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen bg-[#f5f5f5]">
      <div className="flex-1 overflow-y-auto pb-[100px]">
        <div className="mx-auto max-w-[600px] bg-white min-h-screen">
          {children}
        </div>
      </div>
      <BottomNav />
    </div>
  )
}
