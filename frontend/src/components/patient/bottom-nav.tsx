'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const BLUE = '#4894fe'
const GRAY = '#9ca3af'

const HomeIcon = ({ active }: { active: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? BLUE : GRAY}>
    <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
  </svg>
)

const MedsIcon = ({ active }: { active: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? BLUE : GRAY}>
    <path fillRule="evenodd" d="M6.25 6.375a4.125 4.125 0 118.25 0 4.125 4.125 0 01-8.25 0zM3.25 19.125a7.125 7.125 0 0114.25 0v.003l-.001.119a.75.75 0 01-.363.63 13.067 13.067 0 01-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 01-.364-.63l-.001-.122zM19.75 7.5a.75.75 0 00-1.5 0v2.25H16a.75.75 0 000 1.5h2.25v2.25a.75.75 0 001.5 0v-2.25H22a.75.75 0 000-1.5h-2.25V7.5z" clipRule="evenodd" />
  </svg>
)

const SparkleIcon = ({ active }: { active: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? BLUE : GRAY}>
    <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423L16.5 15.75l.394 1.183a2.25 2.25 0 001.423 1.423L19.5 18.75l-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
  </svg>
)

const tabs = [
  { href: '/patient', label: 'Home', Icon: HomeIcon, exact: true },
  { href: '/patient/medications', label: 'Meds', Icon: MedsIcon, exact: false },
  { href: '/patient/chat', label: 'Baymax', Icon: SparkleIcon, exact: false },
]

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function BottomNav({ language = 'en' }: { language?: 'en' | 'zh' }) {
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
