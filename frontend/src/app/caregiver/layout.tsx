import { CaregiverNav } from '@/components/caregiver/caregiver-nav'

export default function CaregiverLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#F7F5F2', display: 'flex', flexDirection: 'column' }}>
      <CaregiverNav />
      <main className="flex-1">
        {children}
      </main>
    </div>
  )
}
