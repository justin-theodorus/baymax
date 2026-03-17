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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-SG', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
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
        className={`text-gray-700 leading-relaxed ${isBullet ? 'list-disc ml-4' : 'list-none'}`}
        style={{ fontSize: '16px' }}
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
        // Refresh digest
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
      <div className="max-w-4xl mx-auto p-6 space-y-4">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="h-64 bg-gray-200 rounded-2xl animate-pulse" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Weekly Digest</h1>
          <p className="text-gray-500 text-sm mt-1">
            AI-generated health summary for your loved one
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          style={{ padding: '10px 20px', background: '#2D6A4F', color: 'white', borderRadius: '12px', fontSize: '14px', fontWeight: 600, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', opacity: isGenerating ? 0.5 : 1, minHeight: '44px' }}
        >
          {isGenerating ? (
            <>
              <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
              Generating…
            </>
          ) : (
            'Generate New Digest'
          )}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {generateMessage && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-emerald-700 text-sm flex items-center gap-2">
          <span>✓</span> {generateMessage}
        </div>
      )}

      {digest ? (
        <div className="space-y-4">
          {/* Period header */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Report Period</p>
                <p className="text-gray-700 font-medium mt-1">
                  {formatDate(digest.period_start)} — {formatDate(digest.period_end)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full">
                  ⚠ AI-Generated Summary
                </span>
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-4 border-t border-gray-100">
              <div className="text-center">
                <p className="text-3xl font-bold text-gray-800">
                  {digest.summary.adherence_pct}
                  <span className="text-lg text-gray-400">%</span>
                </p>
                <p className="text-xs text-gray-400 mt-1">Med Adherence</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-gray-800">{digest.summary.alert_count}</p>
                <p className="text-xs text-gray-400 mt-1">Alerts This Week</p>
              </div>
              <div className="col-span-2 sm:col-span-1 text-center">
                <p className="text-xs text-gray-600 font-medium">Vitals</p>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                  {digest.summary.vitals_summary || 'No vitals recorded'}
                </p>
              </div>
            </div>
          </div>

          {/* Digest narrative */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-semibold text-gray-800 mb-3">Summary</h2>
            <ul className="space-y-2">
              {renderDigestText(digest.summary.digest_text)}
            </ul>
          </div>

          {/* Generated timestamp */}
          <p className="text-xs text-gray-300 text-center">
            Generated: {new Date(digest.generated_at).toLocaleString('en-SG')} · AI-Generated Summary — not a clinical record
          </p>
        </div>
      ) : (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="text-5xl mb-4">📋</div>
          <p className="text-xl font-semibold text-gray-600">No digest yet</p>
          <p className="text-gray-400 mt-2 mb-6">
            Generate a weekly digest to see an AI-powered summary of your loved one&apos;s health.
          </p>
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            style={{ padding: '12px 24px', background: '#2D6A4F', color: 'white', borderRadius: '12px', fontWeight: 600, fontSize: '16px', border: 'none', cursor: 'pointer', opacity: isGenerating ? 0.5 : 1, minHeight: '48px' }}
          >
            {isGenerating ? 'Generating…' : 'Generate First Digest'}
          </button>
        </div>
      )}
    </div>
  )
}
