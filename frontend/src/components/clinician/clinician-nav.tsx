'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const BLUE = '#4894fe'
const GRAY = '#9ca3af'

const HomeIcon = ({ active }: { active: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? BLUE : GRAY}>
    <path fillRule="evenodd" d="M8.25 6.75a3.75 3.75 0 117.5 0 3.75 3.75 0 01-7.5 0zM15.75 9.75a3 3 0 116 0 3 3 0 01-6 0zM2.25 9.75a3 3 0 116 0 3 3 0 01-6 0zM6.31 15.117A6.745 6.745 0 0112 12a6.745 6.745 0 016.709 7.498.75.75 0 01-.372.568A12.696 12.696 0 0112 21.75c-2.305 0-4.47-.612-6.337-1.684a.75.75 0 01-.372-.568 6.787 6.787 0 011.019-4.38z" clipRule="evenodd" />
    <path d="M5.082 14.254a8.287 8.287 0 00-1.308 5.135 9.687 9.687 0 01-1.764-.44l-.115-.04a.563.563 0 01-.373-.487l-.01-.121a3.75 3.75 0 013.57-4.047zM20.226 19.389a8.287 8.287 0 00-1.308-5.135 3.75 3.75 0 013.57 4.047l-.01.121a.563.563 0 01-.373.486l-.115.04c-.567.2-1.156.349-1.764.441z" />
  </svg>
)

const ReportIcon = ({ active }: { active: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? BLUE : GRAY}>
    <path fillRule="evenodd" d="M5.625 1.5c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V12.75A3.75 3.75 0 0016.5 9h-1.875a1.875 1.875 0 01-1.875-1.875V5.25A3.75 3.75 0 009 1.5H5.625zM7.5 15a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5A.75.75 0 017.5 15zm.75-6.75a.75.75 0 000 1.5H12a.75.75 0 000-1.5H8.25z" clipRule="evenodd" />
    <path d="M12.971 1.816A5.23 5.23 0 0114.25 5.25v1.875c0 .207.168.375.375.375H16.5a5.23 5.23 0 013.434 1.279 9.768 9.768 0 00-6.963-6.963z" />
  </svg>
)

const tabs = [
  { href: '/clinician', label: 'Patients', Icon: HomeIcon, exact: true },
  { href: '/clinician/report', label: 'Reports', Icon: ReportIcon, exact: false },
]

export function ClinicianNav() {
  const pathname = usePathname()
  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname.startsWith(href)

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex justify-center">
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
                <div className="flex items-center gap-2 bg-[#eef6ff] rounded-[15px] px-4 py-3">
                  <Icon active />
                  <span className="text-[#4894fe] font-medium text-base">{label}</span>
                </div>
              ) : (
                <Icon active={false} />
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
