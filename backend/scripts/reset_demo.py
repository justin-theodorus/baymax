#!/usr/bin/env python3
"""
Phase 9 — Demo reset script.

Resets the database to the clean demo starting state for
"A Week in Ah Ma's Life". Can be re-run before each demo.

What this resets:
  - Clears medication_logs, vitals, alerts, conversations, audit_log
    for Mdm Tan Ah Ma, Mr Lim Ah Kow, and Mdm Nair Kamala.
  - Re-seeds 7 days of medication logs for all three patients.
  - Re-seeds 7 days of vitals for all three patients.
  - Leaves the patient, caregiver, clinician, and medication records intact.

Usage:
    cd backend
    python scripts/reset_demo.py
"""

import sys
import os
from datetime import date, timedelta, time, datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import settings
from supabase import create_client

PATIENT_TAN_ID    = "a1b2c3d4-0000-0000-0000-000000000001"
PATIENT_ID        = PATIENT_TAN_ID   # backward-compat alias
PATIENT_LIM_ID    = "a2b2c3d4-0000-0000-0000-000000000002"
PATIENT_KAMALA_ID = "a3b2c3d4-0000-0000-0000-000000000003"

MED_METFORMIN     = "c1b2c3d4-0000-0000-0000-000000000003"
MED_AMLO          = "c2b2c3d4-0000-0000-0000-000000000004"
MED_LIM_LOSARTAN  = "c3b2c3d4-0000-0000-0000-000000000005"
MED_LIM_ASPIRIN   = "c4b2c3d4-0000-0000-0000-000000000006"
MED_KAMALA_METF   = "c5b2c3d4-0000-0000-0000-000000000007"
MED_KAMALA_CALC   = "c6b2c3d4-0000-0000-0000-000000000008"

CAREGIVER2_APP_ID = "b2b2c3d4-0000-0000-0000-000000000009"
CLINICIAN_APP_ID  = "d1b2c3d4-0000-0000-0000-000000000010"


def ts(d: date, t: time) -> str:
    """Build an ISO-8601 UTC timestamp string from a date and time."""
    return datetime.combine(d, t, tzinfo=timezone.utc).isoformat()


def main() -> None:
    admin = create_client(settings.supabase_url, settings.supabase_secret_key)

    print("=" * 60)
    print("Baymax 2.0 — Demo Reset")
    print("=" * 60)

    today = date.today()
    start = today - timedelta(days=6)          # 7 days back (day 0 … day 6)
    days  = [start + timedelta(days=i) for i in range(7)]

    # ── 1. Clear time-sensitive tables ────────────────────────────────────────
    tables_to_clear = [
        ("medication_logs",   "patient_id"),
        ("vitals",            "patient_id"),
        ("alerts",            "patient_id"),
        ("conversations",     "patient_id"),
        ("clinician_reports", "patient_id"),  # clears stored digests + reports
        # audit_log is append-only by design — never deleted
    ]

    for pid in [PATIENT_TAN_ID, PATIENT_LIM_ID, PATIENT_KAMALA_ID]:
        for table, col in tables_to_clear:
            admin.table(table).delete().eq(col, pid).execute()
    print(f"  ✓  Cleared time-sensitive tables for all 3 patients")

    # ── 2. Medication logs ────────────────────────────────────────────────────
    med_logs = []

    # Morning Metformin (all taken, d0–d6)
    for d in days:
        med_logs.append({
            "patient_id":    PATIENT_ID,
            "medication_id": MED_METFORMIN,
            "scheduled_time": ts(d, time(8, 0)),
            "taken":         True,
            "taken_at":      ts(d, time(8, 15)),
            "barrier_reason": None,
        })

    # Evening Metformin (missed d0/d1/d2, barrier: forgot/nausea/nausea; taken d3–d6)
    evening_barriers = {0: "forgot", 1: "nausea", 2: "nausea"}
    for i, d in enumerate(days):
        missed = i < 3
        med_logs.append({
            "patient_id":    PATIENT_ID,
            "medication_id": MED_METFORMIN,
            "scheduled_time": ts(d, time(20, 0)),
            "taken":         not missed,
            "taken_at":      None if missed else ts(d, time(20, 20)),
            "barrier_reason": evening_barriers.get(i),
        })

    # Amlodipine morning (all taken, d0–d6)
    for d in days:
        med_logs.append({
            "patient_id":    PATIENT_ID,
            "medication_id": MED_AMLO,
            "scheduled_time": ts(d, time(8, 0)),
            "taken":         True,
            "taken_at":      ts(d, time(8, 10)),
            "barrier_reason": None,
        })

    admin.table("medication_logs").insert(med_logs).execute()
    print(f"  ✓  Inserted {len(med_logs)} medication log entries")

    # ── 3. Vitals ─────────────────────────────────────────────────────────────
    glucose_values = [7.2, 8.1, 9.4, 7.8, 7.5, 7.0, 7.3]
    bp_sys_values  = [138, 142, 145, 140, 136, 134, 137]
    bp_dia_values  = [85,  88,  90,  87,  84,  83,  86]

    vitals = []
    for i, d in enumerate(days):
        vitals.append({
            "patient_id":  PATIENT_ID,
            "type":        "blood_glucose",
            "value":       glucose_values[i],
            "unit":        "mmol/L",
            "recorded_at": ts(d, time(9, 0)),
            "source":      "patient_reported",
        })
        vitals.append({
            "patient_id":  PATIENT_ID,
            "type":        "blood_pressure_systolic",
            "value":       bp_sys_values[i],
            "unit":        "mmHg",
            "recorded_at": ts(d, time(9, 5)),
            "source":      "patient_reported",
        })
        vitals.append({
            "patient_id":  PATIENT_ID,
            "type":        "blood_pressure_diastolic",
            "value":       bp_dia_values[i],
            "unit":        "mmHg",
            "recorded_at": ts(d, time(9, 5)),
            "source":      "patient_reported",
        })

    admin.table("vitals").insert(vitals).execute()
    print(f"  ✓  Inserted {len(vitals)} vital readings (Mdm Tan)")

    # ── 4. Upsert new patient records ─────────────────────────────────────────
    admin.table("patients").upsert({
        "id": PATIENT_LIM_ID,
        "name": "Mr Lim Ah Kow",
        "age": 68,
        "conditions": ["Hypertension", "Heart Disease"],
        "language_pref": "zh",
    }).execute()

    admin.table("patients").upsert({
        "id": PATIENT_KAMALA_ID,
        "name": "Mdm Nair Kamala",
        "age": 75,
        "conditions": ["Type 2 Diabetes", "Osteoarthritis"],
        "language_pref": "ta",
    }).execute()
    print("  ✓  Upserted patient records for Lim Ah Kow and Nair Kamala")

    # ── 5. Upsert medications for new patients ────────────────────────────────
    admin.table("medications").upsert([
        {
            "id": MED_LIM_LOSARTAN,
            "patient_id": PATIENT_LIM_ID,
            "name": "Losartan",
            "dosage": "50mg",
            "frequency": "daily",
            "schedule_times": ["08:00"],
            "active": True,
        },
        {
            "id": MED_LIM_ASPIRIN,
            "patient_id": PATIENT_LIM_ID,
            "name": "Aspirin",
            "dosage": "100mg",
            "frequency": "daily",
            "schedule_times": ["08:00"],
            "active": True,
        },
        {
            "id": MED_KAMALA_METF,
            "patient_id": PATIENT_KAMALA_ID,
            "name": "Metformin",
            "dosage": "500mg",
            "frequency": "twice daily",
            "schedule_times": ["08:00", "20:00"],
            "active": True,
        },
        {
            "id": MED_KAMALA_CALC,
            "patient_id": PATIENT_KAMALA_ID,
            "name": "Calcium + Vit D",
            "dosage": "600mg",
            "frequency": "daily",
            "schedule_times": ["12:00"],
            "active": True,
        },
    ]).execute()
    print("  ✓  Upserted medications for Lim Ah Kow and Nair Kamala")

    # ── 6. Upsert caregiver 2 ─────────────────────────────────────────────────
    admin.table("caregivers").upsert({
        "id":           CAREGIVER2_APP_ID,
        "name":         "Lim Wei Ming",
        "relationship": "Son",
        "patient_ids":  [PATIENT_LIM_ID],
        "telegram_chat_id": None,
    }).execute()
    print("  ✓  Upserted caregiver 2 (Lim Wei Ming)")

    # ── 7. Update clinician panel ─────────────────────────────────────────────
    admin.table("clinicians").update({
        "patient_ids": [PATIENT_TAN_ID, PATIENT_LIM_ID, PATIENT_KAMALA_ID]
    }).eq("id", CLINICIAN_APP_ID).execute()
    print("  ✓  Updated clinician patient panel to include all 3 patients")

    # ── 8. Medication logs — Mr Lim Ah Kow ───────────────────────────────────
    lim_logs = []

    # Losartan 08:00 — all taken (d0–d6)
    for d in days:
        lim_logs.append({
            "patient_id":     PATIENT_LIM_ID,
            "medication_id":  MED_LIM_LOSARTAN,
            "scheduled_time": ts(d, time(8, 0)),
            "taken":          True,
            "taken_at":       ts(d, time(8, 20)),
            "barrier_reason": None,
        })

    # Aspirin 08:00 — all taken except day 4 (index 4)
    for i, d in enumerate(days):
        missed = (i == 4)
        lim_logs.append({
            "patient_id":     PATIENT_LIM_ID,
            "medication_id":  MED_LIM_ASPIRIN,
            "scheduled_time": ts(d, time(8, 0)),
            "taken":          not missed,
            "taken_at":       None if missed else ts(d, time(8, 25)),
            "barrier_reason": "forgot" if missed else None,
        })

    admin.table("medication_logs").insert(lim_logs).execute()
    print(f"  ✓  Inserted {len(lim_logs)} medication log entries (Lim Ah Kow)")

    # ── 9. Medication logs — Mdm Nair Kamala ─────────────────────────────────
    kamala_logs = []

    # Metformin 08:00 — all taken (d0–d6)
    for d in days:
        kamala_logs.append({
            "patient_id":     PATIENT_KAMALA_ID,
            "medication_id":  MED_KAMALA_METF,
            "scheduled_time": ts(d, time(8, 0)),
            "taken":          True,
            "taken_at":       ts(d, time(8, 10)),
            "barrier_reason": None,
        })

    # Metformin 20:00 — missed days 1, 3, 5 (indices 1/3/5)
    evening_barriers_kamala = {1: "nausea", 3: "forgot", 5: "forgot"}
    for i, d in enumerate(days):
        missed = i in evening_barriers_kamala
        kamala_logs.append({
            "patient_id":     PATIENT_KAMALA_ID,
            "medication_id":  MED_KAMALA_METF,
            "scheduled_time": ts(d, time(20, 0)),
            "taken":          not missed,
            "taken_at":       None if missed else ts(d, time(20, 15)),
            "barrier_reason": evening_barriers_kamala.get(i),
        })

    # Calcium 12:00 — all taken except day 2 (index 2)
    for i, d in enumerate(days):
        missed = (i == 2)
        kamala_logs.append({
            "patient_id":     PATIENT_KAMALA_ID,
            "medication_id":  MED_KAMALA_CALC,
            "scheduled_time": ts(d, time(12, 0)),
            "taken":          not missed,
            "taken_at":       None if missed else ts(d, time(12, 10)),
            "barrier_reason": "forgot" if missed else None,
        })

    admin.table("medication_logs").insert(kamala_logs).execute()
    print(f"  ✓  Inserted {len(kamala_logs)} medication log entries (Nair Kamala)")

    # ── 10. Vitals — Mr Lim Ah Kow ───────────────────────────────────────────
    lim_bp_sys = [148, 152, 145, 150, 147, 143, 149]
    lim_bp_dia = [92,  95,  90,  93,  91,  88,  94]
    lim_hr     = [72,  75,  68,  74,  71,  69,  73]

    lim_vitals = []
    for i, d in enumerate(days):
        lim_vitals.append({
            "patient_id":  PATIENT_LIM_ID,
            "type":        "blood_pressure_systolic",
            "value":       lim_bp_sys[i],
            "unit":        "mmHg",
            "recorded_at": ts(d, time(9, 0)),
            "source":      "patient_reported",
        })
        lim_vitals.append({
            "patient_id":  PATIENT_LIM_ID,
            "type":        "blood_pressure_diastolic",
            "value":       lim_bp_dia[i],
            "unit":        "mmHg",
            "recorded_at": ts(d, time(9, 0)),
            "source":      "patient_reported",
        })
        lim_vitals.append({
            "patient_id":  PATIENT_LIM_ID,
            "type":        "heart_rate",
            "value":       lim_hr[i],
            "unit":        "bpm",
            "recorded_at": ts(d, time(9, 5)),
            "source":      "patient_reported",
        })

    admin.table("vitals").insert(lim_vitals).execute()
    print(f"  ✓  Inserted {len(lim_vitals)} vital readings (Lim Ah Kow)")

    # ── 11. Vitals — Mdm Nair Kamala ─────────────────────────────────────────
    kamala_glucose = [9.2, 10.1, 8.8, 9.5, 10.3, 9.0, 8.7]
    kamala_bp_sys  = [132, 135, 130, 133, 136, 129, 131]
    kamala_bp_dia  = [80,  83,  79,  81,  84,  78,  82]

    kamala_vitals = []
    for i, d in enumerate(days):
        kamala_vitals.append({
            "patient_id":  PATIENT_KAMALA_ID,
            "type":        "blood_glucose",
            "value":       kamala_glucose[i],
            "unit":        "mmol/L",
            "recorded_at": ts(d, time(9, 0)),
            "source":      "patient_reported",
        })
        kamala_vitals.append({
            "patient_id":  PATIENT_KAMALA_ID,
            "type":        "blood_pressure_systolic",
            "value":       kamala_bp_sys[i],
            "unit":        "mmHg",
            "recorded_at": ts(d, time(9, 5)),
            "source":      "patient_reported",
        })
        kamala_vitals.append({
            "patient_id":  PATIENT_KAMALA_ID,
            "type":        "blood_pressure_diastolic",
            "value":       kamala_bp_dia[i],
            "unit":        "mmHg",
            "recorded_at": ts(d, time(9, 5)),
            "source":      "patient_reported",
        })

    admin.table("vitals").insert(kamala_vitals).execute()
    print(f"  ✓  Inserted {len(kamala_vitals)} vital readings (Nair Kamala)")

    # ── 12. Alerts ────────────────────────────────────────────────────────────
    alerts = [
        # Lim Ah Kow — 2 alerts
        {
            "patient_id": PATIENT_LIM_ID,
            "severity":   "warning",
            "type":       "vitals",
            "summary":    "Blood pressure 152/95 mmHg — above target range",
            "status":     "acknowledged",
            "created_at": ts(days[1], time(9, 0)),
        },
        {
            "patient_id": PATIENT_LIM_ID,
            "severity":   "info",
            "type":       "medication",
            "summary":    "Aspirin missed on Day 4",
            "status":     "pending",
            "created_at": ts(days[4], time(9, 0)),
        },
        # Nair Kamala — 3 alerts
        {
            "patient_id": PATIENT_KAMALA_ID,
            "severity":   "warning",
            "type":       "vitals",
            "summary":    "Blood glucose 10.3 mmol/L — borderline high",
            "status":     "pending",
            "created_at": ts(days[4], time(9, 0)),
        },
        {
            "patient_id": PATIENT_KAMALA_ID,
            "severity":   "warning",
            "type":       "medication",
            "summary":    "Evening Metformin missed 3 times this week",
            "status":     "pending",
            "created_at": ts(days[5], time(9, 0)),
        },
        {
            "patient_id": PATIENT_KAMALA_ID,
            "severity":   "info",
            "type":       "medication",
            "summary":    "Calcium supplement missed on Day 2",
            "status":     "acknowledged",
            "created_at": ts(days[2], time(9, 0)),
        },
    ]
    admin.table("alerts").insert(alerts).execute()
    print(f"  ✓  Inserted {len(alerts)} alerts (Lim Ah Kow + Nair Kamala)")

    # ── Summary ───────────────────────────────────────────────────────────────
    print()
    print("Demo state:")
    print(f"  Period      : {days[0].isoformat()} → {days[-1].isoformat()} (7 days)")
    print()
    print("  Mdm Tan Ah Ma (patient@baymax.demo):")
    print(f"    Missed doses: Evening Metformin on {days[0]}, {days[1]}, {days[2]}")
    print(f"    Barriers    : forgot, nausea, nausea")
    print(f"    Vitals      : Blood glucose 7.0–9.4 mmol/L | BP 134–145/83–90 mmHg")
    print()
    print("  Mr Lim Ah Kow:")
    print(f"    Missed doses: Aspirin on {days[4]}")
    print(f"    Barriers    : forgot")
    print(f"    Vitals      : BP 143–152/88–95 mmHg | HR 68–75 bpm")
    print()
    print("  Mdm Nair Kamala:")
    print(f"    Missed doses: Evening Metformin on {days[1]}, {days[3]}, {days[5]}; Calcium on {days[2]}")
    print(f"    Barriers    : nausea (day 1), forgot (days 3, 5, calcium day 2)")
    print(f"    Vitals      : Blood glucose 8.7–10.3 mmol/L | BP 129–136/78–84 mmHg")
    print()
    print("Ready to demo.")
    print("=" * 60)


if __name__ == "__main__":
    main()
