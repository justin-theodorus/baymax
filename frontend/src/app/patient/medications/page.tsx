'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface MedSchedule {
  times: string[]
  frequency: string
}

interface Medication {
  id: string
  name: string
  dosage: string
  schedule: MedSchedule
  active: boolean
}

interface MedLog {
  medication_id: string
  taken: boolean
  taken_at: string | null
  scheduled_time: string
}

interface PendingMed extends Medication {
  overdue: boolean
}

interface MedsData {
  medications: Medication[]
  logs: MedLog[]
  taken_today: Medication[]
  pending_today: PendingMed[]
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

export default function MedicationsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [patientId, setPatientId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [language, setLanguage] = useState<'en' | 'zh'>('en')
  const [medsData, setMedsData] = useState<MedsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/patient/login')
        return
      }
      setAccessToken(session.access_token)
      try {
        const payload = JSON.parse(atob(session.access_token.split('.')[1]))
        setPatientId(payload.app_user_id || '')
      } catch {
        setPatientId('')
      }
    })
  }, [])

  const fetchMeds = useCallback(async () => {
    if (!patientId || !accessToken) return
    setIsLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/api/medications/today?patient_id=${patientId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: MedsData = await res.json()
      setMedsData(data)
    } catch {
      setError(language === 'zh' ? '加载失败，请重试' : 'Failed to load medications. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [patientId, accessToken, language])

  useEffect(() => {
    if (patientId && accessToken) fetchMeds()
  }, [patientId, accessToken, fetchMeds])

  const markAsTaken = async (med: Medication) => {
    if (markingId) return
    setMarkingId(med.id)

    // Optimistic update
    setMedsData(prev => {
      if (!prev) return prev
      const now = new Date().toISOString()
      return {
        ...prev,
        taken_today: [...prev.taken_today, { ...med, taken_at: now } as Medication],
        pending_today: prev.pending_today.filter(m => m.id !== med.id),
      }
    })

    try {
      const res = await fetch(`${API_BASE}/api/medications/log-dose`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          patient_id: patientId,
          medication_id: med.id,
          taken: true,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch {
      // Revert optimistic update on failure
      await fetchMeds()
    } finally {
      setMarkingId(null)
    }
  }

  const t = {
    title: language === 'zh' ? '今日药物' : "Today's Medications",
    taken: language === 'zh' ? '已服用' : 'Taken',
    pending: language === 'zh' ? '待服用' : 'Pending',
    overdue: language === 'zh' ? '已过期' : 'Overdue',
    markTaken: language === 'zh' ? '标记已服用' : 'Mark as taken',
    loading: language === 'zh' ? '加载中…' : 'Loading medications…',
    allDone: language === 'zh' ? '今日所有药物已服用！' : 'All medications taken today!',
    noMeds: language === 'zh' ? '今日无药物' : 'No medications scheduled today',
    scheduledAt: language === 'zh' ? '预定时间' : 'Scheduled',
    takenAt: language === 'zh' ? '服用时间' : 'Taken at',
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-sky-50 flex items-center justify-center">
        <p className="text-gray-400 animate-pulse" style={{ fontSize: '22px' }}>{t.loading}</p>
      </div>
    )
  }

  const pendingMeds = medsData?.pending_today ?? []
  const takenMeds = medsData?.taken_today ?? []

  return (
    <main className="bg-sky-50 flex flex-col" style={{ height: '100%', overflowY: 'auto' }}>
      {/* Header */}
      <header className="bg-sky-600 text-white px-5 py-4 flex items-center justify-between shrink-0">
        <h1 style={{ fontSize: '26px', fontWeight: 'bold' }}>{t.title}</h1>
        <div className="flex gap-2">
          {(['en', 'zh'] as const).map(lang => (
            <button
              key={lang}
              onClick={() => setLanguage(lang)}
              className={`rounded-xl font-bold transition-colors px-4 py-2 ${
                language === lang ? 'bg-white text-sky-600' : 'bg-sky-500 text-white border border-sky-300'
              }`}
              style={{ minHeight: '48px', minWidth: '64px', fontSize: '18px' }}
            >
              {lang === 'en' ? 'EN' : '中文'}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 p-4 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-red-700" style={{ fontSize: '18px' }}>
            {error}
          </div>
        )}

        {/* Pending / Overdue medications */}
        {pendingMeds.length > 0 && (
          <section>
            <h2 className="text-gray-500 font-semibold mb-3" style={{ fontSize: '18px' }}>
              {pendingMeds.some(m => m.overdue) ? `⚠ ${t.overdue}` : t.pending}
            </h2>
            <div className="space-y-3">
              {pendingMeds.map(med => (
                <div
                  key={med.id}
                  className={`rounded-2xl shadow-sm p-5 flex items-center justify-between gap-4 ${
                    med.overdue ? 'bg-amber-50 border-2 border-amber-300' : 'bg-white border border-sky-100'
                  }`}
                  style={{ minHeight: '80px' }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-800 truncate" style={{ fontSize: '22px' }}>
                      {med.name}
                    </p>
                    <p className="text-gray-500 mt-1" style={{ fontSize: '17px' }}>
                      {med.dosage}
                    </p>
                    <p className={`mt-1 ${med.overdue ? 'text-amber-600 font-medium' : 'text-gray-400'}`} style={{ fontSize: '16px' }}>
                      {t.scheduledAt}: {med.schedule?.times?.map(formatTime).join(', ') ?? '—'}
                    </p>
                  </div>
                  <button
                    onClick={() => markAsTaken(med)}
                    disabled={markingId === med.id}
                    className={`shrink-0 rounded-2xl font-bold text-white transition-all active:scale-95 disabled:opacity-50 px-5 py-3 ${
                      med.overdue ? 'bg-amber-500 hover:bg-amber-600' : 'bg-sky-500 hover:bg-sky-600'
                    }`}
                    style={{ minHeight: '56px', minWidth: '120px', fontSize: '18px' }}
                  >
                    {markingId === med.id ? '…' : t.markTaken}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Taken medications */}
        {takenMeds.length > 0 && (
          <section>
            <h2 className="text-gray-500 font-semibold mb-3" style={{ fontSize: '18px' }}>
              ✓ {t.taken}
            </h2>
            <div className="space-y-3">
              {takenMeds.map(med => {
                const log = medsData?.logs.find(l => l.medication_id === med.id && l.taken)
                const takenAt = log?.taken_at
                  ? new Date(log.taken_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : null
                return (
                  <div
                    key={med.id}
                    className="bg-green-50 border border-green-200 rounded-2xl p-5 flex items-center gap-4"
                    style={{ minHeight: '80px' }}
                  >
                    <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" className="w-6 h-6">
                        <path fillRule="evenodd" d="M19.916 4.626a.75.75 0 0 1 .208 1.04l-9 13.5a.75.75 0 0 1-1.154.114l-6-6a.75.75 0 0 1 1.06-1.06l5.353 5.353 8.493-12.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-700 truncate" style={{ fontSize: '22px' }}>{med.name}</p>
                      <p className="text-gray-400 mt-1" style={{ fontSize: '17px' }}>{med.dosage}</p>
                      {takenAt && (
                        <p className="text-green-600 mt-1" style={{ fontSize: '16px' }}>
                          {t.takenAt}: {takenAt}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* All done */}
        {pendingMeds.length === 0 && takenMeds.length > 0 && (
          <div className="text-center py-8">
            <div className="text-5xl mb-3">🎉</div>
            <p className="text-green-600 font-bold" style={{ fontSize: '22px' }}>{t.allDone}</p>
          </div>
        )}

        {/* No medications */}
        {pendingMeds.length === 0 && takenMeds.length === 0 && !isLoading && (
          <div className="text-center py-12">
            <p className="text-gray-400" style={{ fontSize: '22px' }}>{t.noMeds}</p>
          </div>
        )}
      </div>
    </main>
  )
}
