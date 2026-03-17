#!/usr/bin/env python3
"""
Phase 9 — Demo reset script.

Resets the database to the clean demo starting state for
"A Week in Ah Ma's Life". Can be re-run before each demo.

What this resets:
  - Clears medication_logs, vitals, alerts, conversations, audit_log
    for Mdm Tan Ah Ma (and only her — does not touch other patients).
  - Re-seeds 7 days of medication logs (3 missed evening Metformin doses,
    barrier: forgot / nausea / nausea).
  - Re-seeds 7 days of vitals (blood glucose + blood pressure readings).
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

PATIENT_ID    = "a1b2c3d4-0000-0000-0000-000000000001"
MED_METFORMIN = "c1b2c3d4-0000-0000-0000-000000000003"
MED_AMLO      = "c2b2c3d4-0000-0000-0000-000000000004"


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

    for table, col in tables_to_clear:
        admin.table(table).delete().eq(col, PATIENT_ID).execute()
        print(f"  ✓  Cleared {table}")

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
    print(f"  ✓  Inserted {len(vitals)} vital readings")

    # ── Summary ───────────────────────────────────────────────────────────────
    print()
    print("Demo state:")
    print(f"  Period      : {days[0].isoformat()} → {days[-1].isoformat()} (7 days)")
    print(f"  Missed doses: Evening Metformin on {days[0]}, {days[1]}, {days[2]}")
    print(f"  Barriers    : forgot, nausea, nausea")
    print(f"  Vitals      : Blood glucose range 7.0–9.4 mmol/L | BP 134–145/83–90 mmHg")
    print()
    print("Ready to demo. 🎉")
    print("=" * 60)


if __name__ == "__main__":
    main()
