'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { Vital } from '@/types'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

type VitalType = Vital['type']
type EntryKind = 'blood_glucose' | 'blood_pressure' | 'heart_rate' | 'weight'

const VITAL_META: Record<VitalType, { label: string; unit: string; min: number; max: number; borderlineBuffer: number }> = {
  blood_glucose: { label: 'Blood Glucose', unit: 'mmol/L', min: 4, max: 10, borderlineBuffer: 1 },
  blood_pressure_systolic: { label: 'Blood Pressure Systolic', unit: 'mmHg', min: 90, max: 140, borderlineBuffer: 10 },
  blood_pressure_diastolic: { label: 'Blood Pressure Diastolic', unit: 'mmHg', min: 60, max: 90, borderlineBuffer: 8 },
  heart_rate: { label: 'Heart Rate', unit: 'bpm', min: 60, max: 100, borderlineBuffer: 8 },
  weight: { label: 'Weight', unit: 'kg', min: 40, max: 120, borderlineBuffer: 5 },
}

const ENTRY_OPTIONS: Array<{ value: EntryKind; label: string; helper: string }> = [
  { value: 'blood_glucose', label: 'Blood Glucose', helper: 'Track sugar readings in mmol/L.' },
  { value: 'blood_pressure', label: 'Blood Pressure', helper: 'Capture systolic and diastolic together.' },
  { value: 'heart_rate', label: 'Heart Rate', helper: 'Track pulse in beats per minute.' },
  { value: 'weight', label: 'Weight', helper: 'Track weight changes over time.' },
]

const ORDERED_VITAL_TYPES: VitalType[] = [
  'blood_glucose',
  'blood_pressure_systolic',
  'blood_pressure_diastolic',
  'heart_rate',
  'weight',
]

function getLocalDateTimeValue(date = new Date()): string {
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16)
}

function formatDateTime(isoString: string): string {
  return new Date(isoString).toLocaleString('en-SG', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getVitalStatus(vitalType: VitalType, value: number): 'normal' | 'borderline' | 'abnormal' {
  const meta = VITAL_META[vitalType]
  if (value >= meta.min && value <= meta.max) return 'normal'
  if (value >= meta.min - meta.borderlineBuffer && value <= meta.max + meta.borderlineBuffer) return 'borderline'
  return 'abnormal'
}

function statusLabel(status: 'normal' | 'borderline' | 'abnormal'): string {
  if (status === 'normal') return 'In Range'
  if (status === 'borderline') return 'Borderline'
  return 'Out of Range'
}

function statusColor(status: 'normal' | 'borderline' | 'abnormal'): string {
  if (status === 'normal') return '#16a34a'
  if (status === 'borderline') return '#d97706'
  return '#dc2626'
}

function statusBg(status: 'normal' | 'borderline' | 'abnormal'): string {
  if (status === 'normal') return '#f0fdf4'
  if (status === 'borderline') return '#fffbeb'
  return '#fef2f2'
}

function sourceLabel(source: Vital['source']): string {
  if (source === 'caregiver') return 'Logged by caregiver'
  if (source === 'patient_reported') return 'Reported by patient'
  if (source === 'clinician') return 'Logged by clinician'
  return 'Synced from device'
}

function getSummary(vitals: Vital[]) {
  return ORDERED_VITAL_TYPES.map(type => {
    const readings = vitals.filter(vital => vital.type === type)
    if (!readings.length) return null

    const values = readings.map(reading => reading.value)
    const latest = readings[0]
    const average = Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10

    return {
      type,
      readings,
      latest,
      average,
      min: Math.min(...values),
      max: Math.max(...values),
      count: readings.length,
    }
  }).filter(Boolean) as Array<{
    type: VitalType
    readings: Vital[]
    latest: Vital
    average: number
    min: number
    max: number
    count: number
  }>
}

export default function CaregiverVitalsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [patientId, setPatientId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [patientName, setPatientName] = useState('Mdm Tan Ah Ma')
  const [vitals, setVitals] = useState<Vital[]>([])
  const [entryKind, setEntryKind] = useState<EntryKind>('blood_glucose')
  const [singleValue, setSingleValue] = useState('')
  const [systolicValue, setSystolicValue] = useState('')
  const [diastolicValue, setDiastolicValue] = useState('')
  const [recordedAt, setRecordedAt] = useState(getLocalDateTimeValue())
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    let cancelled = false

    const loadContext = async () => {
      setIsLoading(true)
      setError('')

      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          router.push('/caregiver/login')
          return
        }
        if (cancelled) return

        setAccessToken(session.access_token)

        const payload = JSON.parse(atob(session.access_token.split('.')[1]))
        const caregiverId = payload.app_user_id

        const { data: caregiverData } = await supabase
          .from('caregivers')
          .select('patient_ids')
          .eq('id', caregiverId)
          .single()

        const patientIds: string[] = caregiverData?.patient_ids ?? []
        if (!patientIds.length) {
          setError('No patient linked to your account.')
          setIsLoading(false)
          return
        }

        const linkedPatientId = patientIds[0]
        setPatientId(linkedPatientId)

        const { data: patientData } = await supabase
          .from('patients')
          .select('name')
          .eq('id', linkedPatientId)
          .single()

        if (!cancelled && patientData?.name) setPatientName(patientData.name)
      } catch {
        if (!cancelled) setError('Failed to load patient details.')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    loadContext()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchVitals = useCallback(async () => {
    if (!patientId || !accessToken) return

    setError('')
    try {
      const res = await fetch(`${API_BASE}/api/caregiver/${patientId}/vitals`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setVitals((data.vitals ?? []) as Vital[])
    } catch {
      setError('Failed to load vitals.')
    }
  }, [patientId, accessToken])

  useEffect(() => {
    if (patientId && accessToken) fetchVitals()
  }, [patientId, accessToken, fetchVitals])

  const groupedVitals = useMemo(() => getSummary(vitals), [vitals])
  const latestVital = vitals[0] ?? null
  const totalReadings = vitals.length
  const activeHelper = ENTRY_OPTIONS.find(option => option.value === entryKind)?.helper ?? ''
  const canSaveSingle = singleValue.trim() !== ''
  const canSaveBloodPressure = systolicValue.trim() !== '' && diastolicValue.trim() !== ''
  const canSave = entryKind === 'blood_pressure' ? canSaveBloodPressure : canSaveSingle

  const resetForm = () => {
    setSingleValue('')
    setSystolicValue('')
    setDiastolicValue('')
    setRecordedAt(getLocalDateTimeValue())
  }

  const logVital = async (vitalType: VitalType, value: number) => {
    const res = await fetch(`${API_BASE}/api/caregiver/${patientId}/vitals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        vital_type: vitalType,
        value,
        unit: VITAL_META[vitalType].unit,
        recorded_at: recordedAt ? new Date(recordedAt).toISOString() : undefined,
      }),
    })

    if (!res.ok) {
      let detail = 'Failed to save vital.'
      try {
        const data = await res.json()
        if (typeof data?.detail === 'string') detail = data.detail
      } catch {}
      throw new Error(detail)
    }
  }

  const handleSave = async () => {
    if (isSaving || !canSave || !patientId || !accessToken) return

    setIsSaving(true)
    setError('')
    setSuccessMessage('')

    try {
      if (entryKind === 'blood_pressure') {
        await logVital('blood_pressure_systolic', Number(systolicValue))
        await logVital('blood_pressure_diastolic', Number(diastolicValue))
        setSuccessMessage('Blood pressure reading logged.')
      } else {
        const vitalType = entryKind as Exclude<EntryKind, 'blood_pressure'>
        await logVital(vitalType, Number(singleValue))
        setSuccessMessage(`${ENTRY_OPTIONS.find(option => option.value === entryKind)?.label} logged.`)
      }

      resetForm()
      await fetchVitals()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save vital.')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <main className="bg-white min-h-screen px-8 md:px-12 pt-12 md:pt-16">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-40 bg-gray-200 rounded-full" />
          <div className="h-56 bg-gray-200 rounded-[20px]" />
          <div className="h-40 bg-gray-200 rounded-[20px]" />
        </div>
      </main>
    )
  }

  return (
    <main className="bg-white min-h-screen">
      <div className="px-8 md:px-12 pt-12 md:pt-16 pb-6">
        <p className="text-[#8f8f8f] text-lg font-medium">{patientName}</p>
        <p className="text-black text-2xl font-bold">Vitals Tracker</p>
        <p className="text-[#8f8f8f] text-base mt-1">Log new readings and review the last 7 days at a glance.</p>
      </div>

      <div className="flex flex-col gap-5 px-8 md:px-12 pb-8">
        <div className="bg-[#4894fe] rounded-[20px] p-6 flex flex-col gap-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-white text-xs font-semibold uppercase tracking-wider opacity-70">Latest Reading</p>
              <p className="text-white text-2xl font-bold mt-1">
                {latestVital ? `${VITAL_META[latestVital.type].label}` : 'No vitals yet'}
              </p>
              <p className="text-white text-sm opacity-80 mt-1">
                {latestVital
                  ? `${latestVital.value} ${latestVital.unit} logged ${formatDateTime(latestVital.recorded_at)}`
                  : 'Add the first reading to start tracking.'}
              </p>
            </div>
            <div className="bg-[rgba(255,255,255,0.18)] rounded-[18px] px-4 py-3 min-w-[120px]">
              <p className="text-white text-3xl font-bold">{totalReadings}</p>
              <p className="text-white text-xs opacity-70 mt-1">Readings this week</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {groupedVitals.slice(0, 4).map(group => {
              const status = getVitalStatus(group.type, group.latest.value)
              return (
                <div
                  key={group.type}
                  className="rounded-[16px] px-4 py-3"
                  style={{ background: 'rgba(255,255,255,0.18)' }}
                >
                  <p className="text-white text-xs uppercase tracking-wider opacity-70">{VITAL_META[group.type].label}</p>
                  <p className="text-white text-2xl font-bold mt-1">
                    {group.latest.value}
                    <span className="text-sm opacity-70 ml-1">{group.latest.unit}</span>
                  </p>
                  <p className="text-sm mt-1" style={{ color: status === 'normal' ? '#d1fae5' : status === 'borderline' ? '#fde68a' : '#fecaca' }}>
                    {statusLabel(status)}
                  </p>
                </div>
              )
            })}
          </div>
        </div>

        <div className="bg-[#f5f5f5] rounded-[20px] p-6 flex flex-col gap-4">
          <div>
            <p className="text-black text-lg font-bold">Log New Reading</p>
            <p className="text-[#8f8f8f] text-sm mt-1">{activeHelper}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex flex-col gap-2">
              <span className="text-[#464646] text-sm font-medium">Vital</span>
              <select
                value={entryKind}
                onChange={event => {
                  setEntryKind(event.target.value as EntryKind)
                  setSuccessMessage('')
                  setError('')
                }}
                className="w-full bg-white rounded-[15px] px-5 py-3 text-base text-black outline-none border border-[#e4e4e4] focus:border-[#4894fe]"
                style={{ minHeight: '0' }}
              >
                {ENTRY_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-[#464646] text-sm font-medium">Recorded At</span>
              <input
                type="datetime-local"
                value={recordedAt}
                onChange={event => setRecordedAt(event.target.value)}
                className="w-full bg-white rounded-[15px] px-5 py-3 text-base text-black outline-none border border-[#e4e4e4] focus:border-[#4894fe]"
                style={{ minHeight: '0' }}
              />
            </label>
          </div>

          {entryKind === 'blood_pressure' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex flex-col gap-2">
                <span className="text-[#464646] text-sm font-medium">Systolic (mmHg)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="e.g. 138"
                  value={systolicValue}
                  onChange={event => setSystolicValue(event.target.value)}
                  className="w-full bg-white rounded-[15px] px-5 py-3 text-base text-black placeholder:text-[#b4b4b4] outline-none border border-[#e4e4e4] focus:border-[#4894fe]"
                  style={{ minHeight: '0' }}
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-[#464646] text-sm font-medium">Diastolic (mmHg)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="e.g. 86"
                  value={diastolicValue}
                  onChange={event => setDiastolicValue(event.target.value)}
                  className="w-full bg-white rounded-[15px] px-5 py-3 text-base text-black placeholder:text-[#b4b4b4] outline-none border border-[#e4e4e4] focus:border-[#4894fe]"
                  style={{ minHeight: '0' }}
                />
              </label>
            </div>
          ) : (
            <label className="flex flex-col gap-2">
              <span className="text-[#464646] text-sm font-medium">
                Value ({VITAL_META[entryKind].unit})
              </span>
              <input
                type="number"
                inputMode="decimal"
                placeholder={`Enter ${ENTRY_OPTIONS.find(option => option.value === entryKind)?.label.toLowerCase()}`}
                value={singleValue}
                onChange={event => setSingleValue(event.target.value)}
                className="w-full bg-white rounded-[15px] px-5 py-3 text-base text-black placeholder:text-[#b4b4b4] outline-none border border-[#e4e4e4] focus:border-[#4894fe]"
                style={{ minHeight: '0' }}
              />
            </label>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-[16px] px-4 py-3 text-red-700 text-sm">
              {error}
            </div>
          )}

          {successMessage && (
            <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-[16px] px-4 py-3 text-[#166534] text-sm">
              {successMessage}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={!canSave || isSaving}
              className="flex-1 bg-[#4894fe] text-white rounded-[15px] py-3 font-semibold text-base disabled:opacity-50"
              style={{ minHeight: '0', minWidth: '0' }}
            >
              {isSaving ? 'Saving...' : 'Save Reading'}
            </button>
            <button
              onClick={() => {
                resetForm()
                setSuccessMessage('')
                setError('')
              }}
              className="flex-1 bg-white text-[#8f8f8f] rounded-[15px] py-3 font-medium text-base border border-[#e4e4e4]"
              style={{ minHeight: '0', minWidth: '0' }}
            >
              Reset
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-[#b4b4b4] text-sm font-semibold uppercase tracking-wider">Recent Vital Trends</p>
          <button
            onClick={fetchVitals}
            className="text-[#4894fe] text-sm font-medium px-4 py-2 rounded-[15px] border border-[#4894fe]"
            style={{ minHeight: '0', minWidth: '0' }}
          >
            Refresh
          </button>
        </div>

        {groupedVitals.length > 0 ? (
          groupedVitals.map(group => {
            const status = getVitalStatus(group.type, group.latest.value)
            return (
              <section
                key={group.type}
                className="bg-white rounded-[20px] shadow-[0px_0px_100px_0px_rgba(0,0,0,0.05)] p-6 flex flex-col gap-4"
              >
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                  <div>
                    <p className="text-black text-lg font-bold">{VITAL_META[group.type].label}</p>
                    <p className="text-[#8f8f8f] text-sm mt-1">
                      Latest {group.latest.value} {group.latest.unit} on {formatDateTime(group.latest.recorded_at)}
                    </p>
                  </div>
                  <span
                    className="text-xs font-semibold px-3 py-1 rounded-full w-fit"
                    style={{ color: statusColor(status), background: statusBg(status) }}
                  >
                    {statusLabel(status)}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-[#f5f5f5] rounded-[16px] px-4 py-3">
                    <p className="text-[#8f8f8f] text-xs uppercase tracking-wider">Average</p>
                    <p className="text-black text-xl font-bold mt-1">{group.average} <span className="text-sm text-[#8f8f8f]">{group.latest.unit}</span></p>
                  </div>
                  <div className="bg-[#f5f5f5] rounded-[16px] px-4 py-3">
                    <p className="text-[#8f8f8f] text-xs uppercase tracking-wider">Range</p>
                    <p className="text-black text-xl font-bold mt-1">{group.min}-{group.max}</p>
                  </div>
                  <div className="bg-[#f5f5f5] rounded-[16px] px-4 py-3">
                    <p className="text-[#8f8f8f] text-xs uppercase tracking-wider">Entries</p>
                    <p className="text-black text-xl font-bold mt-1">{group.count}</p>
                  </div>
                  <div className="bg-[#f5f5f5] rounded-[16px] px-4 py-3">
                    <p className="text-[#8f8f8f] text-xs uppercase tracking-wider">Target</p>
                    <p className="text-black text-xl font-bold mt-1">{VITAL_META[group.type].min}-{VITAL_META[group.type].max}</p>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  {group.readings.slice(0, 4).map(reading => (
                    <div
                      key={reading.id}
                      className="bg-[#f9fafb] rounded-[16px] px-4 py-3 flex items-center justify-between gap-4"
                    >
                      <div>
                        <p className="text-black text-base font-semibold">{reading.value} {reading.unit}</p>
                        <p className="text-[#8f8f8f] text-sm mt-0.5">{sourceLabel(reading.source)}</p>
                      </div>
                      <p className="text-[#8f8f8f] text-sm text-right">{formatDateTime(reading.recorded_at)}</p>
                    </div>
                  ))}
                </div>
              </section>
            )
          })
        ) : (
          <div className="text-center py-16 bg-white rounded-[20px] shadow-[0px_0px_100px_0px_rgba(0,0,0,0.05)]">
            <div className="w-16 h-16 rounded-full bg-[#eef6ff] flex items-center justify-center mx-auto mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M4.5 12h3l2-5 4 10 2-5h4" stroke="#4894fe" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="text-black text-xl font-bold">No vitals recorded</p>
            <p className="text-[#b4b4b4] text-base mt-2">Use the form above to add the first reading.</p>
          </div>
        )}
      </div>
    </main>
  )
}
