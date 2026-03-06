from typing import TypedDict, Literal

import anthropic
from langgraph.graph import StateGraph, END
from supabase import create_client

from app.config import settings
from app.mcp_servers.patient_context import fetch_timeline
from app.mcp_servers.medication import get_todays_meds, safety_gate
from app.rag.retrieve import retrieve_guidelines


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

    resolved_language = patient_data.get("language_pref") or state.get("language", "en")

    return {
        "patient_context": {"timeline": timeline, "profile": patient_data},
        "medication_status": med_status,
        "cultural_context": patient_data.get("cultural_context", {}),
        "language": resolved_language,
        "rag_chunks": rag_chunks,
    }


def companion_respond(state: BaymaxState) -> dict:
    messages = state.get("messages", [])
    language = state.get("language", "en")
    patient_context = state.get("patient_context", {})
    medication_status = state.get("medication_status", {})
    rag_chunks = state.get("rag_chunks", [])

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
            }

    profile = patient_context.get("profile", {})
    patient_name = profile.get("name", "Friend")
    conditions = ", ".join(profile.get("conditions") or []) or "not specified"

    pending = [m["name"] for m in medication_status.get("pending_today", [])]
    taken = [m["name"] for m in medication_status.get("taken_today", [])]
    med_summary = f"Medications taken today: {taken or 'none'}. Pending: {pending or 'none'}."

    rag_block = ""
    if rag_chunks:
        rag_block = "\n\n[CLINICAL GUIDELINES]\n" + "\n---\n".join(
            f"Source: {c.get('source', '')}\n{c.get('content', '')}" for c in rag_chunks
        )

    system_prompt = f"""You are Baymax, a caring and warm AI health companion for elderly Singaporeans managing chronic conditions.

Patient name: {patient_name}
Conditions: {conditions}
{med_summary}

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

    return {"response_text": response.content[0].text}


def safety_check(state: BaymaxState) -> dict:
    response_text = state.get("response_text", "")
    result = safety_gate(response_text)
    if not result["safe"]:
        return {"response_text": result["fallback"]}
    return {}


def build_companion_graph():
    workflow = StateGraph(BaymaxState)
    workflow.add_node("retrieve_context", retrieve_context)
    workflow.add_node("companion_respond", companion_respond)
    workflow.add_node("safety_check", safety_check)

    workflow.set_entry_point("retrieve_context")
    workflow.add_edge("retrieve_context", "companion_respond")
    workflow.add_edge("companion_respond", "safety_check")
    workflow.add_edge("safety_check", END)

    return workflow.compile()
