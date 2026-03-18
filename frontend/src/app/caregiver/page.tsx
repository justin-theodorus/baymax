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

  const [, setPatientId] = useState('')
  const [, setAccessToken] = useState('')
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [patientName, setPatientName] = useState('Mdm Tan Ah Ma')
  const [caregiverName, setCaregiverName] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setIsLoading(true)
      setError('')
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          router.push('/caregiver/login')
          return
        }
        if (cancelled) return

        const token = session.access_token
        setAccessToken(token)
        const payload = JSON.parse(atob(token.split('.')[1]))
        const caregiverId = payload.app_user_id

        const { data: caregiverData } = await supabase
          .from('caregivers')
          .select('patient_ids, name')
          .eq('id', caregiverId)
          .single()

        if (caregiverData?.name) setCaregiverName(caregiverData.name.split(' ')[0])

        const patientIds: string[] = caregiverData?.patient_ids ?? []
        if (!patientIds.length) {
          setError('No patient linked to your account.')
          setIsLoading(false)
          return
        }

        const linkedPatientId = patientIds[0]
        setPatientId(linkedPatientId)

        // Fetch patient name
        const { data: patientData } = await supabase
          .from('patients')
          .select('name')
          .eq('id', linkedPatientId)
          .single()
        if (patientData?.name) setPatientName(patientData.name)

        const dashRes = await fetch(`${API_BASE}/api/caregiver/${linkedPatientId}/dashboard`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (!cancelled) {
          if (dashRes.ok) setDashboard(await dashRes.json())
        }
      } catch {
        if (!cancelled) setError('Failed to load dashboard. Please try again.')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (isLoading) {
    return (
      <main className="bg-white min-h-screen px-8 md:px-12 pt-12 md:pt-16">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-gray-200 rounded-full" />
          <div className="h-40 bg-gray-200 rounded-[20px]" />
          <div className="h-24 bg-gray-200 rounded-[20px]" />
        </div>
      </main>
    )
  }

  const statusDotColor = dashboard?.traffic_light === 'critical' ? '#E63946'
    : dashboard?.traffic_light === 'warning' ? '#F4A261'
    : '#52B788'

  const isStable = (dashboard?.traffic_light ?? 'green') !== 'critical'
  const statusLabel = isStable ? 'Stable' : 'Needs Attention'

  const greeting = (() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good Morning'
    if (hour < 18) return 'Good Afternoon'
    return 'Good Evening'
  })()

  return (
    <main className="bg-white min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-8 md:px-12 pt-12 md:pt-16 pb-4">
        <div>
          <p className="text-[#8f8f8f] text-lg font-medium">{greeting}</p>
          <p className="text-black text-2xl font-bold">{caregiverName ? `${caregiverName}!` : 'Hello!'}</p>
        </div>
        <div className="w-[60px] h-[60px] rounded-full bg-[#4894fe] flex items-center justify-center flex-shrink-0">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
            <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
          </svg>
        </div>
      </div>

      {error && (
        <div className="mx-8 md:mx-12 mb-4 bg-red-50 border border-red-200 rounded-[20px] px-5 py-4 text-red-700 text-base">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-6 px-8 md:px-12 pb-8">
        {/* Status Card */}
        <div className="bg-[#4894fe] rounded-[20px] p-6 flex flex-col gap-5">
          {/* Label row */}
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ background: statusDotColor }} />
            <p className="text-white text-sm font-semibold uppercase tracking-wider opacity-80">Patient Status</p>
          </div>

          {/* Status title */}
          <div>
            <p className="text-white text-3xl font-bold">{statusLabel}</p>
            <p className="text-white text-base opacity-70 mt-1">{patientName}</p>
            <p className="text-white text-sm opacity-60 mt-0.5">
              Last seen: {formatRelativeTime(dashboard?.last_checkin ?? null)}
            </p>
          </div>

          {/* Stats boxes */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[rgba(255,255,255,0.2)] rounded-[15px] px-4 py-3">
              <p className="text-white text-3xl font-bold">
                {dashboard?.adherence_pct ?? 0}
                <span className="text-lg opacity-70">%</span>
              </p>
              <p className="text-white text-xs opacity-70 mt-1">Med Adherence</p>
            </div>
            <div className="bg-[rgba(255,255,255,0.2)] rounded-[15px] px-4 py-3">
              <p className="text-white text-3xl font-bold">{dashboard?.active_alert_count ?? 0}</p>
              <p className="text-white text-xs opacity-70 mt-1">Alerts This Week</p>
            </div>
          </div>
        </div>

        {/* Warning card — shown only when there are active alerts */}
        {(dashboard?.active_alert_count ?? 0) > 0 && (
          <div className="bg-[#464646] rounded-[20px] p-6 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-yellow-400" />
              <p className="text-white text-sm font-semibold uppercase tracking-wider opacity-80">Warning</p>
            </div>
            <p className="text-white text-base font-medium">
              {dashboard?.active_alert_count} active alert{(dashboard?.active_alert_count ?? 0) !== 1 ? 's' : ''} require{(dashboard?.active_alert_count ?? 0) === 1 ? 's' : ''} your attention.
            </p>
            <Link
              href="/caregiver/alerts"
              className="bg-[rgba(255,255,255,0.15)] rounded-[15px] px-4 py-3 text-white text-sm font-medium text-center"
              style={{ minHeight: '0', minWidth: '0' }}
            >
              View Alerts
            </Link>
          </div>
        )}

        {/* Quick Access label */}
        <p className="text-[#b4b4b4] text-sm font-semibold uppercase tracking-wider">Quick Access</p>

        {/* Quick access cards */}
        <div className="grid grid-cols-2 gap-4">
          <Link
            href="/caregiver/alerts"
            className="bg-[#4894fe] rounded-[20px] p-5 flex flex-col gap-3"
            style={{ minHeight: '0', minWidth: '0' }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
              <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
            </svg>
            <div>
              <p className="text-white text-base font-bold">Alert</p>
              <p className="text-white text-xs opacity-70 mt-0.5">
                {dashboard?.active_alert_count
                  ? `${dashboard.active_alert_count} unacknowledged`
                  : 'No active alerts'}
              </p>
            </div>
          </Link>

          <Link
            href="/caregiver/digest"
            className="bg-[#464646] rounded-[20px] p-5 flex flex-col gap-3"
            style={{ minHeight: '0', minWidth: '0' }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
              <path fillRule="evenodd" d="M5.625 1.5c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V12.75A3.75 3.75 0 0016.5 9h-1.875a1.875 1.875 0 01-1.875-1.875V5.25A3.75 3.75 0 009 1.5H5.625zM7.5 15a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5A.75.75 0 017.5 15zm.75-6.75a.75.75 0 000 1.5H12a.75.75 0 000-1.5H8.25z" clipRule="evenodd" />
              <path d="M12.971 1.816A5.23 5.23 0 0114.25 5.25v1.875c0 .207.168.375.375.375H16.5a5.23 5.23 0 013.434 1.279 9.768 9.768 0 00-6.963-6.963z" />
            </svg>
            <div>
              <p className="text-white text-base font-bold">Weekly Digest</p>
              <p className="text-white text-xs opacity-70 mt-0.5">AI-generated summary</p>
            </div>
          </Link>
        </div>

        {/* Last check-in card */}
        <div className="bg-white rounded-[20px] shadow-[0px_0px_100px_0px_rgba(0,0,0,0.05)] flex items-center justify-between px-6 py-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-[#eef6ff] flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#4894fe">
                <path fillRule="evenodd" d="M19.916 4.626a.75.75 0 01.208 1.04l-9 13.5a.75.75 0 01-1.154.114l-6-6a.75.75 0 011.06-1.06l5.353 5.353 8.493-12.74a.75.75 0 011.04-.207z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <p className="text-black text-base font-bold">Last check-in</p>
              <p className="text-[#b4b4b4] text-sm">
                {dashboard?.last_checkin
                  ? new Date(dashboard.last_checkin).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' })
                  : 'No check-ins yet'}
              </p>
            </div>
          </div>
          <Link
            href="/caregiver/alerts"
            className="bg-[#4894fe] text-white text-sm font-semibold px-5 py-2 rounded-[15px]"
            style={{ minHeight: '0', minWidth: '0' }}
          >
            View
          </Link>
        </div>
      </div>
    </main>
  )
}
