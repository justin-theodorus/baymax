import re
from datetime import datetime, timezone

from supabase import create_client

from app.config import settings

# PolicyGate banned patterns (case-insensitive)
BANNED_PATTERNS = [
    r"stop taking",
    r"increase your dose",
    r"decrease your dose",
    r"you have [a-z]",
    r"you might have",
    r"diagnosed with",
    r"prescribe",
    r"i recommend changing",
]

SAFE_FALLBACK = (
    "I'm here to support you, but I'm not able to give medical advice about your medications. "
    "Please speak with your doctor or pharmacist for guidance on your treatment. "
    "我不能提供关于药物的医疗建议。请咨询您的医生或药剂师。"
)


def _sb():
    return create_client(settings.supabase_url, settings.supabase_secret_key)


def get_todays_meds(patient_id: str) -> dict:
    sb = _sb()
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    today_end = now.replace(hour=23, minute=59, second=59, microsecond=999999).isoformat()

    meds = (
        sb.table("medications")
        .select("*")
        .eq("patient_id", patient_id)
        .eq("active", True)
        .execute()
        .data
    )
    logs = (
        sb.table("medication_logs")
        .select("*")
        .eq("patient_id", patient_id)
        .gte("scheduled_time", today_start)
        .lte("scheduled_time", today_end)
        .execute()
        .data
    )

    taken_ids = {log["medication_id"] for log in logs if log.get("taken")}

    # Normalise schedule to a consistent dict format regardless of DB column name
    def _normalise_schedule(med: dict) -> dict:
        if "schedule_times" in med:
            med = {**med, "schedule": {"times": med["schedule_times"], "frequency": med.get("frequency", "daily")}}
        return med

    meds_normalised = [_normalise_schedule(m) for m in meds]

    return {
        "medications": meds_normalised,
        "logs": logs,
        "taken_today": [m for m in meds_normalised if m["id"] in taken_ids],
        "pending_today": [m for m in meds_normalised if m["id"] not in taken_ids],
    }


def log_dose(patient_id: str, med_id: str, taken: bool, timestamp: str | None = None) -> dict:
    sb = _sb()
    ts = timestamp or datetime.now(timezone.utc).isoformat()
    record: dict = {
        "patient_id": patient_id,
        "medication_id": med_id,
        "scheduled_time": ts,
        "taken": taken,
    }
    if taken:
        record["taken_at"] = ts
    result = sb.table("medication_logs").insert(record).execute()
    return {"success": True, "id": result.data[0]["id"] if result.data else None}


def missed_dose_flow(patient_id: str, med_id: str) -> dict:
    return {
        "type": "barrier_elicitation",
        "message": (
            "It looks like you may have missed a dose. That's okay — it happens! "
            "Could you tell me why? Was it because you forgot, felt unwell, or something else? "
            "看起来您可能错过了一剂药。没关系！能告诉我原因吗？是忘记了、感觉不舒服，还是其他原因？"
        ),
        "options": ["Forgot", "Felt unwell", "Side effects", "Ran out", "Other"],
        "patient_id": patient_id,
        "medication_id": med_id,
    }


def safety_gate(response_text: str) -> dict:
    text_lower = response_text.lower()
    for pattern in BANNED_PATTERNS:
        match = re.search(pattern, text_lower)
        if match:
            try:
                _sb().table("audit_log").insert(
                    {
                        "agent": "safety_gate",
                        "action": "response_blocked",
                        "reasoning": f"Triggered pattern: '{pattern}' matched '{match.group(0)}'",
                    }
                ).execute()
            except Exception:
                pass
            return {
                "safe": False,
                "triggered_phrase": match.group(0),
                "fallback": SAFE_FALLBACK,
            }
    return {"safe": True, "triggered_phrase": None, "fallback": None}
