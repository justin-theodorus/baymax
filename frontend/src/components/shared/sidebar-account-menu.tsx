'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const BLUE = '#4894fe'

export function SidebarAccountMenu({
  title,
  subtitle,
}: {
  title: string
  subtitle: string
}) {
  const router = useRouter()
  const supabase = createClient()
  const [isOpen, setIsOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const handleLogout = async () => {
    if (isLoggingOut) return

    setIsLoggingOut(true)
    try {
      await supabase.auth.signOut()
    } finally {
      router.push('/')
      router.refresh()
      setIsLoggingOut(false)
    }
  }

  return (
    <div className="px-4 pt-6">
      <button
        type="button"
        onClick={() => setIsOpen(open => !open)}
        className="w-full flex items-center gap-3 px-2 py-2 text-left"
        style={{ minHeight: '0', minWidth: '0' }}
        aria-expanded={isOpen}
      >
        <div className="w-11 h-11 rounded-[14px] bg-[#eef6ff] flex items-center justify-center flex-shrink-0">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 12a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5zm-6.75 8.25a6.75 6.75 0 1113.5 0"
              stroke={BLUE}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[#4894fe] text-xl font-bold">{title}</p>
          <p className="text-[#8f8f8f] text-sm mt-1">{subtitle}</p>
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          className={isOpen ? 'rotate-180' : ''}
          style={{ transition: 'transform 0.2s ease' }}
        >
          <path d="M6 9l6 6 6-6" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {isOpen && (
        <div className="mt-3 rounded-[18px] border border-[#e4e4e4] bg-[#f9fafb] px-4 py-4">
          <p className="text-[#464646] text-sm font-semibold">Account</p>
          <p className="text-[#8f8f8f] text-sm mt-1">Sign out and return to the main login page.</p>
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="mt-4 w-full bg-[#4894fe] text-white text-sm font-semibold px-4 py-3 rounded-[14px] disabled:opacity-60"
            style={{ minHeight: '0', minWidth: '0' }}
          >
            {isLoggingOut ? 'Logging Out...' : 'Log Out'}
          </button>
        </div>
      )}
    </div>
  )
}
