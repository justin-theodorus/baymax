import { CaregiverNav } from '@/components/caregiver/caregiver-nav'

export default function CaregiverLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <CaregiverNav />
      <main className="flex-1">
        {children}
      </main>
    </div>
  )
}
