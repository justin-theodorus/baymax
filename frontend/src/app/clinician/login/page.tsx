'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function ClinicianLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    setIsLoading(false)

    if (authError) {
      setError(authError.message)
      return
    }

    window.location.href = '/clinician'
  }

  return (
    <main className="min-h-screen bg-violet-50 flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🩺</div>
          <h1 className="text-3xl font-bold text-violet-700">Clinician Sign In</h1>
          <p className="text-base text-gray-500 mt-1">Admin-provisioned accounts only</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-lg font-semibold text-gray-700 mb-1" htmlFor="cl-email">
              Email
            </label>
            <input
              id="cl-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="doctor@hospital.sg"
              required
              className="w-full px-4 py-3 text-lg border-2 border-violet-300 rounded-xl focus:outline-none focus:border-violet-500 bg-white"
            />
          </div>

          <div>
            <label className="block text-lg font-semibold text-gray-700 mb-1" htmlFor="cl-password">
              Password
            </label>
            <input
              id="cl-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              required
              className="w-full px-4 py-3 text-lg border-2 border-violet-300 rounded-xl focus:outline-none focus:border-violet-500 bg-white"
            />
          </div>

          {error && <p className="text-red-600 text-base">{error}</p>}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-4 text-xl font-bold text-white bg-violet-500 rounded-xl hover:bg-violet-600 disabled:opacity-50 transition-colors"
          >
            {isLoading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </main>
  )
}
