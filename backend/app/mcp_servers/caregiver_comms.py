"""MCP Server C — Caregiver Comms (consent-gated).

Only callable when patient.consent.caregiver_sharing == true.
Handles all outbound communications to caregivers via Telegram.
"""

from datetime import datetime, timezone, timedelta

import anthropic
import httpx
from supabase import create_client

from app.config import settings


URGENCY_EMOJI = {
    "critical": "🔴",
    "warning": "🟡",
    "info": "🟢",
}

URGENCY_LABEL = {
    "critical": "CRITICAL",
    "warning": "Warning",
    "info": "Info",
}


def _sb():
    return create_client(settings.supabase_url, settings.supabase_secret_key)


def get_consent_scope(patient_id: str, caregiver_id: str) -> dict:
    """Check what data this caregiver can receive for the given patient."""
    sb = _sb()
    row = (
        sb.table("caregivers")
        .select("consent_scope, patient_ids")
        .eq("id", caregiver_id)
        .execute()
        .data
    )
    if not row:
        return {"caregiver_sharing": False, "scope": {}, "reason": "caregiver_not_linked"}

    caregiver = row[0]
    patient_ids = caregiver.get("patient_ids") or []
    if patient_id not in patient_ids:
        return {"caregiver_sharing": False, "scope": {}, "reason": "caregiver_not_linked_to_patient"}

    consent_scope = caregiver.get("consent_scope") or {}
    return {
        "caregiver_sharing": bool(consent_scope.get("caregiver_sharing", True)),
        "scope": consent_scope,
    }


def _send_telegram_message(chat_id: str, text: str) -> bool:
    """Send a message via Telegram Bot API. Returns True on success."""
    if not settings.telegram_bot_token or not chat_id:
        return False
    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
    try:
        resp = httpx.post(
            url,
            json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
            timeout=10.0,
        )
        return resp.status_code == 200
    except Exception:
        return False


def notify_caregiver(patient_id: str, summary: str, urgency: str = "warning") -> dict:
    """Send an alert to the caregiver via Telegram and record it in the alerts table.

    Args:
        patient_id: The patient's UUID.
        summary: Plain-language summary of the alert (no raw transcripts).
        urgency: "critical" | "warning" | "info"

    Returns:
        { success, alert_id, telegram_sent }
    """
    sb = _sb()

    # Fetch caregiver linked to this patient (patient_ids is an array)
    caregiver_row = (
        sb.table("caregivers")
        .select("id, telegram_chat_id, consent_scope, patient_ids")
        .execute()
        .data
    )
    # Filter to caregivers who have this patient_id in their patient_ids array
    caregiver_row = [c for c in caregiver_row if patient_id in (c.get("patient_ids") or [])]
    if not caregiver_row:
        return {"success": False, "reason": "no_caregiver_found"}

    caregiver = caregiver_row[0]
    consent_scope = caregiver.get("consent_scope") or {}

    # Consent check
    if not consent_scope.get("caregiver_sharing", True):
        return {"success": False, "reason": "consent_not_granted"}

    # Fetch patient name for message context
    patient_row = (
        sb.table("patients")
        .select("name")
        .eq("id", patient_id)
        .execute()
        .data
    )
    patient_name = patient_row[0]["name"] if patient_row else "Your family member"

    # Format Telegram message
    emoji = URGENCY_EMOJI.get(urgency, "🟡")
    label = URGENCY_LABEL.get(urgency, "Alert")
    timestamp = datetime.now(timezone.utc).strftime("%d %b %Y, %I:%M %p")
    telegram_text = (
        f"{emoji} <b>Baymax {label}</b>\n\n"
        f"<b>Patient:</b> {patient_name}\n"
        f"<b>Time:</b> {timestamp}\n\n"
        f"{summary}\n\n"
        f"<i>Tap to open the Baymax caregiver dashboard for details.</i>"
    )

    # Insert alert to database (use actual schema columns: summary not message)
    alert_result = (
        sb.table("alerts")
        .insert({
            "patient_id": patient_id,
            "severity": urgency,
            "type": "companion_escalation",
            "summary": summary,
            "status": "pending",
        })
        .execute()
    )
    alert_id = alert_result.data[0]["id"] if alert_result.data else None

    # Send Telegram notification
    telegram_chat_id = caregiver.get("telegram_chat_id", "")
    telegram_sent = _send_telegram_message(telegram_chat_id, telegram_text)

    return {
        "success": True,
        "alert_id": alert_id,
        "telegram_sent": telegram_sent,
        "urgency": urgency,
    }


def share_weekly_digest(patient_id: str) -> dict:
    """Generate and send a weekly health digest to the caregiver via Telegram.

    Uses Claude Haiku to generate a plain-language summary.
    Never exposes raw conversation transcripts.

    Returns:
        { success, digest_text }
    """
    sb = _sb()

    # Fetch caregiver linked to this patient
    all_caregivers = (
        sb.table("caregivers")
        .select("id, telegram_chat_id, consent_scope, patient_ids")
        .execute()
        .data
    )
    caregiver_row = [c for c in all_caregivers if patient_id in (c.get("patient_ids") or [])]
    if not caregiver_row:
        return {"success": False, "reason": "no_caregiver_found"}

    caregiver = caregiver_row[0]
    consent_scope = caregiver.get("consent_scope") or {}
    if not consent_scope.get("caregiver_sharing", True):
        return {"success": False, "reason": "consent_not_granted"}

    # Fetch patient info
    patient_row = (
        sb.table("patients")
        .select("name, conditions, age")
        .eq("id", patient_id)
        .execute()
        .data
    )
    if not patient_row:
        return {"success": False, "reason": "patient_not_found"}
    patient = patient_row[0]

    # Gather 7-day data
    now = datetime.now(timezone.utc)
    week_ago = (now - timedelta(days=7)).isoformat()

    med_logs = (
        sb.table("medication_logs")
        .select("taken, barrier_reason, scheduled_time, medication_id")
        .eq("patient_id", patient_id)
        .gte("scheduled_time", week_ago)
        .execute()
        .data
    )

    vitals = (
        sb.table("vitals")
        .select("type, value, unit, recorded_at")
        .eq("patient_id", patient_id)
        .gte("recorded_at", week_ago)
        .execute()
        .data
    )

    alerts_this_week = (
        sb.table("alerts")
        .select("severity, summary, created_at")
        .eq("patient_id", patient_id)
        .gte("created_at", week_ago)
        .execute()
        .data
    )

    # Compute adherence
    total_logs = len(med_logs)
    taken_count = sum(1 for l in med_logs if l.get("taken"))
    adherence_pct = round((taken_count / total_logs * 100) if total_logs > 0 else 0)

    # Collect barrier reasons
    barriers = [l["barrier_reason"] for l in med_logs if l.get("barrier_reason")]
    barrier_summary = ", ".join(set(b for b in barriers if b)) if barriers else "none reported"

    # Summarize vitals
    vitals_summary = []
    for v in vitals[-5:]:
        vitals_summary.append(f"{v['type']}: {v['value']} {v.get('unit', '')}")
    vitals_text = "; ".join(vitals_summary) if vitals_summary else "No recent vitals recorded"

    # Use Claude Haiku to generate the digest
    data_context = f"""Patient: {patient['name']}, Age {patient.get('age', 'unknown')}
Conditions: {', '.join(patient.get('conditions') or [])}
Week: {(now - timedelta(days=7)).strftime('%d %b')} – {now.strftime('%d %b %Y')}

Medication adherence: {adherence_pct}% ({taken_count}/{total_logs} doses taken)
Missed dose barriers: {barrier_summary}
Recent vitals: {vitals_text}
Alerts this week: {len(alerts_this_week)} (severities: {', '.join(a['severity'] for a in alerts_this_week) or 'none'})"""

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    haiku_response = client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=400,
        system=(
            "You are generating a weekly health digest for a caregiver of an elderly patient. "
            "Write 4-5 short bullet points summarising the week. "
            "Be warm, factual, and plain-language. "
            "NEVER include raw conversation content. "
            "NEVER make diagnoses or prescriptive recommendations. "
            "Flag anything that might need the caregiver's attention. "
            "Always end with one positive note."
        ),
        messages=[{"role": "user", "content": data_context}],
    )
    digest_text = haiku_response.content[0].text

    # Store digest in clinician_reports (reused as digest store; schema uses `content` JSONB)
    report_result = (
        sb.table("clinician_reports")
        .insert({
            "patient_id": patient_id,
            "period_start": (now - timedelta(days=7)).isoformat(),
            "period_end": now.isoformat(),
            "content": {
                "type": "weekly_caregiver_digest",
                "digest_text": digest_text,
                "adherence_pct": adherence_pct,
                "vitals_summary": vitals_text,
                "alert_count": len(alerts_this_week),
            },
        })
        .execute()
    )

    # Format and send via Telegram
    telegram_chat_id = caregiver.get("telegram_chat_id", "")
    timestamp = now.strftime("%d %b %Y")
    telegram_text = (
        f"🟢 <b>Baymax Weekly Digest</b> — {patient['name']}\n"
        f"<i>{(now - timedelta(days=7)).strftime('%d %b')} – {timestamp}</i>\n\n"
        f"{digest_text}"
    )
    telegram_sent = _send_telegram_message(telegram_chat_id, telegram_text)

    return {
        "success": True,
        "digest_text": digest_text,
        "adherence_pct": adherence_pct,
        "telegram_sent": telegram_sent,
    }
