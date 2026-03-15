'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface DashboardData {
  patient_id: string
  adherence_pct: number
  last_checkin: string | null
  active_alert_count: number
  traffic_light: 'green' | 'warning' | 'critical' | 'info'
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const TRAFFIC_LIGHT_CONFIG = {
  critical: {
    emoji: '🔴',
    label: 'Critical',
    color: 'bg-red-50 border-red-300',
    textColor: 'text-red-700',
    badgeColor: 'bg-red-100 text-red-800',
  },
  warning: {
    emoji: '🟡',
    label: 'Needs Attention',
    color: 'bg-amber-50 border-amber-300',
    textColor: 'text-amber-700',
    badgeColor: 'bg-amber-100 text-amber-800',
  },
  info: {
    emoji: '🔵',
    label: 'For Your Info',
    color: 'bg-blue-50 border-blue-200',
    textColor: 'text-blue-700',
    badgeColor: 'bg-blue-100 text-blue-800',
  },
  green: {
    emoji: '🟢',
    label: 'All Good',
    color: 'bg-green-50 border-green-200',
    textColor: 'text-green-700',
    badgeColor: 'bg-green-100 text-green-800',
  },
}

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return 'No check-ins yet'
  const diff = Date.now() - new Date(isoString).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function CaregiverDashboard() {
  const router = useRouter()
  const supabase = createClient()

  const [patientId, setPatientId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/caregiver/login')
        return
      }
      setAccessToken(session.access_token)
      try {
        const payload = JSON.parse(atob(session.access_token.split('.')[1]))
        // Caregiver's app_user_id is their caregiver UUID
        // We need their linked patient_id — fetched from dashboard API
        setPatientId(payload.app_user_id || '')
      } catch {
        setPatientId('')
      }
    })
  }, [])

  useEffect(() => {
    if (!patientId || !accessToken) return

    const fetchDashboard = async () => {
      setIsLoading(true)
      setError('')
      try {
        // First get caregiver's linked patient_id from Supabase directly
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        // Decode caregiver's linked patient from JWT or fetch via API
        // The caregiver_id is in app_user_id; we need to find the patient_id
        // We'll try the dashboard endpoint with the caregiver's app_user_id as patient_id first
        // The backend will validate the link
        const payload = JSON.parse(atob(session.access_token.split('.')[1]))
        const caregiverId = payload.app_user_id

        // Get caregiver's patient_id from Supabase client-side
        const { data: caregiverData } = await supabase
          .from('caregivers')
          .select('patient_ids')
          .eq('id', caregiverId)
          .single()

        const patientIds: string[] = caregiverData?.patient_ids ?? []
        if (!patientIds.length) {
          setError('No patient linked to your account.')
          return
        }

        const linkedPatientId = patientIds[0]
        setPatientId(linkedPatientId)

        const res = await fetch(`${API_BASE}/api/caregiver/${linkedPatientId}/dashboard`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data: DashboardData = await res.json()
        setDashboard(data)
      } catch (err) {
        setError('Failed to load dashboard. Please try again.')
      } finally {
        setIsLoading(false)
      }
    }

    fetchDashboard()
  }, [patientId, accessToken])

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-32 bg-gray-200 rounded-2xl" />
          <div className="h-24 bg-gray-200 rounded-2xl" />
          <div className="h-24 bg-gray-200 rounded-2xl" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-red-700">
          {error}
        </div>
      </div>
    )
  }

  const tl = TRAFFIC_LIGHT_CONFIG[dashboard?.traffic_light ?? 'green']

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Care Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Overview of your loved one's health this week</p>
      </div>

      {/* Traffic-light status card */}
      <div className={`rounded-2xl border-2 p-6 ${tl.color}`}>
        <div className="flex items-center gap-4">
          <span className="text-5xl">{tl.emoji}</span>
          <div>
            <p className={`text-2xl font-bold ${tl.textColor}`}>{tl.label}</p>
            <p className={`text-sm mt-1 ${tl.textColor} opacity-80`}>
              {dashboard?.active_alert_count
                ? `${dashboard.active_alert_count} active alert${dashboard.active_alert_count !== 1 ? 's' : ''}`
                : 'No active alerts'}
            </p>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-gray-400 text-sm font-medium uppercase tracking-wide">Medication Adherence</p>
          <p className="text-4xl font-bold text-gray-800 mt-2">
            {dashboard?.adherence_pct ?? 0}
            <span className="text-xl text-gray-400">%</span>
          </p>
          <p className="text-gray-400 text-xs mt-1">Last 7 days</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-gray-400 text-sm font-medium uppercase tracking-wide">Last Check-in</p>
          <p className="text-xl font-bold text-gray-800 mt-2 leading-tight">
            {formatRelativeTime(dashboard?.last_checkin ?? null)}
          </p>
          {dashboard?.last_checkin && (
            <p className="text-gray-400 text-xs mt-1">
              {new Date(dashboard.last_checkin).toLocaleDateString('en-SG', {
                weekday: 'short', month: 'short', day: 'numeric',
              })}
            </p>
          )}
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/caregiver/alerts"
          className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4 hover:border-emerald-300 hover:shadow-md transition-all group"
        >
          <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-2xl shrink-0 group-hover:scale-110 transition-transform">
            🔔
          </div>
          <div>
            <p className="font-semibold text-gray-800">View Alerts</p>
            <p className="text-gray-400 text-sm">
              {dashboard?.active_alert_count
                ? `${dashboard.active_alert_count} unacknowledged`
                : 'No active alerts'}
            </p>
          </div>
        </Link>

        <Link
          href="/caregiver/digest"
          className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4 hover:border-emerald-300 hover:shadow-md transition-all group"
        >
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-2xl shrink-0 group-hover:scale-110 transition-transform">
            📋
          </div>
          <div>
            <p className="font-semibold text-gray-800">Weekly Digest</p>
            <p className="text-gray-400 text-sm">AI-generated health summary</p>
          </div>
        </Link>
      </div>

      {/* AI disclaimer */}
      <p className="text-xs text-gray-300 text-center pb-4">
        Baymax AI summaries are for informational purposes only — not medical advice.
      </p>
    </div>
  )
}
