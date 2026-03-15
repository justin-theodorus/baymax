#!/usr/bin/env python3
"""
Phase 9 — Create test users for each stakeholder.

Creates three demo auth accounts in Supabase and links them to
the corresponding application records (patient, caregiver, clinician).

Usage:
    cd backend
    python scripts/create_test_users.py

Demo credentials created:
    Patient   — patient@baymax.demo   / BaymaxDemo2026!
    Caregiver — caregiver@baymax.demo / BaymaxDemo2026!
    Clinician — clinician@baymax.demo / BaymaxDemo2026!
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import settings
from supabase import create_client

# ── Constants ──────────────────────────────────────────────────────────────────
PATIENT_APP_ID   = "a1b2c3d4-0000-0000-0000-000000000001"
CAREGIVER_APP_ID = "b1b2c3d4-0000-0000-0000-000000000002"
CLINICIAN_APP_ID = "d1b2c3d4-0000-0000-0000-000000000010"

DEMO_PASSWORD = "BaymaxDemo2026!"

USERS = [
    {
        "email":    "patient@baymax.demo",
        "role":     "patient",
        "app_id":   PATIENT_APP_ID,
        "table":    "patients",
        "label":    "Mdm Tan Ah Ma (patient)",
    },
    {
        "email":    "caregiver@baymax.demo",
        "role":     "caregiver",
        "app_id":   CAREGIVER_APP_ID,
        "table":    "caregivers",
        "label":    "Tan Wei Ling (caregiver)",
    },
    {
        "email":    "clinician@baymax.demo",
        "role":     "clinician",
        "app_id":   CLINICIAN_APP_ID,
        "table":    "clinicians",
        "label":    "Dr. Tan Wei Jie (clinician)",
    },
]


def main() -> None:
    # Use the secret key so we can call admin API
    admin = create_client(settings.supabase_url, settings.supabase_secret_key)

    print("=" * 60)
    print("Baymax 2.0 — Creating demo test users")
    print("=" * 60)

    # ── Ensure clinician app record exists ────────────────────────────────────
    existing = (
        admin.table("clinicians")
        .select("id")
        .eq("id", CLINICIAN_APP_ID)
        .execute()
    )
    if not existing.data:
        admin.table("clinicians").insert({
            "id":         CLINICIAN_APP_ID,
            "name":       "Dr. Tan Wei Jie",
            "specialty":  "Family Medicine",
            "patient_ids": [PATIENT_APP_ID],
        }).execute()
        print(f"  ✓  Created clinician app record ({CLINICIAN_APP_ID})")
    else:
        print(f"  –  Clinician app record already exists")

    # ── Create / update auth users ────────────────────────────────────────────
    for u in USERS:
        email   = u["email"]
        app_id  = u["app_id"]
        table   = u["table"]
        label   = u["label"]

        # Check if user already exists
        existing_users = admin.auth.admin.list_users()
        auth_user = next(
            (au for au in existing_users if au.email == email), None
        )

        if auth_user:
            auth_uid = str(auth_user.id)
            print(f"  –  Auth user already exists: {email}  (uid={auth_uid[:8]}…)")
        else:
            result = admin.auth.admin.create_user({
                "email":          email,
                "password":       DEMO_PASSWORD,
                "email_confirm":  True,
            })
            auth_uid = str(result.user.id)
            print(f"  ✓  Created auth user: {email}  (uid={auth_uid[:8]}…)")

        # Link auth user to app record
        update_result = (
            admin.table(table)
            .update({"user_id": auth_uid})
            .eq("id", app_id)
            .execute()
        )
        if update_result.data:
            print(f"     Linked to {label}")
        else:
            print(f"  ⚠  Could not link {email} to {table}.id={app_id} — check the record exists")

    print()
    print("=" * 60)
    print("Demo credentials")
    print("=" * 60)
    print(f"  Patient   →  patient@baymax.demo   / {DEMO_PASSWORD}")
    print(f"              Login at: http://localhost:3000/patient/login")
    print()
    print(f"  Caregiver →  caregiver@baymax.demo / {DEMO_PASSWORD}")
    print(f"              Login at: http://localhost:3000/caregiver/login")
    print()
    print(f"  Clinician →  clinician@baymax.demo / {DEMO_PASSWORD}")
    print(f"              Login at: http://localhost:3000/clinician/login")
    print("=" * 60)
    print()
    print("NOTE: The Supabase JWT custom-claims hook must be configured")
    print("for role-based access to work. See IMPLEMENTATION_PLAN.md §1.5.")
    print()


if __name__ == "__main__":
    main()
