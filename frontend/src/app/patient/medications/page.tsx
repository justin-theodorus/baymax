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

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

function getScheduleLabel(med: Medication): string {
  const freq = med.schedule?.frequency ?? ''
  const times = med.schedule?.times?.map(formatTime).join(', ') ?? ''
  if (freq && times) return `${freq.charAt(0).toUpperCase() + freq.slice(1)} · ${times}`
  if (times) return times
  return freq
}

export default function MedicationsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [patientId, setPatientId] = useState('')
  const [accessToken, setAccessToken] = useState('')
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setError('Failed to load medications. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [patientId, accessToken])

  useEffect(() => {
    if (patientId && accessToken) fetchMeds()
  }, [patientId, accessToken, fetchMeds])

  const markAsTaken = async (med: Medication) => {
    if (markingId) return
    setMarkingId(med.id)

    setMedsData(prev => {
      if (!prev) return prev
      return {
        ...prev,
        taken_today: [...prev.taken_today, { ...med }],
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

  if (isLoading) {
    return (
      <main className="bg-white min-h-screen px-8 pt-16">
        <p className="text-[#b4b4b4] text-lg animate-pulse">Loading medications…</p>
      </main>
    )
  }

  const pendingMeds = medsData?.pending_today ?? []
  const takenMeds = medsData?.taken_today ?? []

  return (
    <main className="bg-white min-h-screen">
      {/* Header */}
      <div className="px-8 pt-16 pb-6">
        <p className="text-[#8f8f8f] text-lg font-medium">Don&apos;t forget to take your meds!</p>
        <p className="text-black text-2xl font-bold">Medication</p>
      </div>

      <div className="flex flex-col gap-4 px-8 pb-8">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-[20px] px-5 py-4 text-red-700 text-base">
            {error}
          </div>
        )}

        {/* Pending / Overdue meds */}
        {pendingMeds.map((med, i) => {
          const bgColor = i === 0 ? '#4894fe' : '#464646'
          const isOverdue = med.overdue
          const timeStr = med.schedule?.times?.[0] ? formatTime(med.schedule.times[0]) : ''
          const timeColor = isOverdue ? '#ff7878' : 'rgba(255,255,255,0.8)'
          return (
            <button
              key={med.id}
              onClick={() => markAsTaken(med)}
              disabled={markingId === med.id}
              className="rounded-[20px] flex items-center justify-between px-8 py-5 text-left transition-opacity active:opacity-80"
              style={{ background: bgColor, minHeight: '0', minWidth: '0' }}
            >
              <div className="flex items-center gap-5">
                <div className="w-12 h-12 rounded-full border-2 border-[rgba(255,255,255,0.3)] flex items-center justify-center flex-shrink-0">
                  {markingId === med.id ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <div className="w-8 h-8 rounded-full border-2 border-[rgba(255,255,255,0.5)]" />
                  )}
                </div>
                <div>
                  <p className="text-white text-lg font-bold">{med.name}</p>
                  <p className="text-white text-sm font-normal opacity-80">{getScheduleLabel(med)}</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill={timeColor}>
                    <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 6a.75.75 0 00-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 000-1.5h-3.75V6z" clipRule="evenodd" />
                  </svg>
                  <p className="text-sm font-normal" style={{ color: timeColor }}>{timeStr}</p>
                </div>
                {isOverdue && (
                  <span className="text-xs font-semibold" style={{ color: '#ff7878' }}>Overdue</span>
                )}
                <p className="text-white text-xs opacity-60">Tap to mark taken</p>
              </div>
            </button>
          )
        })}

        {/* Taken meds */}
        {takenMeds.map((med, i) => {
          const bgColor = pendingMeds.length === 0 && i === 0 ? '#4894fe' : '#464646'
          const log = medsData?.logs.find(l => l.medication_id === med.id && l.taken)
          const takenAt = log?.taken_at
            ? new Date(log.taken_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : null
          return (
            <div
              key={med.id}
              className="rounded-[20px] flex items-center justify-between px-8 py-5 opacity-60"
              style={{ background: bgColor }}
            >
              <div className="flex items-center gap-5">
                <div className="w-12 h-12 rounded-full border-2 border-[rgba(255,255,255,0.3)] flex items-center justify-center flex-shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                    <path fillRule="evenodd" d="M19.916 4.626a.75.75 0 01.208 1.04l-9 13.5a.75.75 0 01-1.154.114l-6-6a.75.75 0 011.06-1.06l5.353 5.353 8.493-12.74a.75.75 0 011.04-.207z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <p className="text-white text-lg font-bold">{med.name}</p>
                  <p className="text-white text-sm font-normal opacity-80">{getScheduleLabel(med)}</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <p className="text-white text-base font-medium">Taken</p>
                {takenAt && (
                  <p className="text-white text-xs opacity-70">{takenAt}</p>
                )}
              </div>
            </div>
          )
        })}

        {/* All done state */}
        {pendingMeds.length === 0 && takenMeds.length > 0 && (
          <div className="text-center py-8">
            <p className="text-[#52B788] font-bold text-xl">All medications taken today!</p>
            <p className="text-[#b4b4b4] text-base mt-2">Great job!</p>
          </div>
        )}

        {/* No medications */}
        {pendingMeds.length === 0 && takenMeds.length === 0 && !isLoading && (
          <div className="text-center py-12">
            <p className="text-[#b4b4b4] text-lg">No medications scheduled today</p>
          </div>
        )}
      </div>
    </main>
  )
}
