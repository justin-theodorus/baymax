export type UserRole = 'patient' | 'caregiver' | 'clinician'

export interface CurrentUser {
  id: string
  email?: string
  role: UserRole
  app_user_id: string
}

export interface Patient {
  id: string
  user_id: string | null
  name: string
  age: number
  language_pref: 'en' | 'zh' | 'ms' | 'ta'
  conditions: string[]
  cultural_context: Record<string, unknown>
  consent: {
    caregiver_sharing: boolean
    data_retention_days: number
  }
  created_at: string
}

export interface Medication {
  id: string
  patient_id: string
  name: string
  dosage: string
  frequency: string
  schedule_times: string[]
  active: boolean
  created_at: string
}

export interface MedicationLog {
  id: string
  patient_id: string
  medication_id: string
  scheduled_time: string
  taken: boolean
  taken_at: string | null
  barrier_reason: string | null
  created_at: string
}

export interface Vital {
  id: string
  patient_id: string
  type: 'blood_glucose' | 'blood_pressure_systolic' | 'blood_pressure_diastolic' | 'heart_rate' | 'weight'
  value: number
  unit: string
  recorded_at: string
  source: 'patient_reported' | 'device' | 'clinician' | 'caregiver'
}

export interface Conversation {
  id: string
  patient_id: string
  role: 'user' | 'assistant'
  content: string
  language: string
  created_at: string
}

export interface Alert {
  id: string
  patient_id: string
  caregiver_id: string
  severity: 'critical' | 'warning' | 'info'
  type: string
  summary: string
  status: 'pending' | 'acknowledged' | 'resolved'
  created_at: string
}

export interface Caregiver {
  id: string
  user_id: string | null
  name: string
  relationship: string
  patient_ids: string[]
  telegram_chat_id: string | null
  consent_scope: {
    summary: boolean
    alerts: boolean
    medications: boolean
    vitals: boolean
  }
  created_at: string
}

export interface Clinician {
  id: string
  user_id: string | null
  name: string
  specialty: string
  patient_ids: string[]
  created_at: string
}

export interface ClinicalReport {
  id: string
  patient_id: string
  clinician_id: string | null
  period_start: string
  period_end: string
  content: Record<string, unknown>
  generated_at: string
}

export interface AuditLog {
  id: string
  agent: string
  action: string
  patient_id: string
  reasoning: string | null
  data_sources: string[] | null
  confidence: number | null
  created_at: string
}
