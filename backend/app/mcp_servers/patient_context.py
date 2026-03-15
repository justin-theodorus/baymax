from datetime import datetime, timedelta, timezone

from supabase import create_client

from app.config import settings

VALID_VITAL_TYPES = {
    "blood_glucose",
    "blood_pressure_systolic",
    "blood_pressure_diastolic",
    "heart_rate",
    "weight",
}

VITAL_UNITS = {
    "blood_glucose": "mmol/L",
    "blood_pressure_systolic": "mmHg",
    "blood_pressure_diastolic": "mmHg",
    "heart_rate": "bpm",
    "weight": "kg",
}


def _sb():
    return create_client(settings.supabase_url, settings.supabase_secret_key)


def fetch_timeline(patient_id: str, days: int = 7) -> dict:
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    sb = _sb()

    med_logs = (
        sb.table("medication_logs")
        .select("*")
        .eq("patient_id", patient_id)
        .gte("scheduled_time", since)
        .order("scheduled_time")
        .execute()
        .data
    )
    vitals = (
        sb.table("vitals")
        .select("*")
        .eq("patient_id", patient_id)
        .gte("recorded_at", since)
        .order("recorded_at")
        .execute()
        .data
    )
    conversations = (
        sb.table("conversations")
        .select("role,content,language,created_at")
        .eq("patient_id", patient_id)
        .gte("created_at", since)
        .order("created_at")
        .execute()
        .data
    )

    return {
        "medication_logs": med_logs,
        "vitals": vitals,
        "conversations": conversations,
    }


def log_symptom(patient_id: str, symptom: str, severity: str) -> dict:
    """Log a reported symptom to audit_log (vitals table only accepts numeric vital types)."""
    sb = _sb()
    result = (
        sb.table("audit_log")
        .insert(
            {
                "agent": "companion",
                "action": "symptom_reported",
                "patient_id": patient_id,
                "reasoning": f"symptom: {symptom}, severity: {severity}",
            }
        )
        .execute()
    )
    return {"success": True, "id": result.data[0]["id"] if result.data else None}


def log_vital(patient_id: str, vital_type: str, value: float) -> dict:
    if vital_type not in VALID_VITAL_TYPES:
        return {
            "success": False,
            "error": f"Invalid type '{vital_type}'. Must be one of {sorted(VALID_VITAL_TYPES)}",
        }
    sb = _sb()
    result = (
        sb.table("vitals")
        .insert(
            {
                "patient_id": patient_id,
                "type": vital_type,
                "value": value,
                "unit": VITAL_UNITS[vital_type],
                "recorded_at": datetime.now(timezone.utc).isoformat(),
                "source": "patient_reported",
            }
        )
        .execute()
    )
    return {"success": True, "id": result.data[0]["id"] if result.data else None}


def update_profile(patient_id: str, fields: dict) -> dict:
    allowed = {"name", "age", "language_pref", "conditions", "cultural_context", "consent"}
    filtered = {k: v for k, v in fields.items() if k in allowed}
    if not filtered:
        return {"success": False, "error": "No valid fields to update"}
    sb = _sb()
    sb.table("patients").update(filtered).eq("id", patient_id).execute()
    return {"success": True, "updated": filtered}
