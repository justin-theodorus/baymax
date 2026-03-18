'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface Alert {
  id: string
  severity: 'critical' | 'warning' | 'info'
  type: string
  summary: string
  status: 'pending' | 'acknowledged' | 'resolved'
  created_at: string
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function formatDateTime(isoString: string): string {
  return new Date(isoString).toLocaleString('en-SG', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good Morning'
  if (hour < 18) return 'Good Afternoon'
  return 'Good Evening'
}

export default function AlertsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [patientId, setPatientId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [caregiverName, setCaregiverName] = useState('')
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null)

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
          .select('patient_ids, name')
          .eq('id', caregiverId)
          .single()

        if (caregiverData?.name) setCaregiverName(caregiverData.name.split(' ')[0])

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

  const fetchAlerts = useCallback(async () => {
    if (!patientId || !accessToken) return
    setIsLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/api/caregiver/${patientId}/alerts`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setAlerts(data.alerts ?? [])
    } catch {
      setError('Failed to load alerts. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [patientId, accessToken])

  useEffect(() => {
    if (patientId && accessToken) fetchAlerts()
  }, [patientId, accessToken, fetchAlerts])

  const handleAcknowledge = async (alertId: string) => {
    if (acknowledgingId) return
    setAcknowledgingId(alertId)
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status: 'acknowledged' } : a))

    try {
      const res = await fetch(
        `${API_BASE}/api/caregiver/${patientId}/alerts/${alertId}/acknowledge`,
        { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } }
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch {
      await fetchAlerts()
    } finally {
      setAcknowledgingId(null)
    }
  }

  const activeAlerts = alerts.filter(a => a.status === 'pending')
  const acknowledgedAlerts = alerts.filter(a => a.status !== 'pending')

  if (isLoading) {
    return (
      <main className="bg-white min-h-screen px-8 pt-16">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-28 bg-gray-200 rounded-[20px]" />)}
        </div>
      </main>
    )
  }

  return (
    <main className="bg-white min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-8 pt-16 pb-4">
        <div>
          <p className="text-[#8f8f8f] text-lg font-medium">{getGreeting()}</p>
          <p className="text-black text-2xl font-bold">{caregiverName ? `${caregiverName}!` : 'Hello!'}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchAlerts}
            className="text-[#4894fe] text-sm font-medium px-4 py-2 rounded-[15px] border border-[#4894fe]"
            style={{ minHeight: '0', minWidth: '0' }}
          >
            Refresh
          </button>
          <div className="w-[60px] h-[60px] rounded-full bg-[#4894fe] flex items-center justify-center flex-shrink-0">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
              <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-5 px-8 pb-8">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-[20px] px-5 py-4 text-red-700 text-base">
            {error}
          </div>
        )}

        {/* Active alerts */}
        {activeAlerts.length > 0 && (
          <section className="flex flex-col gap-4">
            <p className="text-[#b4b4b4] text-sm font-semibold uppercase tracking-wider">
              Active · {activeAlerts.length} alert{activeAlerts.length !== 1 ? 's' : ''}
            </p>
            {activeAlerts.map(alert => {
              const boldSummary = alert.summary.split('.')[0] || alert.summary.slice(0, 80)
              const restSummary = alert.summary.slice(boldSummary.length).replace(/^[.]\s*/, '').trim()
              return (
                <div
                  key={alert.id}
                  className="bg-[#4894fe] rounded-[20px] p-6 flex flex-col gap-4"
                >
                  {/* Header row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
                        <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
                      </svg>
                      <p className="text-white text-lg font-bold">Alert</p>
                    </div>
                    <p className="text-white text-sm opacity-70">{formatDateTime(alert.created_at)}</p>
                  </div>

                  {/* Summary */}
                  <div>
                    <p className="text-white text-base font-bold">{boldSummary}</p>
                    {restSummary && (
                      <p className="text-white text-base opacity-80 mt-1 leading-relaxed">{restSummary}</p>
                    )}
                    <p className="text-white text-sm opacity-60 mt-1 capitalize">{alert.severity} severity</p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleAcknowledge(alert.id)}
                      disabled={acknowledgingId === alert.id}
                      className="flex-1 bg-[rgba(255,255,255,0.2)] text-white text-sm font-semibold rounded-[15px] py-3 transition-opacity disabled:opacity-50"
                      style={{ minHeight: '0', minWidth: '0' }}
                    >
                      {acknowledgingId === alert.id ? 'Acknowledging…' : 'Acknowledge'}
                    </button>
                    <a
                      href="tel:+6500000000"
                      className="flex-1 bg-white text-[#4894fe] text-sm font-semibold rounded-[15px] py-3 flex items-center justify-center gap-2"
                      style={{ minHeight: '0', minWidth: '0' }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
                      </svg>
                      Call Patient
                    </a>
                  </div>
                </div>
              )
            })}
          </section>
        )}

        {/* Acknowledged alerts */}
        {acknowledgedAlerts.length > 0 && (
          <section className="flex flex-col gap-3">
            <p className="text-[#b4b4b4] text-sm font-semibold uppercase tracking-wider">Previously Acknowledged</p>
            {acknowledgedAlerts.map(alert => (
              <div
                key={alert.id}
                className="bg-[#f5f5f5] rounded-[20px] p-5 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#e0e0e0] flex items-center justify-center">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="#8f8f8f">
                        <path fillRule="evenodd" d="M19.916 4.626a.75.75 0 01.208 1.04l-9 13.5a.75.75 0 01-1.154.114l-6-6a.75.75 0 011.06-1.06l5.353 5.353 8.493-12.74a.75.75 0 011.04-.207z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <p className="text-[#464646] text-base font-semibold">Acknowledged</p>
                  </div>
                  <p className="text-[#b4b4b4] text-sm">{formatDateTime(alert.created_at)}</p>
                </div>
                <p className="text-[#8f8f8f] text-base leading-relaxed">{alert.summary}</p>
              </div>
            ))}
          </section>
        )}

        {/* Empty state */}
        {alerts.length === 0 && !isLoading && (
          <div className="text-center py-16 bg-white rounded-[20px] shadow-[0px_0px_100px_0px_rgba(0,0,0,0.05)]">
            <div className="w-16 h-16 rounded-full bg-[#eef6ff] flex items-center justify-center mx-auto mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="#4894fe">
                <path fillRule="evenodd" d="M19.916 4.626a.75.75 0 01.208 1.04l-9 13.5a.75.75 0 01-1.154.114l-6-6a.75.75 0 011.06-1.06l5.353 5.353 8.493-12.74a.75.75 0 011.04-.207z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-black text-xl font-bold">No alerts</p>
            <p className="text-[#b4b4b4] text-base mt-2">Everything looks good right now.</p>
          </div>
        )}
      </div>
    </main>
  )
}
