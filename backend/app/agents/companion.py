from typing import TypedDict, Literal
from datetime import datetime, timezone

import anthropic
from langgraph.graph import StateGraph, END
from supabase import create_client

from app.config import settings
from app.mcp_servers.patient_context import fetch_timeline
from app.mcp_servers.medication import get_todays_meds, safety_gate, missed_dose_flow
from app.rag.retrieve import retrieve_guidelines
from app.mcp_servers.clinician_summary import generate_weekly_brief
from app.mcp_servers.governance import audit_log as gov_audit, policy_gate as gov_policy_gate


class BaymaxState(TypedDict):
    patient_id: str
    messages: list
    patient_context: dict
    medication_status: dict
    cultural_context: dict
    language: str
    escalation_type: Literal["none", "caregiver", "clinician", "both", "emergency"]
    alert_payload: dict
    report_payload: dict
    response_text: str
    rag_chunks: list
    barrier_reason: str
    overdue_meds: list


LANGUAGE_DIRECTIVES = {
    "en": "Respond in English.",
    "zh": "请用中文（普通话）回应。Respond in Mandarin Chinese.",
    "ms": "Sila balas dalam Bahasa Melayu.",
    "ta": "தமிழில் பதில் அளிக்கவும்.",
}

EMERGENCY_KEYWORDS = [
    "chest pain", "胸痛", "chest tightness", "chest pressure",
    "difficulty breathing", "呼吸困难", "cannot breathe", "can't breathe",
    "shortness of breath", "气喘", "heart attack", "心脏病发",
    "stroke", "中风", "fainted", "unconscious", "昏迷",
    "severe pain", "剧烈疼痛", "call 995", "emergency",
]


def _sb():
    return create_client(settings.supabase_url, settings.supabase_secret_key)


def retrieve_context(state: BaymaxState) -> dict:
    patient_id = state["patient_id"]
    messages = state.get("messages", [])

    # Fetch patient profile
    patient_result = _sb().table("patients").select("*").eq("id", patient_id).execute()
    patient_data = patient_result.data[0] if patient_result.data else {}

    timeline = fetch_timeline(patient_id, days=7)
    med_status = get_todays_meds(patient_id)

    # RAG: retrieve guidelines based on last user message + patient conditions
    last_user_msg = next(
        (m["content"] for m in reversed(messages) if m.get("role") == "user"), ""
    )
    conditions = patient_data.get("conditions", [])
    rag_chunks: list = []
    if last_user_msg and conditions:
        rag_chunks = retrieve_guidelines(last_user_msg, conditions, top_k=5)

    # Request language takes priority; fall back to patient's profile preference
    resolved_language = state.get("language") or patient_data.get("language_pref", "en")

    # Detect overdue medications (scheduled time has passed, not yet taken)
    now = datetime.now(timezone.utc)
    overdue_meds = []
    for med in med_status.get("pending_today", []):
        schedule = med.get("schedule", {})
        for t in schedule.get("times", []):
            try:
                hour, minute = map(int, t.split(":"))
                scheduled_dt = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
                if scheduled_dt < now:
                    overdue_meds.append({"id": med["id"], "name": med["name"], "scheduled_time": t})
                    break
            except Exception:
                pass

    return {
        "patient_context": {"timeline": timeline, "profile": patient_data},
        "medication_status": med_status,
        "cultural_context": patient_data.get("cultural_context", {}),
        "language": resolved_language,
        "rag_chunks": rag_chunks,
        "overdue_meds": overdue_meds,
    }


BARRIER_KEYWORDS = [
    "forgot", "forget", "nausea", "nauseous", "side effect", "sick", "feel unwell",
    "ran out", "no more", "too expensive", "confused", "don't understand",
    "忘了", "忘记", "恶心", "副作用", "没有了", "太贵", "不舒服",
]


def _detect_barrier_reason(text: str) -> str | None:
    """Extract a barrier reason category from patient message text."""
    text_lower = text.lower()
    if any(k in text_lower for k in ["forgot", "forget", "忘了", "忘记"]):
        return "forgot"
    if any(k in text_lower for k in ["nausea", "nauseous", "sick", "unwell", "恶心", "不舒服"]):
        return "side_effects"
    if any(k in text_lower for k in ["side effect", "副作用"]):
        return "side_effects"
    if any(k in text_lower for k in ["ran out", "no more", "没有了"]):
        return "ran_out"
    if any(k in text_lower for k in ["expensive", "cost", "money", "太贵"]):
        return "cost"
    if any(k in text_lower for k in ["confused", "don't understand", "不懂"]):
        return "complexity"
    return None


def companion_respond(state: BaymaxState) -> dict:
    messages = state.get("messages", [])
    language = state.get("language", "en")
    patient_context = state.get("patient_context", {})
    medication_status = state.get("medication_status", {})
    rag_chunks = state.get("rag_chunks", [])
    overdue_meds = state.get("overdue_meds", [])

    # Emergency keyword check on last user message
    last_user_msg = next(
        (m["content"] for m in reversed(messages) if m.get("role") == "user"), ""
    )
    for kw in EMERGENCY_KEYWORDS:
        if kw.lower() in last_user_msg.lower():
            return {
                "response_text": (
                    "I am very concerned about you. Please call **995** (Singapore Emergency) "
                    "immediately! If you cannot call, ask someone nearby to help you now. "
                    "我非常担心您。请立即拨打 **995**（新加坡紧急服务）！"
                ),
                "escalation_type": "emergency",
                "barrier_reason": "",
            }

    profile = patient_context.get("profile", {})
    patient_name = profile.get("name", "Friend")
    conditions = ", ".join(profile.get("conditions") or []) or "not specified"

    pending = [m["name"] for m in medication_status.get("pending_today", [])]
    taken = [m["name"] for m in medication_status.get("taken_today", [])]
    med_summary = f"Medications taken today: {taken or 'none'}. Pending: {pending or 'none'}."

    # Overdue medication context for the prompt
    overdue_block = ""
    if overdue_meds:
        overdue_names = ", ".join(m["name"] for m in overdue_meds)
        overdue_block = (
            f"\nOVERDUE MEDICATIONS: {overdue_names} — scheduled time has passed and not yet taken. "
            "Gently ask about any missed doses in a caring, non-judgmental way. "
            "If the patient says they forgot or had a reason, acknowledge empathetically."
        )

    rag_block = ""
    if rag_chunks:
        rag_block = "\n\n[CLINICAL GUIDELINES]\n" + "\n---\n".join(
            f"Source: {c.get('source', '')}\n{c.get('content', '')}" for c in rag_chunks
        )

    system_prompt = f"""You are Baymax, a caring and warm AI health companion for elderly Singaporeans managing chronic conditions.

Patient name: {patient_name}
Conditions: {conditions}
{med_summary}{overdue_block}

CRITICAL RULES — you must NEVER violate these:
1. Never say "stop taking", "increase your dose", "decrease your dose", "you have [condition]", "you might have", "diagnosed with", "prescribe", or "I recommend changing".
2. If the patient mentions chest pain, difficulty breathing, heart attack, stroke, or any emergency: respond ONLY with "Please call 995 immediately!" and nothing else.
3. All health guidance must be grounded in the provided clinical guidelines below.
4. Be warm, patient, and use simple language suitable for elderly patients (70+).
5. {LANGUAGE_DIRECTIVES.get(language, LANGUAGE_DIRECTIVES['en'])}
6. Keep responses concise — 2 to 4 sentences maximum.
7. Never claim to be a doctor or give diagnostic opinions.{rag_block}"""

    anthropic_messages = [
        {"role": m["role"], "content": m["content"]}
        for m in messages
        if m.get("role") in ("user", "assistant")
    ]

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=512,
        system=system_prompt,
        messages=anthropic_messages,
    )

    response_text = response.content[0].text

    # Detect if patient is explaining a barrier reason
    detected_barrier = _detect_barrier_reason(last_user_msg)

    # If patient mentions a barrier and there are overdue meds, log it
    if detected_barrier and overdue_meds:
        try:
            patient_id = state.get("patient_id", "")
            med_id = overdue_meds[0]["id"]
            from app.mcp_servers.medication import log_dose
            log_dose(patient_id, med_id, taken=False)
            # Update barrier reason via Supabase
            sb = create_client(settings.supabase_url, settings.supabase_secret_key)
            sb.table("medication_logs").update(
                {"barrier_reason": detected_barrier}
            ).eq("patient_id", patient_id).eq("medication_id", med_id).eq("taken", False).execute()
        except Exception:
            pass

    return {
        "response_text": response_text,
        "barrier_reason": detected_barrier or "",
    }


def safety_check(state: BaymaxState) -> dict:
    response_text = state.get("response_text", "")
    patient_id = state.get("patient_id", "")

    # Run centralized PolicyGate via MCP Server E
    gate_result = gov_policy_gate("response_text", {
        "text": response_text,
        "patient_id": patient_id,
    })

    if not gate_result["allowed"]:
        final_text = gate_result.get("fallback", response_text)
        return {"response_text": final_text}

    # Also run local regex check for any patterns not caught above
    local_result = safety_gate(response_text)
    if not local_result["safe"]:
        return {"response_text": local_result["fallback"]}

    # Audit: log successful response delivery
    gov_audit(
        agent="companion",
        action="response_delivered",
        patient_id=patient_id,
        reasoning="Companion agent response passed safety checks and was delivered to patient",
        data_sources=["rag_guidelines", "medication_logs", "patient_profile"],
        confidence=0.9,
    )
    return {"response_text": response_text}


def evaluate_escalation(state: BaymaxState) -> dict:
    """Check escalation trigger rules and set escalation_type in state.

    Rules (in priority order):
    1. emergency — already set by companion_respond (emergency keywords)
    2. caregiver — 3+ missed doses in 7 days
    3. caregiver — vital anomaly (glucose > 11 or < 4 mmol/L)
    4. caregiver — 3+ consecutive negative sentiment check-ins
    5. clinician — same symptom mentioned 2+ times (stubbed: log only)
    """
    # Respect emergency already flagged by companion_respond
    current_escalation = state.get("escalation_type", "none")
    if current_escalation == "emergency":
        patient_id = state.get("patient_id", "")
        patient_context = state.get("patient_context", {})
        profile = patient_context.get("profile", {})
        last_user_msg = next(
            (m["content"] for m in reversed(state.get("messages", [])) if m.get("role") == "user"), ""
        )
        return {
            "escalation_type": "emergency",
            "alert_payload": {
                "reason": "emergency_keywords",
                "trigger": last_user_msg[:200],
                "patient_name": profile.get("name", "Patient"),
                "urgency": "critical",
            },
        }

    patient_id = state.get("patient_id", "")
    if not patient_id:
        return {"escalation_type": "none", "alert_payload": {}}

    sb = _sb()
    from datetime import timedelta

    now = datetime.now(timezone.utc)
    week_ago = (now - timedelta(days=7)).isoformat()

    patient_context = state.get("patient_context", {})
    profile = patient_context.get("profile", {})
    patient_name = profile.get("name", "Patient")

    escalation_type = "none"
    alert_payload: dict = {}

    # Rule 1: 3+ missed doses in 7 days → caregiver
    try:
        missed_logs = (
            sb.table("medication_logs")
            .select("id, medication_id, barrier_reason")
            .eq("patient_id", patient_id)
            .eq("taken", False)
            .gte("scheduled_time", week_ago)
            .execute()
            .data
        )
        if len(missed_logs) >= 3:
            barrier_reasons = list(set(
                l["barrier_reason"] for l in missed_logs if l.get("barrier_reason")
            ))
            escalation_type = "caregiver"
            alert_payload = {
                "reason": "missed_doses",
                "missed_count": len(missed_logs),
                "barrier_reasons": barrier_reasons,
                "urgency": "warning",
                "summary": (
                    f"{patient_name} has missed {len(missed_logs)} medication dose(s) in the past 7 days. "
                    + (f"Reported reasons: {', '.join(barrier_reasons)}." if barrier_reasons else "")
                ),
            }
    except Exception:
        pass

    # Rule 2: Vital anomaly (glucose out of range) → caregiver (overrides warning with warning)
    if escalation_type != "caregiver":
        try:
            recent_vitals = (
                sb.table("vitals")
                .select("type, value, recorded_at")
                .eq("patient_id", patient_id)
                .eq("type", "blood_glucose")
                .gte("recorded_at", week_ago)
                .order("recorded_at", desc=True)
                .limit(5)
                .execute()
                .data
            )
            for vital in recent_vitals:
                val = float(vital.get("value", 0))
                if val > 11 or val < 4:
                    escalation_type = "caregiver"
                    alert_payload = {
                        "reason": "vital_anomaly",
                        "vital_type": "blood_glucose",
                        "value": val,
                        "urgency": "warning",
                        "summary": (
                            f"{patient_name}'s blood glucose reading of {val} mmol/L is outside the safe range (4-11 mmol/L)."
                        ),
                    }
                    break
        except Exception:
            pass

    # Rule 3: 3+ consecutive negative sentiment (check last 3 assistant messages for sentiment cues)
    if escalation_type == "none":
        try:
            recent_convs = (
                sb.table("conversations")
                .select("content, role")
                .eq("patient_id", patient_id)
                .eq("role", "user")
                .order("created_at", desc=True)
                .limit(5)
                .execute()
                .data
            )
            negative_kw = [
                "sad", "lonely", "depressed", "hopeless", "tired", "exhausted", "pain",
                "hurt", "scared", "worried", "anxious", "难过", "孤独", "痛", "害怕", "累"
            ]
            negative_count = sum(
                1 for conv in recent_convs
                if any(kw in conv.get("content", "").lower() for kw in negative_kw)
            )
            if negative_count >= 3:
                escalation_type = "caregiver"
                alert_payload = {
                    "reason": "mood_decline",
                    "negative_checkin_count": negative_count,
                    "urgency": "info",
                    "summary": (
                        f"{patient_name} has expressed negative sentiment in {negative_count} recent conversations. "
                        "Consider checking in with them."
                    ),
                }
        except Exception:
            pass

    # Log the escalation decision via MCP Server E (centralized audit)
    gov_audit(
        agent="evaluate_escalation",
        action=f"escalation_decision:{escalation_type}",
        patient_id=patient_id,
        reasoning=alert_payload.get("summary", "No escalation triggered"),
        data_sources=["medication_logs", "vitals", "conversations"],
        confidence=1.0,
    )

    return {
        "escalation_type": escalation_type,
        "alert_payload": alert_payload,
    }


def caregiver_liaison(state: BaymaxState) -> dict:
    """Generate a plain-language caregiver summary and send a Telegram alert."""
    from app.mcp_servers.caregiver_comms import notify_caregiver

    patient_id = state.get("patient_id", "")
    alert_payload = state.get("alert_payload", {})
    urgency = alert_payload.get("urgency", "warning")
    summary = alert_payload.get("summary", "")

    if not summary or not patient_id:
        return {}

    # Use Claude Haiku to refine the summary into a warm, plain-language caregiver message
    try:
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        haiku_response = client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=200,
            system=(
                "You are writing a short, warm alert message to a family caregiver about their elderly parent's health. "
                "Keep it to 2-3 sentences. Be factual, calm, and caring. "
                "NEVER include raw conversations. NEVER make diagnoses. "
                "End with a suggested action."
            ),
            messages=[{"role": "user", "content": f"Alert context: {summary}"}],
        )
        refined_summary = haiku_response.content[0].text
    except Exception:
        refined_summary = summary

    notify_caregiver(patient_id, refined_summary, urgency)

    # Audit: log caregiver notification
    gov_audit(
        agent="caregiver_liaison",
        action=f"caregiver_notified:{urgency}",
        patient_id=patient_id,
        reasoning=f"Caregiver alert sent. Urgency: {urgency}. Summary: {refined_summary[:200]}",
        data_sources=["alert_payload", "medication_logs"],
        confidence=1.0,
    )

    return {"alert_payload": {**alert_payload, "sent_summary": refined_summary}}


EMERGENCY_SAFETY_SCRIPT = (
    "I am very concerned about you. Please call **995** (Singapore Emergency) immediately! "
    "If you cannot call, ask someone nearby to help you now. "
    "我非常担心您。请立即拨打 **995**（新加坡紧急服务）！"
)


def emergency_handler(state: BaymaxState) -> dict:
    """Handle emergency: deliver 995 safety script and send critical Telegram alert.

    The safety script is ALWAYS returned regardless of any downstream failure.
    Telegram failure must never suppress the 995 response.
    """
    from app.mcp_servers.caregiver_comms import notify_caregiver
    from app.mcp_servers.governance import escalate_urgent

    patient_id = state.get("patient_id", "")
    alert_payload = state.get("alert_payload", {})
    trigger = alert_payload.get("trigger", "Emergency keyword detected")
    patient_name = alert_payload.get("patient_name", "Patient")

    emergency_summary = (
        f"🚨 EMERGENCY: {patient_name} may be in immediate danger. "
        f"They said: \"{trigger[:100]}\". "
        "Baymax has directed them to call 995. Please contact them immediately."
    )

    # Caregiver Telegram alert — wrapped so any failure is silent, never surfaces to patient
    try:
        if patient_id:
            notify_caregiver(patient_id, emergency_summary, urgency="critical")
    except Exception:
        pass

    # Immutable governance audit via MCP Server E
    try:
        escalate_urgent(
            patient_id=patient_id,
            trigger=trigger,
            context={
                "patient_name": patient_name,
                "reason": "emergency_keywords",
                "summary": emergency_summary,
            },
        )
    except Exception:
        pass

    # Safety script is unconditional — returned regardless of above outcomes
    return {"response_text": EMERGENCY_SAFETY_SCRIPT}


def clinician_bridge(state: BaymaxState) -> dict:
    """Generate a structured clinical summary report when a clinician escalation is triggered."""
    patient_id = state.get("patient_id", "")
    if not patient_id:
        return {}

    try:
        result = generate_weekly_brief(patient_id)
        report_payload = result.get("report", {})

        # Audit: log report generation via MCP Server E
        gov_audit(
            agent="clinician_bridge",
            action="clinician_report_generated",
            patient_id=patient_id,
            reasoning="Clinician escalation triggered — weekly brief compiled",
            data_sources=["medication_logs", "vitals", "conversations", "alerts"],
            confidence=0.9,
        )

        return {"report_payload": report_payload}
    except Exception:
        return {}


def _route_escalation(state: BaymaxState) -> str:
    """Conditional routing function for LangGraph."""
    escalation_type = state.get("escalation_type", "none")
    if escalation_type == "emergency":
        return "emergency_handler"
    if escalation_type in ("caregiver", "both"):
        return "caregiver_liaison"
    if escalation_type == "clinician":
        return "clinician_bridge"
    return END


def build_companion_graph():
    workflow = StateGraph(BaymaxState)

    workflow.add_node("retrieve_context", retrieve_context)
    workflow.add_node("companion_respond", companion_respond)
    workflow.add_node("safety_check", safety_check)
    workflow.add_node("evaluate_escalation", evaluate_escalation)
    workflow.add_node("caregiver_liaison", caregiver_liaison)
    workflow.add_node("emergency_handler", emergency_handler)
    workflow.add_node("clinician_bridge", clinician_bridge)

    workflow.set_entry_point("retrieve_context")
    workflow.add_edge("retrieve_context", "companion_respond")
    workflow.add_edge("companion_respond", "safety_check")
    workflow.add_edge("safety_check", "evaluate_escalation")

    workflow.add_conditional_edges(
        "evaluate_escalation",
        _route_escalation,
        {
            "caregiver_liaison": "caregiver_liaison",
            "emergency_handler": "emergency_handler",
            "clinician_bridge": "clinician_bridge",
            END: END,
        },
    )

    workflow.add_edge("caregiver_liaison", END)
    workflow.add_edge("emergency_handler", END)
    workflow.add_edge("clinician_bridge", END)

    return workflow.compile()
