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

const SEVERITY_STYLE = {
  critical: { border: '#E63946', bg: '#fff5f5', label: 'Critical', labelBg: '#fee2e2', labelColor: '#b91c1c' },
  warning:  { border: '#F4A261', bg: '#fffbf5', label: 'Warning',  labelBg: '#fef3c7', labelColor: '#92400e' },
  info:     { border: '#52B788', bg: '#f0fdf4', label: 'Info',     labelBg: '#dcfce7', labelColor: '#166534' },
}

function formatDateTime(isoString: string): string {
  return new Date(isoString).toLocaleString('en-SG', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
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
      <div style={{ maxWidth: '768px', margin: '0 auto', padding: '24px' }}>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-200 rounded-2xl" />)}
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '768px', margin: '0 auto', padding: '16px 16px 40px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1f2937' }}>Alerts</h1>
          <p style={{ color: '#9ca3af', fontSize: '14px', marginTop: '4px' }}>
            {activeAlerts.length > 0
              ? `${activeAlerts.length} active alert${activeAlerts.length !== 1 ? 's' : ''}`
              : 'No active alerts'}
          </p>
        </div>
        <button
          onClick={fetchAlerts}
          style={{ padding: '8px 16px', borderRadius: '10px', border: '1px solid #e5e7eb', background: 'white', color: '#2D6A4F', fontSize: '14px', fontWeight: 500, cursor: 'pointer', minHeight: '40px' }}
        >
          Refresh
        </button>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '12px', padding: '16px', color: '#b91c1c', fontSize: '15px' }}>
          {error}
        </div>
      )}

      {/* Active alerts */}
      {activeAlerts.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h2 style={{ fontSize: '13px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active</h2>
          {activeAlerts.map(alert => {
            const cfg = SEVERITY_STYLE[alert.severity] ?? SEVERITY_STYLE.info
            // Extract a bold summary (first sentence or first 80 chars)
            const boldSummary = alert.summary.split('.')[0] || alert.summary.slice(0, 80)
            const restSummary = alert.summary.slice(boldSummary.length).replace(/^[.]\s*/, '').trim()

            return (
              <div
                key={alert.id}
                style={{
                  background: cfg.bg,
                  borderRadius: '16px',
                  borderLeft: `4px solid ${cfg.border}`,
                  padding: '18px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                }}
              >
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ background: cfg.labelBg, color: cfg.labelColor, fontSize: '12px', fontWeight: 700, padding: '3px 10px', borderRadius: '999px' }}>
                    {cfg.label}
                  </span>
                  <span style={{ color: '#9ca3af', fontSize: '12px' }}>{formatDateTime(alert.created_at)}</span>
                </div>

                {/* Bold summary line */}
                <p style={{ fontWeight: 700, color: '#1f2937', fontSize: '16px', marginBottom: restSummary ? '6px' : '0' }}>
                  {boldSummary}
                </p>
                {restSummary && (
                  <p style={{ color: '#4b5563', fontSize: '15px', lineHeight: '1.6' }}>{restSummary}</p>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => handleAcknowledge(alert.id)}
                    disabled={acknowledgingId === alert.id}
                    style={{
                      padding: '8px 16px', borderRadius: '10px', border: '1px solid #e5e7eb',
                      background: 'white', color: '#374151', fontSize: '14px', fontWeight: 500,
                      cursor: 'pointer', minHeight: '40px', opacity: acknowledgingId === alert.id ? 0.5 : 1,
                    }}
                  >
                    {acknowledgingId === alert.id ? 'Acknowledging…' : 'Acknowledge'}
                  </button>
                  <a
                    href="tel:+6500000000"
                    style={{
                      padding: '8px 16px', borderRadius: '10px',
                      background: '#2D6A4F', color: 'white',
                      fontSize: '14px', fontWeight: 600, textDecoration: 'none',
                      display: 'inline-flex', alignItems: 'center', gap: '6px', minHeight: '40px',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
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
        <section style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <h2 style={{ fontSize: '13px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Previously Acknowledged</h2>
          {acknowledgedAlerts.map(alert => {
            const cfg = SEVERITY_STYLE[alert.severity] ?? SEVERITY_STYLE.info
            return (
              <div
                key={alert.id}
                style={{
                  background: '#f9fafb',
                  borderRadius: '12px',
                  borderLeft: `3px solid ${cfg.border}`,
                  padding: '14px 16px',
                  opacity: 0.7,
                }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ background: cfg.labelBg, color: cfg.labelColor, fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px' }}>
                    {cfg.label}
                  </span>
                  <span style={{ color: '#9ca3af', fontSize: '12px' }}>{formatDateTime(alert.created_at)}</span>
                  <span style={{ color: '#9ca3af', fontSize: '12px', background: '#e5e7eb', padding: '2px 8px', borderRadius: '999px' }}>
                    ✓ Acknowledged
                  </span>
                </div>
                <p style={{ color: '#6b7280', fontSize: '14px', lineHeight: '1.5' }}>{alert.summary}</p>
              </div>
            )
          })}
        </section>
      )}

      {/* Empty state */}
      {alerts.length === 0 && !isLoading && (
        <div style={{ textAlign: 'center', padding: '64px 0', background: 'white', borderRadius: '16px' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#52B788" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <p style={{ fontSize: '20px', fontWeight: 600, color: '#374151' }}>No alerts</p>
          <p style={{ color: '#9ca3af', marginTop: '8px', fontSize: '15px' }}>Everything looks good. You&apos;ll be notified if something needs attention.</p>
        </div>
      )}
    </div>
  )
}
