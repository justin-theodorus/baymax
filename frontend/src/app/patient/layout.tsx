import { BottomNav } from '@/components/patient/bottom-nav'

export default function PatientLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col" style={{ minHeight: '100dvh' }}>
      <div className="flex-1 overflow-hidden pb-[72px]">
        {children}
      </div>
      <BottomNav />
    </div>
  )
}
