-- Baymax 2.0 — Demo Seed Data
-- Run this in the Supabase SQL Editor to reset demo data.
-- Patient: Mdm Tan Ah Ma | Caregiver: Tan Wei Ling

-- ── Patient ──────────────────────────────────────────────────────────────────
INSERT INTO patients (id, name, age, language_pref, conditions, cultural_context, consent)
VALUES (
  'a1b2c3d4-0000-0000-0000-000000000001',
  'Mdm Tan Ah Ma',
  72,
  'zh',
  ARRAY['Type 2 Diabetes', 'Hypertension'],
  '{"dietary_prefs": "Chinese", "hawker_regular": true, "tcm_use": false, "religion": "Buddhist", "languages_spoken": ["zh", "en"]}',
  '{"caregiver_sharing": true, "data_retention_days": 365}'
)
ON CONFLICT (id) DO NOTHING;

-- ── Caregiver ─────────────────────────────────────────────────────────────────
INSERT INTO caregivers (id, name, relationship, patient_ids, consent_scope)
VALUES (
  'b1b2c3d4-0000-0000-0000-000000000002',
  'Tan Wei Ling',
  'daughter',
  ARRAY['a1b2c3d4-0000-0000-0000-000000000001'::UUID],
  '{"summary": true, "alerts": true, "medications": true, "vitals": true}'
)
ON CONFLICT (id) DO NOTHING;

-- ── Medications ───────────────────────────────────────────────────────────────
INSERT INTO medications (id, patient_id, name, dosage, frequency, schedule_times)
VALUES
  ('c1b2c3d4-0000-0000-0000-000000000003', 'a1b2c3d4-0000-0000-0000-000000000001', 'Metformin', '500mg', 'twice daily', ARRAY['08:00', '20:00']),
  ('c2b2c3d4-0000-0000-0000-000000000004', 'a1b2c3d4-0000-0000-0000-000000000001', 'Amlodipine', '5mg', 'once daily', ARRAY['08:00'])
ON CONFLICT (id) DO NOTHING;

-- ── Medication Logs (7 days) ──────────────────────────────────────────────────
-- Morning Metformin (all taken)
INSERT INTO medication_logs (patient_id, medication_id, scheduled_time, taken, taken_at)
SELECT 'a1b2c3d4-0000-0000-0000-000000000001', 'c1b2c3d4-0000-0000-0000-000000000003',
  (CURRENT_DATE - INTERVAL '6 days' + (d || ' days')::INTERVAL)::DATE + TIME '08:00', true,
  (CURRENT_DATE - INTERVAL '6 days' + (d || ' days')::INTERVAL)::DATE + TIME '08:15'
FROM generate_series(0, 6) AS d ON CONFLICT DO NOTHING;

-- Evening Metformin (missed Mon/Tue/Wed, barrier: forgot/nausea/nausea)
INSERT INTO medication_logs (patient_id, medication_id, scheduled_time, taken, taken_at, barrier_reason)
SELECT 'a1b2c3d4-0000-0000-0000-000000000001', 'c1b2c3d4-0000-0000-0000-000000000003',
  (CURRENT_DATE - INTERVAL '6 days' + (d || ' days')::INTERVAL)::DATE + TIME '20:00',
  CASE WHEN d < 3 THEN false ELSE true END,
  CASE WHEN d < 3 THEN NULL ELSE (CURRENT_DATE - INTERVAL '6 days' + (d || ' days')::INTERVAL)::DATE + TIME '20:20' END,
  CASE WHEN d = 0 THEN 'forgot' WHEN d = 1 THEN 'nausea' WHEN d = 2 THEN 'nausea' ELSE NULL END
FROM generate_series(0, 6) AS d ON CONFLICT DO NOTHING;

-- Amlodipine (all taken)
INSERT INTO medication_logs (patient_id, medication_id, scheduled_time, taken, taken_at)
SELECT 'a1b2c3d4-0000-0000-0000-000000000001', 'c2b2c3d4-0000-0000-0000-000000000004',
  (CURRENT_DATE - INTERVAL '6 days' + (d || ' days')::INTERVAL)::DATE + TIME '08:00', true,
  (CURRENT_DATE - INTERVAL '6 days' + (d || ' days')::INTERVAL)::DATE + TIME '08:10'
FROM generate_series(0, 6) AS d ON CONFLICT DO NOTHING;

-- ── Vitals (7 days) ───────────────────────────────────────────────────────────
INSERT INTO vitals (patient_id, type, value, unit, recorded_at, source)
SELECT 'a1b2c3d4-0000-0000-0000-000000000001', 'blood_glucose', v, 'mmol/L',
  (CURRENT_DATE - INTERVAL '6 days' + (d || ' days')::INTERVAL)::DATE + TIME '09:00', 'patient_reported'
FROM (VALUES (0,7.2),(1,8.1),(2,9.4),(3,7.8),(4,7.5),(5,7.0),(6,7.3)) AS t(d,v) ON CONFLICT DO NOTHING;

INSERT INTO vitals (patient_id, type, value, unit, recorded_at, source)
SELECT 'a1b2c3d4-0000-0000-0000-000000000001', 'blood_pressure_systolic', v, 'mmHg',
  (CURRENT_DATE - INTERVAL '6 days' + (d || ' days')::INTERVAL)::DATE + TIME '09:05', 'patient_reported'
FROM (VALUES (0,138),(1,142),(2,145),(3,140),(4,136),(5,134),(6,137)) AS t(d,v) ON CONFLICT DO NOTHING;

INSERT INTO vitals (patient_id, type, value, unit, recorded_at, source)
SELECT 'a1b2c3d4-0000-0000-0000-000000000001', 'blood_pressure_diastolic', v, 'mmHg',
  (CURRENT_DATE - INTERVAL '6 days' + (d || ' days')::INTERVAL)::DATE + TIME '09:05', 'patient_reported'
FROM (VALUES (0,85),(1,88),(2,90),(3,87),(4,84),(5,83),(6,86)) AS t(d,v) ON CONFLICT DO NOTHING;
