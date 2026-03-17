'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const navLinks = [
  { href: '/caregiver', label: 'Dashboard' },
  { href: '/caregiver/alerts', label: 'Alerts' },
  { href: '/caregiver/digest', label: 'Weekly Digest' },
]

export function CaregiverNav() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/caregiver/login')
  }

  const isActive = (href: string) => {
    if (href === '/caregiver') return pathname === '/caregiver'
    return pathname.startsWith(href)
  }

  return (
    <header style={{ background: '#2D6A4F', color: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}>
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold">Baymax</span>
            <span className="text-emerald-200 text-sm font-normal">Caregiver</span>
          </div>

          <nav className="hidden sm:flex items-center gap-1">
            {navLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive(link.href)
                    ? 'bg-[#235a3f] text-white'
                    : 'text-green-100 hover:bg-[#235a3f] hover:text-white'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <button
            onClick={handleSignOut}
            className="text-green-100 hover:text-white text-sm px-3 py-2 rounded-lg hover:bg-[#235a3f] transition-colors"
          >
            Sign out
          </button>
        </div>

        {/* Mobile nav */}
        <nav className="sm:hidden flex gap-1 pb-2 overflow-x-auto">
          {navLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={`shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive(link.href)
                  ? 'bg-[#235a3f] text-white'
                  : 'text-green-100 hover:bg-[#235a3f] hover:text-white'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}
