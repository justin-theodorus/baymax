'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  {
    href: '/patient',
    label: 'Home',
    labelZh: '主页',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
        <path d="M4.5 6.375a4.125 4.125 0 1 1 8.25 0 4.125 4.125 0 0 1-8.25 0ZM14.25 8.625a3.375 3.375 0 1 1 6.75 0 3.375 3.375 0 0 1-6.75 0ZM1.5 19.125a7.125 7.125 0 0 1 14.25 0v.003l-.001.119a.75.75 0 0 1-.363.63 13.067 13.067 0 0 1-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 0 1-.364-.63l-.001-.122ZM17.25 19.128l-.001.144a2.25 2.25 0 0 1-.233.96 10.088 10.088 0 0 0 5.06-1.01.75.75 0 0 0 .42-.643 4.875 4.875 0 0 0-6.957-4.611 8.586 8.586 0 0 1 1.71 5.157v.003Z" />
      </svg>
    ),
  },
  {
    href: '/patient/medications',
    label: 'Medications',
    labelZh: '药物',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
        <path fillRule="evenodd" d="M11.484 2.17a.75.75 0 0 1 1.032 0 11.209 11.209 0 0 0 7.877 3.08.75.75 0 0 1 .722.515 12.74 12.74 0 0 1 .635 3.985c0 10.147-6.397 18.85-15.25 22.243a.75.75 0 0 1-.522 0C3.015 29.164-3.382 20.46-3.382 10.313c0-1.39.124-2.75.365-3.985a.75.75 0 0 1 .722-.515 11.209 11.209 0 0 0 7.877-3.08 11.245 11.245 0 0 0 6.02 3.081Z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    href: '/patient/history',
    label: 'History',
    labelZh: '记录',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
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
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex items-stretch z-50 safe-area-bottom"
      style={{ minHeight: '72px' }}
    >
      {tabs.map((tab) => {
        const active = isActive(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
              active ? 'text-sky-600' : 'text-gray-400 hover:text-gray-600'
            }`}
            style={{ minHeight: '72px', minWidth: '48px' }}
          >
            <span className={`${active ? 'text-sky-600' : 'text-gray-400'}`}>
              {tab.icon}
            </span>
            <span
              style={{ fontSize: '13px', fontWeight: active ? 600 : 400 }}
              className={active ? 'text-sky-600' : 'text-gray-400'}
            >
              {language === 'zh' ? tab.labelZh : tab.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
