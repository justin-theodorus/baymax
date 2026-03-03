'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Mode = 'password' | 'magic-link'

export default function CaregiverLogin() {
  const [mode, setMode] = useState<Mode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSent, setIsSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    if (mode === 'magic-link') {
      const { error: authError } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/caregiver` },
      })
      setIsLoading(false)
      if (authError) { setError(authError.message); return }
      setIsSent(true)
      return
    }

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    setIsLoading(false)
    if (authError) { setError(authError.message); return }
    window.location.href = '/caregiver'
  }

  if (isSent) {
    return (
      <main className="min-h-screen bg-emerald-50 flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-sm text-center">
          <div className="text-5xl mb-4">📧</div>
          <h1 className="text-2xl font-bold text-emerald-700 mb-3">Check your email</h1>
          <p className="text-lg text-gray-600">Sign-in link sent to <strong>{email}</strong>.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-emerald-50 flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">💚</div>
          <h1 className="text-3xl font-bold text-emerald-700">Caregiver Sign In</h1>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-lg font-semibold text-gray-700 mb-1" htmlFor="cg-email">
              Email
            </label>
            <input
              id="cg-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              required
              className="w-full px-4 py-3 text-lg border-2 border-emerald-300 rounded-xl focus:outline-none focus:border-emerald-500 bg-white"
            />
          </div>

          {mode === 'password' && (
            <div>
              <label className="block text-lg font-semibold text-gray-700 mb-1" htmlFor="cg-password">
                Password
              </label>
              <input
                id="cg-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                required
                className="w-full px-4 py-3 text-lg border-2 border-emerald-300 rounded-xl focus:outline-none focus:border-emerald-500 bg-white"
              />
            </div>
          )}

          {error && <p className="text-red-600 text-base">{error}</p>}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-4 text-xl font-bold text-white bg-emerald-500 rounded-xl hover:bg-emerald-600 disabled:opacity-50 transition-colors"
          >
            {isLoading ? 'Signing in…' : mode === 'password' ? 'Sign In' : 'Send magic link'}
          </button>

          <button
            type="button"
            onClick={() => setMode(mode === 'password' ? 'magic-link' : 'password')}
            className="text-emerald-600 underline text-base text-center py-2"
          >
            {mode === 'password' ? 'Use magic link instead' : 'Use password instead'}
          </button>
        </form>
      </div>
    </main>
  )
}
