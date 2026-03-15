'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface Alert {
  id: string
  severity: 'critical' | 'warning' | 'info'
  type: string
  summary: string
  status: 'active' | 'acknowledged' | 'resolved'
  created_at: string
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const SEVERITY_CONFIG = {
  critical: {
    emoji: '🔴',
    label: 'Critical',
    border: 'border-l-red-500',
    bg: 'bg-red-50',
    badge: 'bg-red-100 text-red-800',
  },
  warning: {
    emoji: '🟡',
    label: 'Warning',
    border: 'border-l-amber-400',
    bg: 'bg-amber-50',
    badge: 'bg-amber-100 text-amber-800',
  },
  info: {
    emoji: '🟢',
    label: 'Info',
    border: 'border-l-green-400',
    bg: 'bg-green-50',
    badge: 'bg-green-100 text-green-800',
  },
}

function formatDateTime(isoString: string): string {
  return new Date(isoString).toLocaleString('en-SG', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function AlertsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [patientId, setPatientId] = useState('')
  const [accessToken, setAccessToken] = useState('')
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

    // Optimistic update
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status: 'acknowledged' } : a))

    try {
      const res = await fetch(
        `${API_BASE}/api/caregiver/${patientId}/alerts/${alertId}/acknowledge`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch {
      // Revert on failure
      await fetchAlerts()
    } finally {
      setAcknowledgingId(null)
    }
  }

  const activeAlerts = alerts.filter(a => a.status === 'active')
  const acknowledgedAlerts = alerts.filter(a => a.status !== 'active')

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 bg-gray-200 rounded-2xl animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Alerts</h1>
          <p className="text-gray-500 text-sm mt-1">
            {activeAlerts.length > 0
              ? `${activeAlerts.length} active alert${activeAlerts.length !== 1 ? 's' : ''}`
              : 'No active alerts'}
          </p>
        </div>
        <button
          onClick={fetchAlerts}
          className="text-sm text-emerald-600 hover:text-emerald-700 font-medium px-3 py-2 rounded-lg hover:bg-emerald-50 transition-colors"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Active alerts */}
      {activeAlerts.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Active</h2>
          {activeAlerts.map(alert => {
            const cfg = SEVERITY_CONFIG[alert.severity] ?? SEVERITY_CONFIG.info
            return (
              <div
                key={alert.id}
                className={`rounded-2xl border border-l-4 ${cfg.border} ${cfg.bg} p-5 flex flex-col sm:flex-row sm:items-start gap-4`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="text-xl">{cfg.emoji}</span>
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${cfg.badge}`}>
                      {cfg.label}
                    </span>
                    <span className="text-xs text-gray-400">{formatDateTime(alert.created_at)}</span>
                  </div>
                  <p className="text-gray-800 leading-relaxed">{alert.summary}</p>
                </div>
                <button
                  onClick={() => handleAcknowledge(alert.id)}
                  disabled={acknowledgingId === alert.id}
                  className="shrink-0 px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-50 self-start"
                >
                  {acknowledgingId === alert.id ? 'Acknowledging…' : 'Acknowledge'}
                </button>
              </div>
            )
          })}
        </section>
      )}

      {/* Acknowledged alerts */}
      {acknowledgedAlerts.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Previously Acknowledged</h2>
          {acknowledgedAlerts.map(alert => {
            const cfg = SEVERITY_CONFIG[alert.severity] ?? SEVERITY_CONFIG.info
            return (
              <div
                key={alert.id}
                className="rounded-2xl border border-gray-100 bg-gray-50 p-5 opacity-70"
              >
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-xl">{cfg.emoji}</span>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${cfg.badge}`}>
                    {cfg.label}
                  </span>
                  <span className="text-xs text-gray-400">{formatDateTime(alert.created_at)}</span>
                  <span className="text-xs text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">
                    ✓ Acknowledged
                  </span>
                </div>
                <p className="text-gray-600 text-sm leading-relaxed">{alert.summary}</p>
              </div>
            )
          })}
        </section>
      )}

      {/* Empty state */}
      {alerts.length === 0 && !isLoading && (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🟢</div>
          <p className="text-xl font-semibold text-gray-600">No alerts</p>
          <p className="text-gray-400 mt-2">Everything looks good. You'll be notified if something needs attention.</p>
        </div>
      )}
    </div>
  )
}
