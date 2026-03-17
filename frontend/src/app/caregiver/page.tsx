'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceArea, ReferenceLine, CartesianGrid,
} from 'recharts'

interface DashboardData {
  patient_id: string
  adherence_pct: number
  last_checkin: string | null
  active_alert_count: number
  traffic_light: 'green' | 'warning' | 'critical' | 'info'
}

interface Vital {
  id: string
  type: string
  value: number
  unit: string
  recorded_at: string
  source: string
}

interface MedItem {
  id: string
  name: string
  dosage: string
  schedule: { times: string[]; frequency?: string }
  notes?: string
  active: boolean
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const GREEN = '#2D6A4F'

const TRAFFIC_LIGHT_CONFIG = {
  critical: { label: 'Critical', color: '#fee2e2', border: '#E63946', textColor: '#b91c1c' },
  warning:  { label: 'Needs Attention', color: '#fef3c7', border: '#F4A261', textColor: '#92400e' },
  info:     { label: 'For Your Info', color: '#eff6ff', border: '#3b82f6', textColor: '#1d4ed8' },
  green:    { label: 'All Good', color: '#f0fdf4', border: '#52B788', textColor: '#166534' },
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

function formatShortDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function VitalsChart({
  vitals,
  vitalType,
  label,
  unit,
  normalMin,
  normalMax,
}: {
  vitals: Vital[]
  vitalType: string
  label: string
  unit: string
  normalMin: number
  normalMax: number
}) {
  const data = vitals
    .filter(v => v.type === vitalType)
    .map(v => ({
      date: formatShortDate(v.recorded_at),
      value: v.value,
      isAbnormal: v.value < normalMin || v.value > normalMax,
    }))

  if (data.length === 0) {
    return (
      <div style={{ background: 'white', borderRadius: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', padding: '20px' }}>
        <p style={{ fontWeight: 600, color: '#374151', marginBottom: '8px' }}>{label}</p>
        <p style={{ color: '#9ca3af', fontSize: '15px' }}>No {label.toLowerCase()} readings this week</p>
      </div>
    )
  }

  return (
    <div style={{ background: 'white', borderRadius: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', padding: '20px' }}>
      <p style={{ fontWeight: 600, color: '#374151', marginBottom: '4px' }}>{label}</p>
      <p style={{ color: '#9ca3af', fontSize: '13px', marginBottom: '12px' }}>
        Normal range: {normalMin}–{normalMax} {unit}
      </p>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip formatter={(v) => [`${v} ${unit}`, label]} />
          <ReferenceArea y1={normalMin} y2={normalMax} fill="#f0fdf4" fillOpacity={0.6} />
          <ReferenceLine y={normalMin} stroke="#52B788" strokeDasharray="4 4" />
          <ReferenceLine y={normalMax} stroke="#52B788" strokeDasharray="4 4" />
          <Line
            type="monotone"
            dataKey="value"
            stroke={GREEN}
            strokeWidth={2}
            dot={(props) => {
              const { cx, cy, payload } = props
              return (
                <circle
                  key={`dot-${cx}-${cy}`}
                  cx={cx}
                  cy={cy}
                  r={5}
                  fill={payload.isAbnormal ? '#E63946' : '#52B788'}
                  stroke="white"
                  strokeWidth={1.5}
                />
              )
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function CaregiverDashboard() {
  const router = useRouter()
  const supabase = createClient()

  const [patientId, setPatientId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  // Vitals state
  const [vitals, setVitals] = useState<Vital[]>([])
  const [showVitalsForm, setShowVitalsForm] = useState(false)
  const [vitalType, setVitalType] = useState('blood_glucose')
  const [vitalValue, setVitalValue] = useState('')
  const [isLoggingVital, setIsLoggingVital] = useState(false)
  const [vitalLogMessage, setVitalLogMessage] = useState('')

  // Medication management state
  const [showMeds, setShowMeds] = useState(false)
  const [medications, setMedications] = useState<MedItem[]>([])
  const [isLoadingMeds, setIsLoadingMeds] = useState(false)
  const [showAddMed, setShowAddMed] = useState(false)
  const [newMedName, setNewMedName] = useState('')
  const [newMedDosage, setNewMedDosage] = useState('')
  const [newMedMorning, setNewMedMorning] = useState(true)
  const [newMedEvening, setNewMedEvening] = useState(false)
  const [newMedNotes, setNewMedNotes] = useState('')
  const [isSavingMed, setIsSavingMed] = useState(false)

  const vitalUnits: Record<string, string> = {
    blood_glucose: 'mmol/L',
    blood_pressure_systolic: 'mmHg',
    blood_pressure_diastolic: 'mmHg',
    weight: 'kg',
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.push('/caregiver/login')
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

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setIsLoading(true)
      setError('')
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session || cancelled) return

        const token = session.access_token
        setAccessToken(token)
        const payload = JSON.parse(atob(token.split('.')[1]))
        const caregiverId = payload.app_user_id

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

        const [dashRes, vitalsRes] = await Promise.all([
          fetch(`${API_BASE}/api/caregiver/${linkedPatientId}/dashboard`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE}/api/caregiver/${linkedPatientId}/vitals`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ])

        if (!cancelled) {
          if (dashRes.ok) setDashboard(await dashRes.json())
          if (vitalsRes.ok) setVitals((await vitalsRes.json()).vitals ?? [])
        }
      } catch {
        if (!cancelled) setError('Failed to load dashboard. Please try again.')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [])

  const fetchMedications = async () => {
    if (!patientId || !accessToken) return
    setIsLoadingMeds(true)
    try {
      const res = await fetch(`${API_BASE}/api/caregiver/${patientId}/medications`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (res.ok) {
        const data = await res.json()
        setMedications(data.medications ?? [])
      }
    } catch {}
    setIsLoadingMeds(false)
  }

  const handleLogVital = async () => {
    if (!vitalValue || !patientId || !accessToken) return
    setIsLoggingVital(true)
    setVitalLogMessage('')
    try {
      const res = await fetch(`${API_BASE}/api/caregiver/${patientId}/vitals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          vital_type: vitalType,
          value: parseFloat(vitalValue),
          unit: vitalUnits[vitalType],
        }),
      })
      if (res.ok) {
        const label = vitalType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        setVitalLogMessage(`${label} logged — Baymax will mention this to the patient in their next check-in`)
        setVitalValue('')
        setShowVitalsForm(false)
        // Refresh vitals
        const vRes = await fetch(`${API_BASE}/api/caregiver/${patientId}/vitals`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (vRes.ok) setVitals((await vRes.json()).vitals ?? [])
      }
    } catch {}
    setIsLoggingVital(false)
  }

  const handleAddMedication = async () => {
    if (!newMedName || !newMedDosage) return
    setIsSavingMed(true)
    try {
      const times: string[] = []
      if (newMedMorning) times.push('08:00')
      if (newMedEvening) times.push('20:00')
      const res = await fetch(`${API_BASE}/api/caregiver/${patientId}/medications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          name: newMedName,
          dosage: newMedDosage,
          schedule: { times, frequency: 'daily' },
          notes: newMedNotes || null,
        }),
      })
      if (res.ok) {
        setShowAddMed(false)
        setNewMedName('')
        setNewMedDosage('')
        setNewMedMorning(true)
        setNewMedEvening(false)
        setNewMedNotes('')
        await fetchMedications()
      }
    } catch {}
    setIsSavingMed(false)
  }

  const handleRemoveMedication = async (medId: string) => {
    if (!confirm('Remove this medication from the patient\'s schedule?')) return
    try {
      const res = await fetch(`${API_BASE}/api/caregiver/${patientId}/medications/${medId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (res.ok) await fetchMedications()
    } catch {}
  }

  if (isLoading) {
    return (
      <div style={{ maxWidth: '768px', margin: '0 auto', padding: '24px' }}>
        <div className="animate-pulse space-y-4">
          <div className="h-32 bg-gray-200 rounded-2xl" />
          <div className="h-24 bg-gray-200 rounded-2xl" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ maxWidth: '768px', margin: '0 auto', padding: '24px' }}>
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '16px', padding: '24px', color: '#b91c1c' }}>
          {error}
        </div>
      </div>
    )
  }

  const tl = TRAFFIC_LIGHT_CONFIG[dashboard?.traffic_light ?? 'green']

  return (
    <div style={{ maxWidth: '768px', margin: '0 auto', padding: '16px 16px 40px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1f2937' }}>Care Dashboard</h1>
        <p style={{ color: '#9ca3af', fontSize: '14px', marginTop: '4px' }}>Overview of your loved one&apos;s health this week</p>
      </div>

      {/* Traffic-light status */}
      <div style={{ borderRadius: '16px', border: `2px solid ${tl.border}`, background: tl.color, padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: tl.border, flexShrink: 0 }} />
        <div>
          <p style={{ fontSize: '22px', fontWeight: 700, color: tl.textColor }}>{tl.label}</p>
          <p style={{ fontSize: '14px', color: tl.textColor, opacity: 0.8, marginTop: '2px' }}>
            {dashboard?.active_alert_count
              ? `${dashboard.active_alert_count} active alert${dashboard.active_alert_count !== 1 ? 's' : ''}`
              : 'No active alerts'}
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #f3f4f6', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', padding: '20px' }}>
          <p style={{ color: '#9ca3af', fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Medication Adherence</p>
          <p style={{ fontSize: '40px', fontWeight: 700, color: '#1f2937', marginTop: '8px', lineHeight: 1 }}>
            {dashboard?.adherence_pct ?? 0}<span style={{ fontSize: '20px', color: '#9ca3af' }}>%</span>
          </p>
          <p style={{ color: '#9ca3af', fontSize: '12px', marginTop: '4px' }}>Last 7 days</p>
        </div>

        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #f3f4f6', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', padding: '20px' }}>
          <p style={{ color: '#9ca3af', fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Last Check-in</p>
          <p style={{ fontSize: '20px', fontWeight: 700, color: '#1f2937', marginTop: '8px', lineHeight: 1.3 }}>
            {formatRelativeTime(dashboard?.last_checkin ?? null)}
          </p>
          {dashboard?.last_checkin && (
            <p style={{ color: '#9ca3af', fontSize: '12px', marginTop: '4px' }}>
              {new Date(dashboard.last_checkin).toLocaleDateString('en-SG', { weekday: 'short', month: 'short', day: 'numeric' })}
            </p>
          )}
        </div>
      </div>

      {/* Quick links */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Link href="/caregiver/alerts" style={{ background: 'white', borderRadius: '16px', border: '1px solid #f3f4f6', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', padding: '20px', display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </div>
          <div>
            <p style={{ fontWeight: 600, color: '#1f2937', fontSize: '15px' }}>View Alerts</p>
            <p style={{ color: '#9ca3af', fontSize: '13px' }}>
              {dashboard?.active_alert_count ? `${dashboard.active_alert_count} unacknowledged` : 'No active alerts'}
            </p>
          </div>
        </Link>

        <Link href="/caregiver/digest" style={{ background: 'white', borderRadius: '16px', border: '1px solid #f3f4f6', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', padding: '20px', display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
          <div>
            <p style={{ fontWeight: 600, color: '#1f2937', fontSize: '15px' }}>Weekly Digest</p>
            <p style={{ color: '#9ca3af', fontSize: '13px' }}>AI-generated summary</p>
          </div>
        </Link>
      </div>

      {/* Vitals Entry Panel */}
      <div style={{ background: 'white', borderRadius: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <button
          onClick={() => setShowVitalsForm(v => !v)}
          style={{
            width: '100%', padding: '18px 20px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', background: 'transparent', border: 'none', cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
            <span style={{ fontWeight: 600, color: '#1f2937', fontSize: '16px' }}>Log Vitals</span>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: showVitalsForm ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {showVitalsForm && (
          <div style={{ padding: '0 20px 20px', borderTop: '1px solid #f3f4f6' }}>
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
              <select
                value={vitalType}
                onChange={e => setVitalType(e.target.value)}
                style={{ flex: 1, padding: '10px 12px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '15px', minHeight: '44px', background: 'white' }}
              >
                <option value="blood_glucose">Blood Glucose (mmol/L)</option>
                <option value="blood_pressure_systolic">Systolic BP (mmHg)</option>
                <option value="blood_pressure_diastolic">Diastolic BP (mmHg)</option>
                <option value="weight">Weight (kg)</option>
              </select>
              <input
                type="number"
                step="0.1"
                value={vitalValue}
                onChange={e => setVitalValue(e.target.value)}
                placeholder={`Value (${vitalUnits[vitalType]})`}
                style={{ width: '130px', padding: '10px 12px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '15px', minHeight: '44px' }}
              />
              <button
                onClick={handleLogVital}
                disabled={isLoggingVital || !vitalValue}
                style={{
                  padding: '10px 20px', background: GREEN, color: 'white', borderRadius: '10px',
                  fontWeight: 600, fontSize: '15px', minHeight: '44px', border: 'none',
                  cursor: 'pointer', opacity: isLoggingVital || !vitalValue ? 0.5 : 1,
                }}
              >
                {isLoggingVital ? 'Logging…' : 'Log'}
              </button>
            </div>
          </div>
        )}

        {vitalLogMessage && (
          <div style={{ margin: '0 20px 16px', padding: '12px 16px', background: '#f0fdf4', borderRadius: '10px', color: '#166534', fontSize: '14px', border: '1px solid #bbf7d0' }}>
            ✓ {vitalLogMessage}
          </div>
        )}
      </div>

      {/* Vital Trends */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h2 style={{ fontSize: '17px', fontWeight: 600, color: '#374151' }}>Vital Trends (7 days)</h2>
        <VitalsChart vitals={vitals} vitalType="blood_glucose" label="Blood Glucose" unit="mmol/L" normalMin={4} normalMax={10} />
        <VitalsChart vitals={vitals} vitalType="blood_pressure_systolic" label="Systolic Blood Pressure" unit="mmHg" normalMin={90} normalMax={140} />
      </div>

      {/* Medication Management */}
      <div style={{ background: 'white', borderRadius: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <button
          onClick={() => { setShowMeds(v => !v); if (!showMeds) fetchMedications() }}
          style={{
            width: '100%', padding: '18px 20px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', background: 'transparent', border: 'none', cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v11m0 0H5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h4m0-6h6m0 0v6m0-6h4a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-4m-6 0v-6" />
            </svg>
            <span style={{ fontWeight: 600, color: '#1f2937', fontSize: '16px' }}>Medications</span>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: showMeds ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {showMeds && (
          <div style={{ padding: '0 20px 20px', borderTop: '1px solid #f3f4f6' }}>
            {isLoadingMeds ? (
              <p style={{ color: '#9ca3af', padding: '16px 0' }} className="animate-pulse">Loading medications…</p>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
                  {medications.map(med => (
                    <div key={med.id} style={{ border: '1px solid #f3f4f6', borderRadius: '12px', padding: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                      <div>
                        <p style={{ fontWeight: 600, color: '#1f2937', fontSize: '16px' }}>{med.name}</p>
                        <p style={{ color: '#6b7280', fontSize: '14px' }}>{med.dosage}</p>
                        {med.schedule?.times?.length > 0 && (
                          <p style={{ color: '#9ca3af', fontSize: '13px' }}>
                            {med.schedule.times.join(', ')}
                          </p>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                        <button
                          onClick={() => handleRemoveMedication(med.id)}
                          style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #fee2e2', background: '#fee2e2', color: '#b91c1c', fontSize: '13px', fontWeight: 500, cursor: 'pointer', minHeight: '36px' }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}

                  {medications.length === 0 && (
                    <p style={{ color: '#9ca3af', fontSize: '15px', padding: '8px 0' }}>No medications on record.</p>
                  )}
                </div>

                {/* Add medication form */}
                {!showAddMed ? (
                  <button
                    onClick={() => setShowAddMed(true)}
                    style={{ marginTop: '14px', padding: '10px 20px', background: GREEN, color: 'white', borderRadius: '10px', fontWeight: 600, fontSize: '15px', border: 'none', cursor: 'pointer', minHeight: '44px' }}
                  >
                    + Add Medication
                  </button>
                ) : (
                  <div style={{ marginTop: '16px', padding: '16px', background: '#f9fafb', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <p style={{ fontWeight: 600, color: '#374151', fontSize: '15px' }}>New Medication</p>
                    <input
                      type="text"
                      placeholder="Medication name"
                      value={newMedName}
                      onChange={e => setNewMedName(e.target.value)}
                      style={{ padding: '10px 12px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '15px', minHeight: '44px' }}
                    />
                    <input
                      type="text"
                      placeholder="Dosage (e.g. 500mg)"
                      value={newMedDosage}
                      onChange={e => setNewMedDosage(e.target.value)}
                      style={{ padding: '10px 12px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '15px', minHeight: '44px' }}
                    />
                    <div style={{ display: 'flex', gap: '16px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '15px', color: '#374151', cursor: 'pointer' }}>
                        <input type="checkbox" checked={newMedMorning} onChange={e => setNewMedMorning(e.target.checked)} style={{ width: '18px', height: '18px' }} />
                        Morning (8am)
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '15px', color: '#374151', cursor: 'pointer' }}>
                        <input type="checkbox" checked={newMedEvening} onChange={e => setNewMedEvening(e.target.checked)} style={{ width: '18px', height: '18px' }} />
                        Evening (8pm)
                      </label>
                    </div>
                    <input
                      type="text"
                      placeholder="Notes (optional, e.g. Take with food)"
                      value={newMedNotes}
                      onChange={e => setNewMedNotes(e.target.value)}
                      style={{ padding: '10px 12px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '15px', minHeight: '44px' }}
                    />
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        onClick={handleAddMedication}
                        disabled={isSavingMed || !newMedName || !newMedDosage}
                        style={{ flex: 1, padding: '10px', background: GREEN, color: 'white', borderRadius: '10px', fontWeight: 600, fontSize: '15px', border: 'none', cursor: 'pointer', opacity: isSavingMed || !newMedName || !newMedDosage ? 0.5 : 1, minHeight: '44px' }}
                      >
                        {isSavingMed ? 'Saving…' : 'Save Medication'}
                      </button>
                      <button
                        onClick={() => setShowAddMed(false)}
                        style={{ padding: '10px 16px', background: 'white', color: '#6b7280', borderRadius: '10px', fontWeight: 500, fontSize: '15px', border: '1px solid #e5e7eb', cursor: 'pointer', minHeight: '44px' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <p style={{ fontSize: '12px', color: '#d1d5db', textAlign: 'center', paddingBottom: '8px' }}>
        Baymax AI summaries are for informational purposes only — not medical advice.
      </p>
    </div>
  )
}
