'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const CORAL = '#E8634A'

const tabs = [
  {
    href: '/patient',
    label: 'Home',
    labelZh: '主页',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="30" height="30">
        <path d="M11.47 3.841a.75.75 0 0 1 1.06 0l8.69 8.69a.75.75 0 1 0 1.06-1.061l-8.689-8.69a2.25 2.25 0 0 0-3.182 0l-8.69 8.69a.75.75 0 1 0 1.061 1.06l8.69-8.689Z" />
        <path d="m12 5.432 8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 0 1-.75-.75v-4.5a.75.75 0 0 0-.75-.75h-3a.75.75 0 0 0-.75.75V21a.75.75 0 0 1-.75.75H5.625a1.875 1.875 0 0 1-1.875-1.875v-6.198a2.29 2.29 0 0 0 .091-.086L12 5.432Z" />
      </svg>
    ),
  },
  {
    href: '/patient/medications',
    label: 'Medications',
    labelZh: '药物',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="30" height="30">
        <path d="M6.25 6.375a4.125 4.125 0 1 1 8.25 0 4.125 4.125 0 0 1-8.25 0ZM3.25 19.125a7.125 7.125 0 0 1 14.25 0v.003l-.001.119a.75.75 0 0 1-.363.63 13.067 13.067 0 0 1-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 0 1-.364-.63l-.001-.122ZM19.75 7.5a.75.75 0 0 0-1.5 0v2.25H16a.75.75 0 0 0 0 1.5h2.25v2.25a.75.75 0 0 0 1.5 0v-2.25H22a.75.75 0 0 0 0-1.5h-2.25V7.5Z" />
      </svg>
    ),
  },
  {
    href: '/patient/history',
    label: 'History',
    labelZh: '记录',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="30" height="30">
        <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12.75 6a.75.75 0 0 0-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 0 0 0-1.5h-3.75V6Z" clipRule="evenodd" />
      </svg>
    ),
  },
]

interface BottomNavProps {
  language?: 'en' | 'zh'
}

export function BottomNav({ language = 'en' }: BottomNavProps) {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === '/patient') return pathname === '/patient'
    return pathname.startsWith(href)
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white flex items-stretch z-50"
      style={{ minHeight: '72px', borderTop: '1px solid #e5e7eb' }}
    >
      {tabs.map((tab) => {
        const active = isActive(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="flex-1 flex flex-col items-center justify-center gap-1 transition-colors"
            style={{
              minHeight: '72px',
              minWidth: '48px',
              color: active ? CORAL : '#9ca3af',
              position: 'relative',
            }}
          >
            {active && (
              <div style={{
                position: 'absolute',
                top: '6px',
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: CORAL,
              }} />
            )}
            <span>{tab.icon}</span>
            <span style={{ fontSize: '14px', fontWeight: active ? 600 : 400 }}>
              {language === 'zh' ? tab.labelZh : tab.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
