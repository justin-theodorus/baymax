'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface DigestSummary {
  type: string
  digest_text: string
  adherence_pct: number
  vitals_summary: string
  alert_count: number
}

interface DigestReport {
  id: string
  patient_id: string
  period_start: string
  period_end: string
  summary: DigestSummary
  generated_at: string
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function formatDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-SG', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function renderDigestText(text: string | undefined | null) {
  if (!text) return null
  const lines = text.split('\n').filter(l => l.trim())
  return lines.map((line, i) => {
    const isBullet = line.trim().startsWith('•') || line.trim().startsWith('-') || line.trim().startsWith('*')
    return (
      <li
        key={i}
        className={`text-[#464646] leading-relaxed ${isBullet ? 'list-disc ml-4' : 'list-none'}`}
        style={{ fontSize: '15px' }}
      >
        {isBullet ? line.replace(/^[•\-*]\s*/, '') : line}
      </li>
    )
  })
}

export default function DigestPage() {
  const router = useRouter()
  const supabase = createClient()

  const [patientId, setPatientId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [digest, setDigest] = useState<DigestReport | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState('')
  const [generateMessage, setGenerateMessage] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.push('/caregiver/login')
        return
      }
      setAccessToken(session.access_token)

      try {
        const payload = JSON.parse(atob(session.access_token.split('.')[1]))
        const caregiverId = payload.app_user_id

        const { data: caregiverData } = await supabase
          .from('caregivers')
          .select('patient_ids')
          .eq('id', caregiverId)
          .single()

        const patientIds: string[] = caregiverData?.patient_ids ?? []
        if (patientIds.length) {
          setPatientId(patientIds[0])
        }
      } catch {
        setPatientId('')
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!patientId || !accessToken) return

    const fetchDigest = async () => {
      setIsLoading(true)
      setError('')
      try {
        const res = await fetch(`${API_BASE}/api/caregiver/${patientId}/digest`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        setDigest(data.digest ?? null)
      } catch {
        setError('Failed to load digest.')
      } finally {
        setIsLoading(false)
      }
    }

    fetchDigest()
  }, [patientId, accessToken])

  const handleGenerate = async () => {
    if (isGenerating || !patientId || !accessToken) return
    setIsGenerating(true)
    setGenerateMessage('')
    setError('')

    try {
      const res = await fetch(`${API_BASE}/api/caregiver/${patientId}/digest/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()

      if (data.success) {
        setGenerateMessage('Digest generated and sent to Telegram!')
        const refreshRes = await fetch(`${API_BASE}/api/caregiver/${patientId}/digest`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json()
          setDigest(refreshData.digest ?? null)
        }
      } else {
        setError(data.reason ?? 'Failed to generate digest.')
      }
    } catch {
      setError('Failed to generate digest. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  if (isLoading) {
    return (
      <main className="bg-white min-h-screen px-8 pt-16">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-gray-200 rounded-full" />
          <div className="h-40 bg-gray-200 rounded-[20px]" />
        </div>
      </main>
    )
  }

  return (
    <main className="bg-white min-h-screen">
      {/* Header */}
      <div className="px-8 pt-16 pb-6">
        <p className="text-black text-2xl font-bold">Weekly Digest</p>
        <p className="text-[#8f8f8f] text-base mt-1">AI-generated health summary for your loved one</p>
      </div>

      <div className="flex flex-col gap-5 px-8 pb-8">
        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="bg-[#4894fe] text-white rounded-[20px] px-6 py-4 flex items-center justify-center gap-3 font-semibold text-base transition-opacity disabled:opacity-60"
          style={{ minHeight: '0', minWidth: '0' }}
        >
          {isGenerating ? (
            <>
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
              </svg>
              Generate New Digest
            </>
          )}
        </button>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-[20px] px-5 py-4 text-red-700 text-base">
            {error}
          </div>
        )}

        {generateMessage && (
          <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-[20px] px-5 py-4 text-[#166534] text-base flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path fillRule="evenodd" d="M19.916 4.626a.75.75 0 01.208 1.04l-9 13.5a.75.75 0 01-1.154.114l-6-6a.75.75 0 011.06-1.06l5.353 5.353 8.493-12.74a.75.75 0 011.04-.207z" clipRule="evenodd" />
            </svg>
            {generateMessage}
          </div>
        )}

        {digest ? (
          <>
            {/* Report period card */}
            <div className="bg-[#4894fe] rounded-[20px] p-6 flex flex-col gap-5">
              <div>
                <p className="text-white text-xs font-semibold uppercase tracking-wider opacity-70">Report Period</p>
                <p className="text-white text-xl font-bold mt-1">
                  {formatDateShort(digest.period_start)} — {formatDateShort(digest.period_end)}
                </p>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[rgba(255,255,255,0.2)] rounded-[15px] px-4 py-3">
                  <p className="text-white text-3xl font-bold">
                    {digest.summary.adherence_pct}
                    <span className="text-lg opacity-70">%</span>
                  </p>
                  <p className="text-white text-xs opacity-70 mt-1">Med Adherence</p>
                </div>
                <div className="bg-[rgba(255,255,255,0.2)] rounded-[15px] px-4 py-3">
                  <p className="text-white text-3xl font-bold">{digest.summary.alert_count}</p>
                  <p className="text-white text-xs opacity-70 mt-1">Alerts This Week</p>
                </div>
              </div>

              {/* Vitals section */}
              {digest.summary.vitals_summary && (
                <div className="bg-white rounded-[15px] px-4 py-3">
                  <p className="text-[#8f8f8f] text-xs font-semibold uppercase tracking-wider mb-2">Vitals</p>
                  <p className="text-[#464646] text-sm leading-relaxed">{digest.summary.vitals_summary}</p>
                </div>
              )}
            </div>

            {/* Summary card */}
            <div className="bg-[#f5f5f5] rounded-[20px] p-6">
              <p className="text-black text-base font-bold mb-3">Summary</p>
              <ul className="space-y-2">
                {renderDigestText(digest.summary.digest_text)}
              </ul>
            </div>

            <p className="text-[#b4b4b4] text-xs text-center">
              Generated: {new Date(digest.generated_at).toLocaleString('en-SG')} · AI-Generated Summary — not a clinical record
            </p>
          </>
        ) : (
          <div className="text-center py-16 bg-white rounded-[20px] shadow-[0px_0px_100px_0px_rgba(0,0,0,0.05)]">
            <div className="text-5xl mb-4">📋</div>
            <p className="text-black text-xl font-bold">No digest yet</p>
            <p className="text-[#b4b4b4] text-base mt-2 mb-6">
              Generate a weekly digest to see an AI-powered summary of your loved one&apos;s health.
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
