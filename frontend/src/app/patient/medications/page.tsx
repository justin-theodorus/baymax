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
  notes?: string
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

const MED_COLORS = ['#E8634A', '#2D6A4F', '#3B4F7A', '#F4A261', '#52B788', '#9B59B6']

function getMedColor(name: string): string {
  const hash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return MED_COLORS[hash % MED_COLORS.length]
}

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

function getNextDoseTime(med: Medication): string | null {
  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const times = med.schedule?.times ?? []
  if (!times.length) return null

  for (const t of times) {
    const [h, m] = t.split(':').map(Number)
    const mins = h * 60 + m
    if (mins > currentMinutes) return formatTime(t)
  }
  return formatTime(times[0]) // next day
}

function CheckIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
      <path fillRule="evenodd" d="M19.916 4.626a.75.75 0 0 1 .208 1.04l-9 13.5a.75.75 0 0 1-1.154.114l-6-6a.75.75 0 0 1 1.06-1.06l5.353 5.353 8.493-12.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
    </svg>
  )
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
        body: JSON.stringify({ patient_id: patientId, medication_id: med.id, taken: true }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch {
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
    loading: language === 'zh' ? '加载中…' : 'Loading medications…',
    allDone: language === 'zh' ? '今日所有药物已服用！' : 'All medications taken today!',
    noMeds: language === 'zh' ? '今日无药物' : 'No medications scheduled today',
    scheduledAt: language === 'zh' ? '预定时间' : 'Scheduled',
    takenAt: language === 'zh' ? '服用时间' : 'Taken at',
    nextDose: language === 'zh' ? '下次服药' : 'Next dose',
  }

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F7F5F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#9ca3af', fontSize: '22px' }} className="animate-pulse">{t.loading}</p>
      </div>
    )
  }

  const pendingMeds = medsData?.pending_today ?? []
  const takenMeds = medsData?.taken_today ?? []

  return (
    <main style={{ background: '#F7F5F2', display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      {/* Page title row */}
      <div style={{ padding: '20px 20px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#1f2937' }}>{t.title}</h1>
        <div style={{ display: 'flex', gap: '6px' }}>
          {(['en', 'zh'] as const).map(lang => (
            <button
              key={lang}
              onClick={() => setLanguage(lang)}
              style={{
                padding: '4px 14px',
                borderRadius: '999px',
                fontSize: '16px',
                fontWeight: 600,
                background: language === lang ? '#E8634A' : 'white',
                color: language === lang ? 'white' : '#E8634A',
                border: '1.5px solid #E8634A',
                minHeight: '36px',
              }}
            >
              {lang === 'en' ? 'EN' : '中文'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {error && (
          <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '16px', padding: '16px', color: '#b91c1c', fontSize: '18px' }}>
            {error}
          </div>
        )}

        {/* Pending / Overdue */}
        {pendingMeds.length > 0 && (
          <section>
            <h2 style={{ color: '#6b7280', fontWeight: 600, fontSize: '18px', marginBottom: '10px' }}>
              {pendingMeds.some(m => m.overdue) ? `⚠ ${t.overdue}` : t.pending}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {pendingMeds.map(med => {
                const color = getMedColor(med.name)
                const nextDose = getNextDoseTime(med)
                return (
                  <div
                    key={med.id}
                    style={{
                      background: 'white',
                      borderRadius: '16px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                      padding: '16px 16px 16px 0',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      minHeight: '80px',
                      borderLeft: `4px solid ${med.overdue ? '#E63946' : color}`,
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0, paddingLeft: '16px' }}>
                      <p style={{ fontWeight: 700, color: '#1f2937', fontSize: '22px', marginBottom: '2px' }}>{med.name}</p>
                      <p style={{ color: '#6b7280', fontSize: '17px' }}>{med.dosage}</p>
                      <p style={{ color: med.overdue ? '#E63946' : '#9ca3af', fontSize: '15px', marginTop: '2px' }}>
                        {t.scheduledAt}: {med.schedule?.times?.map(formatTime).join(', ') ?? '—'}
                      </p>
                      {nextDose && !med.overdue && (
                        <p style={{ color: '#52B788', fontSize: '15px', fontWeight: 500 }}>
                          {t.nextDose}: {nextDose}
                        </p>
                      )}
                      {med.notes && (
                        <p style={{ color: '#9ca3af', fontSize: '14px', fontStyle: 'italic', marginTop: '2px' }}>{med.notes}</p>
                      )}
                    </div>
                    {/* Large checkbox button */}
                    <button
                      onClick={() => markAsTaken(med)}
                      disabled={markingId === med.id}
                      style={{
                        width: '56px',
                        height: '56px',
                        borderRadius: '50%',
                        background: markingId === med.id ? '#e5e7eb' : (med.overdue ? '#E63946' : color),
                        color: 'white',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        marginRight: '8px',
                        transition: 'transform 0.15s, background 0.2s',
                        transform: markingId === med.id ? 'scale(0.9)' : 'scale(1)',
                      }}
                      aria-label="Mark as taken"
                    >
                      {markingId === med.id ? (
                        <div style={{ width: '20px', height: '20px', border: '2px solid white', borderTop: '2px solid transparent', borderRadius: '50%' }} className="animate-spin" />
                      ) : (
                        <CheckIcon />
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Taken */}
        {takenMeds.length > 0 && (
          <section>
            <h2 style={{ color: '#6b7280', fontWeight: 600, fontSize: '18px', marginBottom: '10px' }}>
              ✓ {t.taken}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {takenMeds.map(med => {
                const log = medsData?.logs.find(l => l.medication_id === med.id && l.taken)
                const takenAt = log?.taken_at
                  ? new Date(log.taken_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : null
                const color = getMedColor(med.name)
                return (
                  <div
                    key={med.id}
                    style={{
                      background: 'white',
                      borderRadius: '16px',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                      padding: '16px 16px 16px 0',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      minHeight: '72px',
                      borderLeft: `4px solid ${color}`,
                      opacity: 0.65,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0, paddingLeft: '16px' }}>
                      <p style={{ fontWeight: 700, color: '#374151', fontSize: '22px' }}>{med.name}</p>
                      <p style={{ color: '#9ca3af', fontSize: '17px' }}>{med.dosage}</p>
                      {takenAt && (
                        <p style={{ color: '#52B788', fontSize: '15px', fontWeight: 500, marginTop: '2px' }}>
                          {t.takenAt}: {takenAt}
                        </p>
                      )}
                    </div>
                    <div style={{
                      width: '40px', height: '40px', borderRadius: '50%',
                      background: '#52B788', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', flexShrink: 0, marginRight: '12px',
                    }}>
                      <CheckIcon />
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* All done */}
        {pendingMeds.length === 0 && takenMeds.length > 0 && (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <p style={{ color: '#52B788', fontWeight: 700, fontSize: '26px' }}>
              {language === 'zh' ? '🎉 今日所有药物已服用！' : '🎉 All medications taken today!'}
            </p>
            <p style={{ color: '#9ca3af', fontSize: '18px', marginTop: '8px' }}>
              {language === 'zh' ? '做得好！' : 'Great job!'}
            </p>
          </div>
        )}

        {/* No medications */}
        {pendingMeds.length === 0 && takenMeds.length === 0 && !isLoading && (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <p style={{ color: '#9ca3af', fontSize: '22px' }}>{t.noMeds}</p>
          </div>
        )}
      </div>
    </main>
  )
}
