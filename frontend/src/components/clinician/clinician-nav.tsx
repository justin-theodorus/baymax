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
    <header className="bg-violet-800 text-white shadow-md">
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold">Baymax</span>
            <span className="text-violet-200 text-sm font-normal">Clinician</span>
          </div>

          <nav className="hidden sm:flex items-center gap-1">
            {navLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive(link.href)
                    ? 'bg-violet-700 text-white'
                    : 'text-violet-200 hover:bg-violet-700 hover:text-white'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <button
            onClick={handleSignOut}
            className="text-violet-200 hover:text-white text-sm px-3 py-2 rounded-lg hover:bg-violet-700 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
}
