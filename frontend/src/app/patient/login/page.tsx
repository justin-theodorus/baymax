'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function PatientLogin() {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSent, setIsSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  async function handleSendLink(e: React.FormEvent) {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/patient`,
      },
    })

    setIsLoading(false)

    if (authError) {
      setError(authError.message)
      return
    }

    setIsSent(true)
  }

  if (isSent) {
    return (
      <main className="min-h-screen bg-sky-50 flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-sm text-center">
          <div className="text-6xl mb-6">📧</div>
          <h1 className="text-3xl font-bold text-sky-700 mb-4">Check your email</h1>
          <p className="text-xl text-gray-600">
            We sent a sign-in link to <strong>{email}</strong>. Tap the link in your email to sign in.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-sky-50 flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="text-6xl mb-4">🏥</div>
          <h1 className="text-4xl font-bold text-sky-700 mb-2">Baymax</h1>
          <p className="text-2xl text-gray-600">Your Health Companion</p>
        </div>

        <form onSubmit={handleSendLink} className="flex flex-col gap-4">
          <label className="text-2xl font-semibold text-gray-700" htmlFor="email">
            Your email address
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            required
            className="w-full px-5 py-4 text-xl border-2 border-sky-300 rounded-2xl focus:outline-none focus:border-sky-500 bg-white"
            style={{ minHeight: '64px' }}
          />

          {error && (
            <p className="text-red-600 text-lg">{error}</p>
          )}

          <button
            type="submit"
            disabled={isLoading || !email}
            className="w-full py-5 text-2xl font-bold text-white bg-sky-500 rounded-2xl hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            style={{ minHeight: '72px' }}
          >
            {isLoading ? 'Sending…' : 'Send me a sign-in link'}
          </button>
        </form>
      </div>
    </main>
  )
}
