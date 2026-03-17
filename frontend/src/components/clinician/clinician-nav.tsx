'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const navLinks = [
  { href: '/clinician', label: 'Patients' },
]

export function ClinicianNav() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/clinician/login')
  }

  const isActive = (href: string) => {
    if (href === '/clinician') return pathname === '/clinician'
    return pathname.startsWith(href)
  }

  return (
    <header style={{ background: '#3B4F7A', color: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}>
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold">Baymax</span>
            <span className="text-blue-200 text-sm font-normal">Clinician</span>
          </div>

          <nav className="hidden sm:flex items-center gap-1">
            {navLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive(link.href)
                    ? 'bg-[#2d3f62] text-white'
                    : 'text-blue-200 hover:bg-[#2d3f62] hover:text-white'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <button
            onClick={handleSignOut}
            className="text-blue-200 hover:text-white text-sm px-3 py-2 rounded-lg hover:bg-[#2d3f62] transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
}
