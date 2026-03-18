'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface MedItem {
  id: string
  name: string
  dosage: string
  schedule: { times: string[]; frequency?: string }
  notes?: string
  active: boolean
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

function getScheduleLabel(med: MedItem): string {
  const freq = med.schedule?.frequency ?? 'daily'
  const times = med.schedule?.times?.map(formatTime).join(', ') ?? ''
  const label = freq.charAt(0).toUpperCase() + freq.slice(1)
  if (times) return `${label} · ${times}`
  return label
}

export default function ManagePage() {
  const router = useRouter()
  const supabase = createClient()

  const [patientId, setPatientId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [patientName, setPatientName] = useState('Mdm Tan Ah Ma')
  const [medications, setMedications] = useState<MedItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showAddMed, setShowAddMed] = useState(false)
  const [editingMed, setEditingMed] = useState<MedItem | null>(null)
  const [newMedName, setNewMedName] = useState('')
  const [newMedDosage, setNewMedDosage] = useState('')
  const [newMedMorning, setNewMedMorning] = useState(true)
  const [newMedEvening, setNewMedEvening] = useState(false)
  const [newMedNotes, setNewMedNotes] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

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
          const pid = patientIds[0]
          setPatientId(pid)

          const { data: patientData } = await supabase
            .from('patients')
            .select('name')
            .eq('id', pid)
            .single()
          if (patientData?.name) setPatientName(patientData.name)
        }
      } catch {
        setPatientId('')
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchMedications = useCallback(async () => {
    if (!patientId || !accessToken) return
    setIsLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/api/caregiver/${patientId}/medications`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (res.ok) {
        const data = await res.json()
        setMedications(data.medications ?? [])
      }
    } catch {
      setError('Failed to load medications.')
    } finally {
      setIsLoading(false)
    }
  }, [patientId, accessToken])

  useEffect(() => {
    if (patientId && accessToken) fetchMedications()
  }, [patientId, accessToken, fetchMedications])

  const openAddForm = () => {
    setEditingMed(null)
    setNewMedName('')
    setNewMedDosage('')
    setNewMedMorning(true)
    setNewMedEvening(false)
    setNewMedNotes('')
    setShowAddMed(true)
  }

  const openEditForm = (med: MedItem) => {
    setEditingMed(med)
    setNewMedName(med.name)
    setNewMedDosage(med.dosage)
    setNewMedMorning(med.schedule?.times?.includes('08:00') ?? false)
    setNewMedEvening(med.schedule?.times?.includes('20:00') ?? false)
    setNewMedNotes(med.notes ?? '')
    setShowAddMed(true)
  }

  const handleSave = async () => {
    if (!newMedName || !newMedDosage) return
    setIsSaving(true)
    try {
      const times: string[] = []
      if (newMedMorning) times.push('08:00')
      if (newMedEvening) times.push('20:00')

      if (editingMed) {
        // Delete old and create new (simple update approach)
        await fetch(`${API_BASE}/api/caregiver/${patientId}/medications/${editingMed.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        })
      }

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
        setEditingMed(null)
        setNewMedName('')
        setNewMedDosage('')
        setNewMedMorning(true)
        setNewMedEvening(false)
        setNewMedNotes('')
        await fetchMedications()
      }
    } catch {
      setError('Failed to save medication.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleRemove = async (medId: string) => {
    if (!confirm('Remove this medication?')) return
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
      <main className="bg-white min-h-screen px-8 md:px-12 pt-12 md:pt-16">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-gray-200 rounded-full" />
          <div className="h-24 bg-gray-200 rounded-[20px]" />
          <div className="h-24 bg-gray-200 rounded-[20px]" />
        </div>
      </main>
    )
  }

  return (
    <main className="bg-white min-h-screen">
      {/* Header */}
      <div className="px-8 md:px-12 pt-12 md:pt-16 pb-6">
        <p className="text-[#8f8f8f] text-lg font-medium">{patientName}</p>
        <p className="text-black text-2xl font-bold">Manage Medication</p>
      </div>

      <div className="flex flex-col gap-4 px-8 md:px-12 pb-8">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-[20px] px-5 py-4 text-red-700 text-base">
            {error}
          </div>
        )}

        {/* Medication cards */}
        {medications.map((med, i) => {
          const bgColor = i % 2 === 0 ? '#4894fe' : '#464646'
          return (
            <div
              key={med.id}
              className="rounded-[20px] flex items-center justify-between px-6 py-5"
              style={{ background: bgColor }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-white text-lg font-bold">{med.name} {med.dosage}</p>
                <p className="text-white text-sm opacity-70 mt-0.5">{getScheduleLabel(med)}</p>
                {med.notes && (
                  <p className="text-white text-xs opacity-60 mt-1 italic">{med.notes}</p>
                )}
              </div>
              <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                <button
                  onClick={() => openEditForm(med)}
                  className="bg-[rgba(255,255,255,0.2)] text-white text-sm font-medium px-4 py-2 rounded-[10px]"
                  style={{ minHeight: '0', minWidth: '0' }}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleRemove(med.id)}
                  className="bg-[rgba(255,255,255,0.1)] text-white text-sm font-medium px-3 py-2 rounded-[10px]"
                  style={{ minHeight: '0', minWidth: '0' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path fillRule="evenodd" d="M16.5 4.478v.227a48.816 48.816 0 013.878.512.75.75 0 11-.256 1.478l-.209-.035-1.005 13.07a3 3 0 01-2.991 2.77H8.084a3 3 0 01-2.991-2.77L4.087 6.66l-.209.035a.75.75 0 01-.256-1.478A48.567 48.567 0 017.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 013.369 0c1.603.051 2.815 1.387 2.815 2.951zm-6.136-1.452a51.196 51.196 0 013.273 0C14.39 3.05 15 3.684 15 4.478v.113a49.488 49.488 0 00-6 0v-.113c0-.794.609-1.428 1.364-1.452zm-.355 5.945a.75.75 0 10-1.5.058l.347 9a.75.75 0 101.499-.058l-.346-9zm5.48.058a.75.75 0 10-1.498-.058l-.347 9a.75.75 0 001.5.058l.345-9z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          )
        })}

        {medications.length === 0 && (
          <div className="text-center py-8">
            <p className="text-[#b4b4b4] text-base">No medications on record.</p>
          </div>
        )}

        {/* Add medication button */}
        {!showAddMed && (
          <button
            onClick={openAddForm}
            className="bg-[#4894fe] text-white rounded-[20px] px-6 py-4 flex items-center justify-center gap-2 font-semibold text-base"
            style={{ minHeight: '0', minWidth: '0' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path fillRule="evenodd" d="M12 3.75a.75.75 0 01.75.75v6.75h6.75a.75.75 0 010 1.5h-6.75v6.75a.75.75 0 01-1.5 0v-6.75H4.5a.75.75 0 010-1.5h6.75V4.5a.75.75 0 01.75-.75z" clipRule="evenodd" />
            </svg>
            Add Medication
          </button>
        )}

        {/* Add / Edit form */}
        {showAddMed && (
          <div className="bg-[#f5f5f5] rounded-[20px] p-6 flex flex-col gap-4">
            <p className="text-black text-lg font-bold">{editingMed ? 'Edit Medication' : 'New Medication'}</p>

            <input
              type="text"
              placeholder="Medication name (e.g. Metformin)"
              value={newMedName}
              onChange={e => setNewMedName(e.target.value)}
              className="w-full bg-white rounded-[15px] px-5 py-3 text-base text-black placeholder:text-[#b4b4b4] outline-none border border-[#e4e4e4] focus:border-[#4894fe]"
              style={{ minHeight: '0' }}
            />
            <input
              type="text"
              placeholder="Dosage (e.g. 500mg)"
              value={newMedDosage}
              onChange={e => setNewMedDosage(e.target.value)}
              className="w-full bg-white rounded-[15px] px-5 py-3 text-base text-black placeholder:text-[#b4b4b4] outline-none border border-[#e4e4e4] focus:border-[#4894fe]"
              style={{ minHeight: '0' }}
            />

            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer" style={{ minHeight: '0', minWidth: '0' }}>
                <input
                  type="checkbox"
                  checked={newMedMorning}
                  onChange={e => setNewMedMorning(e.target.checked)}
                  className="w-5 h-5 accent-[#4894fe]"
                  style={{ minHeight: '0', minWidth: '0' }}
                />
                <span className="text-[#464646] text-base">Morning (8am)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer" style={{ minHeight: '0', minWidth: '0' }}>
                <input
                  type="checkbox"
                  checked={newMedEvening}
                  onChange={e => setNewMedEvening(e.target.checked)}
                  className="w-5 h-5 accent-[#4894fe]"
                  style={{ minHeight: '0', minWidth: '0' }}
                />
                <span className="text-[#464646] text-base">Evening (8pm)</span>
              </label>
            </div>

            <input
              type="text"
              placeholder="Notes (optional, e.g. Take with food)"
              value={newMedNotes}
              onChange={e => setNewMedNotes(e.target.value)}
              className="w-full bg-white rounded-[15px] px-5 py-3 text-base text-black placeholder:text-[#b4b4b4] outline-none border border-[#e4e4e4] focus:border-[#4894fe]"
              style={{ minHeight: '0' }}
            />

            <div className="flex gap-3">
              <button
                onClick={handleSave}
                disabled={isSaving || !newMedName || !newMedDosage}
                className="flex-1 bg-[#4894fe] text-white rounded-[15px] py-3 font-semibold text-base disabled:opacity-50"
                style={{ minHeight: '0', minWidth: '0' }}
              >
                {isSaving ? 'Saving…' : editingMed ? 'Save Changes' : 'Add Medication'}
              </button>
              <button
                onClick={() => { setShowAddMed(false); setEditingMed(null) }}
                className="flex-1 bg-white text-[#8f8f8f] rounded-[15px] py-3 font-medium text-base border border-[#e4e4e4]"
                style={{ minHeight: '0', minWidth: '0' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
