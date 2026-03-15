"""MCP Server E — Governance & Audit.

Centralized governance layer for all agent decisions, tool calls, and escalations.
The audit_log table is append-only — no UPDATE or DELETE is ever permitted.
All audit writes must go through this module.
"""

from datetime import datetime, timezone
from typing import Literal

from supabase import create_client

from app.config import settings

# Deterministic banned phrase patterns from PRD section 6.1
BANNED_PATTERNS = [
    "stop taking",
    "increase your dose",
    "decrease your dose",
    "you might have",
    "diagnosed with",
    "i recommend changing",
    "prescribe",
    "stop the medication",
    "you have diabetes",
    "you have hypertension",
    "change your medication",
    "take more",
    "take less",
]


def _sb():
    return create_client(settings.supabase_url, settings.supabase_secret_key)


def audit_log(
    agent: str,
    action: str,
    patient_id: str | None = None,
    reasoning: str = "",
    data_sources: list[str] | None = None,
    confidence: float = 1.0,
) -> dict:
    """Append an immutable audit trail entry for an agent action.

    This is the single authoritative write path for all audit logging.
    Wrapped in try/except — audit failures must never interrupt patient care.

    Args:
        agent: Name of the agent or module performing the action.
        action: Specific action being logged (e.g. "response_generated", "escalation_decision").
        patient_id: UUID of the patient affected (None for system-level actions).
        reasoning: Human-readable explanation of why this action was taken.
        data_sources: List of data sources consulted (e.g. ["medication_logs", "vitals"]).
        confidence: 0.0–1.0 confidence score for AI-derived decisions.

    Returns:
        { success: bool, id: str|None }
    """
    try:
        result = _sb().table("audit_log").insert({
            "agent": agent,
            "action": action,
            "patient_id": patient_id,
            "reasoning": reasoning[:2000] if reasoning else "",
            "data_sources": data_sources or [],
            "confidence": confidence,
        }).execute()
        return {"success": True, "id": result.data[0]["id"] if result.data else None}
    except Exception:
        return {"success": False, "id": None}


def policy_gate(action_type: str, context: dict) -> dict:
    """Validate a proposed action against governance rules.

    Checks response text for banned phrases (PolicyGate).
    Logs every check — pass or block — to the audit trail.

    Args:
        action_type: Type of action to validate (e.g. "response_text", "escalation").
        context: Dict containing the content to validate and patient context.

    Returns:
        { allowed: bool, reason: str|None, fallback: str|None }
    """
    patient_id = context.get("patient_id")

    if action_type == "response_text":
        response_text = context.get("text", "")
        text_lower = response_text.lower()

        for pattern in BANNED_PATTERNS:
            if pattern in text_lower:
                fallback = (
                    "I think this is something best discussed with your doctor. "
                    "Would you like me to note it for your next visit?"
                )
                audit_log(
                    agent="policy_gate",
                    action="response_blocked",
                    patient_id=patient_id,
                    reasoning=f"Banned pattern detected: '{pattern}'",
                    data_sources=["response_text"],
                    confidence=1.0,
                )
                return {
                    "allowed": False,
                    "reason": f"Banned pattern: '{pattern}'",
                    "fallback": fallback,
                }

        audit_log(
            agent="policy_gate",
            action="response_allowed",
            patient_id=patient_id,
            reasoning="Response passed PolicyGate checks",
            data_sources=["response_text"],
            confidence=1.0,
        )
        return {"allowed": True, "reason": None, "fallback": None}

    # Default: allow other action types with a log
    audit_log(
        agent="policy_gate",
        action=f"action_allowed:{action_type}",
        patient_id=patient_id,
        reasoning=f"Action type '{action_type}' passed governance validation",
        data_sources=[],
        confidence=1.0,
    )
    return {"allowed": True, "reason": None, "fallback": None}


def escalate_urgent(patient_id: str, trigger: str, context: dict) -> dict:
    """Log and structure an urgent escalation event.

    Called by the emergency handler to create a permanent audit record.

    Args:
        patient_id: UUID of the patient.
        trigger: The specific phrase or event that triggered the escalation.
        context: Additional context (patient name, escalation reason, etc.).

    Returns:
        Structured escalation payload with audit record ID.
    """
    patient_name = context.get("patient_name", "Patient")
    escalation_reason = context.get("reason", "emergency_keywords")

    audit_result = audit_log(
        agent="emergency_handler",
        action=f"emergency_escalation:{escalation_reason}",
        patient_id=patient_id,
        reasoning=(
            f"Emergency escalation triggered for {patient_name}. "
            f"Trigger: {trigger[:200]}. "
            f"Context: {escalation_reason}. "
            "Patient directed to call 995. Caregiver alerted."
        ),
        data_sources=["conversation"],
        confidence=1.0,
    )

    return {
        "audit_id": audit_result.get("id"),
        "patient_id": patient_id,
        "trigger": trigger,
        "reason": escalation_reason,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "response_action": "995_safety_script_delivered",
        "caregiver_alerted": True,
    }
