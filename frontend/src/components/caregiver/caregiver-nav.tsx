'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SidebarAccountMenu } from '@/components/shared/sidebar-account-menu'

const BLUE = '#4894fe'
const GRAY = '#9ca3af'

const HomeIcon = ({ active }: { active: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? BLUE : GRAY}>
    <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
  </svg>
)

const AlertIcon = ({ active }: { active: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? BLUE : GRAY}>
    <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
  </svg>
)

const DigestIcon = ({ active }: { active: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? BLUE : GRAY}>
    <path fillRule="evenodd" d="M5.625 1.5c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V12.75A3.75 3.75 0 0016.5 9h-1.875a1.875 1.875 0 01-1.875-1.875V5.25A3.75 3.75 0 009 1.5H5.625zM7.5 15a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5A.75.75 0 017.5 15zm.75-6.75a.75.75 0 000 1.5H12a.75.75 0 000-1.5H8.25z" clipRule="evenodd" />
    <path d="M12.971 1.816A5.23 5.23 0 0114.25 5.25v1.875c0 .207.168.375.375.375H16.5a5.23 5.23 0 013.434 1.279 9.768 9.768 0 00-6.963-6.963z" />
  </svg>
)

const VitalsIcon = ({ active }: { active: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path
      d="M3.75 12h3.1l2.1-4.2 3.6 8.4 2.1-4.2h5.6"
      stroke={active ? BLUE : GRAY}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const ManageIcon = ({ active }: { active: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? BLUE : GRAY}>
    <path fillRule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 00-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 00-2.282.819l-.922 1.597a1.875 1.875 0 00.432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 000 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 00-.432 2.385l.922 1.597a1.875 1.875 0 002.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.986.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 002.28-.819l.923-1.597a1.875 1.875 0 00-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 000-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 00-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 00-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 00-1.85-1.567h-1.843zM12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" clipRule="evenodd" />
  </svg>
)

const tabs = [
  { href: '/caregiver', label: 'Home', Icon: HomeIcon, exact: true },
  { href: '/caregiver/alerts', label: 'Alert', Icon: AlertIcon, exact: false },
  { href: '/caregiver/vitals', label: 'Vitals', Icon: VitalsIcon, exact: false },
  { href: '/caregiver/digest', label: 'Digest', Icon: DigestIcon, exact: false },
  { href: '/caregiver/manage', label: 'Manage', Icon: ManageIcon, exact: false },
]

export function CaregiverNav() {
  const pathname = usePathname()
  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname.startsWith(href)

  return (
    <>
      {/* Mobile bottom bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex justify-center">
        <div
          className="w-full max-w-[600px] bg-white border-t border-[#e4e4e4] flex items-center justify-around px-4 py-4"
          style={{ minHeight: '80px' }}
        >
          {tabs.map(({ href, label, Icon, exact }) => {
            const active = isActive(href, exact)
            return (
              <Link
                key={href}
                href={href}
                className="flex items-center justify-center"
                style={{ minHeight: '48px', minWidth: '48px' }}
              >
                {active ? (
                  <div className="flex items-center gap-2 bg-[#eef6ff] rounded-[15px] px-3 py-3">
                    <Icon active />
                    <span className="text-[#4894fe] font-medium text-sm whitespace-nowrap">{label}</span>
                  </div>
                ) : (
                  <Icon active={false} />
                )}
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-64 bg-white border-r border-[#e4e4e4] z-50 flex-col">
        <SidebarAccountMenu title="Baymax" subtitle="Caregiver View" />

        {/* Nav items */}
        <nav className="flex flex-col gap-2 px-4 flex-1">
          {tabs.map(({ href, label, Icon, exact }) => {
            const active = isActive(href, exact)
            return (
              <Link
                key={href}
                href={href}
                className={
                  active
                    ? 'flex items-center gap-3 bg-[#eef6ff] rounded-[15px] px-4 py-3 text-[#4894fe] font-medium'
                    : 'flex items-center gap-3 px-4 py-3 text-[#9ca3af]'
                }
              >
                <Icon active={active} />
                <span className="text-base">{label}</span>
              </Link>
            )
          })}
        </nav>
      </aside>
    </>
  )
}
