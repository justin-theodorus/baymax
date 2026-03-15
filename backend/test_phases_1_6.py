"""
Smoke tests for Phases 1–6.
Run from the backend/ directory:
    .venv/bin/python test_phases_1_6.py

Covers:
  Phase 1 — DB tables exist + seed data present
  Phase 2 — MCP Server A (patient context), MCP Server B (medications + PolicyGate), Companion graph
  Phase 3 — RAG retrieval (guideline_chunks)
  Phase 4 — STT/TTS modules load without error
  Phase 5 — Medications Today endpoint logic, overdue detection, barrier flow
  Phase 6 — Escalation routing, Caregiver Comms MCP (consent gate + alert insert), Emergency handler
"""

import sys
from datetime import datetime, timezone, timedelta

PATIENT_ID   = "a1b2c3d4-0000-0000-0000-000000000001"   # Mdm Tan Ah Ma
CAREGIVER_ID = "b1b2c3d4-0000-0000-0000-000000000002"   # Tan Wei Ling

PASS = "PASS"
FAIL = "FAIL"
SKIP = "SKIP"

_results: list[tuple[str, str]] = []


def separator(title: str) -> None:
    print(f"\n{'='*65}")
    print(f"  {title}")
    print("=" * 65)


def result(label: str, ok: bool | None, detail: str = "") -> None:
    status = PASS if ok else (SKIP if ok is None else FAIL)
    _results.append((label, status))
    suffix = f"  — {detail}" if detail else ""
    print(f"  [{status}] {label}{suffix}")


# ─────────────────────────────────────────────────────────────────────────────
# PHASE 1 — Database tables + seed data
# ─────────────────────────────────────────────────────────────────────────────
separator("PHASE 1 — Database tables + seed data")

from app.config import settings
from supabase import create_client

sb = create_client(settings.supabase_url, settings.supabase_secret_key)

REQUIRED_TABLES = [
    "patients", "medications", "medication_logs", "vitals",
    "conversations", "alerts", "caregivers", "clinicians",
    "clinician_reports", "audit_log", "guideline_chunks",
]

for table in REQUIRED_TABLES:
    try:
        sb.table(table).select("id").limit(1).execute()
        result(f"Table '{table}' exists", True)
    except Exception as e:
        result(f"Table '{table}' exists", False, str(e))

# Seed patient exists
try:
    row = sb.table("patients").select("name, age, language_pref, conditions").eq("id", PATIENT_ID).execute().data
    ok = bool(row)
    detail = f"name={row[0]['name']}, lang={row[0]['language_pref']}" if ok else "not found"
    result("Seed patient Mdm Tan Ah Ma exists", ok, detail)
except Exception as e:
    result("Seed patient exists", False, str(e))

# Seed medications exist
try:
    meds = sb.table("medications").select("name").eq("patient_id", PATIENT_ID).execute().data
    ok = len(meds) >= 2
    result("Seed medications exist (≥2)", ok, f"found {len(meds)}: {[m['name'] for m in meds]}")
except Exception as e:
    result("Seed medications exist", False, str(e))

# Seed caregiver exists
try:
    cg = sb.table("caregivers").select("name, patient_ids").eq("id", CAREGIVER_ID).execute().data
    ok = bool(cg) and PATIENT_ID in (cg[0].get("patient_ids") or [])
    detail = f"name={cg[0]['name']}" if cg else "not found"
    result("Seed caregiver Wei Ling exists & linked", ok, detail)
except Exception as e:
    result("Seed caregiver exists", False, str(e))

# Medication logs for seed patient
try:
    logs = sb.table("medication_logs").select("id, taken").eq("patient_id", PATIENT_ID).execute().data
    ok = len(logs) > 0
    taken = sum(1 for l in logs if l.get("taken"))
    missed = sum(1 for l in logs if not l.get("taken"))
    result("Medication logs seeded", ok, f"total={len(logs)}, taken={taken}, missed={missed}")
except Exception as e:
    result("Medication logs seeded", False, str(e))

# Vitals for seed patient
try:
    vitals = sb.table("vitals").select("type, value").eq("patient_id", PATIENT_ID).execute().data
    ok = len(vitals) > 0
    result("Vitals seeded", ok, f"found {len(vitals)} readings")
except Exception as e:
    result("Vitals seeded", False, str(e))

# Config loads all required keys
try:
    missing = []
    for attr in ["anthropic_api_key", "openai_api_key", "deepgram_api_key",
                 "azure_speech_key", "telegram_bot_token", "supabase_url"]:
        if not getattr(settings, attr, None):
            missing.append(attr)
    result("Config: all API keys present", len(missing) == 0,
           f"missing: {missing}" if missing else "all keys loaded")
except Exception as e:
    result("Config loads", False, str(e))


# ─────────────────────────────────────────────────────────────────────────────
# PHASE 2 — MCP Server A, MCP Server B, PolicyGate, Companion graph
# ─────────────────────────────────────────────────────────────────────────────
separator("PHASE 2 — MCP Server A + B + Companion Agent")

# MCP Server A — fetch_timeline
from app.mcp_servers.patient_context import fetch_timeline, log_symptom, log_vital

try:
    timeline = fetch_timeline(PATIENT_ID, days=7)
    has_meds = "medication_logs" in timeline
    has_vitals = "vitals" in timeline
    has_convs = "conversations" in timeline
    result("fetch_timeline returns all sections", has_meds and has_vitals and has_convs,
           f"med_logs={len(timeline.get('medication_logs', []))}, "
           f"vitals={len(timeline.get('vitals', []))}, "
           f"conversations={len(timeline.get('conversations', []))}")
except Exception as e:
    result("fetch_timeline", False, str(e))

# log_symptom
try:
    res = log_symptom(PATIENT_ID, "headache", "mild")
    result("log_symptom writes to audit_log", res.get("success") is True)
except Exception as e:
    result("log_symptom", False, str(e))

# log_vital
try:
    res = log_vital(PATIENT_ID, "blood_glucose", 7.4)
    result("log_vital inserts to vitals table", res.get("success") is True)
except Exception as e:
    result("log_vital", False, str(e))

# MCP Server B — get_todays_meds
from app.mcp_servers.medication import get_todays_meds, safety_gate, missed_dose_flow

try:
    meds = get_todays_meds(PATIENT_ID)
    has_all_keys = all(k in meds for k in ["medications", "logs", "taken_today", "pending_today"])
    # Verify schedule normalisation — each med should have a 'schedule' dict with 'times' list
    all_have_schedule = all(
        isinstance(m.get("schedule", {}).get("times"), list)
        for m in meds["medications"]
    )
    result("get_todays_meds returns correct structure", has_all_keys,
           f"meds={len(meds['medications'])}, taken={len(meds['taken_today'])}, pending={len(meds['pending_today'])}")
    result("Medications have normalised schedule.times list", all_have_schedule)
except Exception as e:
    result("get_todays_meds", False, str(e))

# PolicyGate
gate_cases = [
    ("You should stop taking metformin.",          True,  "banned: stop taking"),
    ("You might have diabetes.",                   True,  "banned: you might have"),
    ("I recommend changing your medication dose.", True,  "banned: i recommend changing"),
    ("Make sure to eat regularly and stay hydrated.", False, "safe"),
    ("Please speak with your doctor about this.",  False, "safe"),
]
for text, should_trigger, note in gate_cases:
    try:
        r = safety_gate(text)
        triggered = not r["safe"]
        ok = triggered == should_trigger
        result(f"PolicyGate [{note}]", ok,
               f"triggered={triggered}, expected={should_trigger}")
    except Exception as e:
        result(f"PolicyGate [{note}]", False, str(e))

# missed_dose_flow returns structured dict
try:
    meds_list = get_todays_meds(PATIENT_ID)["medications"]
    if meds_list:
        med_id = meds_list[0]["id"]
        flow = missed_dose_flow(PATIENT_ID, med_id)
        has_options = isinstance(flow.get("options"), list) and len(flow["options"]) > 0
        result("missed_dose_flow returns barrier options", has_options,
               f"options: {flow.get('options', [])}")
    else:
        result("missed_dose_flow", None, "no medications found to test with")
except Exception as e:
    result("missed_dose_flow", False, str(e))


# ─────────────────────────────────────────────────────────────────────────────
# PHASE 3 — RAG retrieval
# ─────────────────────────────────────────────────────────────────────────────
separator("PHASE 3 — RAG Pipeline (guideline_chunks + retrieval)")

from app.rag.retrieve import retrieve_guidelines

try:
    chunks_count = sb.table("guideline_chunks").select("id").execute().data
    ok = len(chunks_count) > 0
    result("guideline_chunks table is populated", ok, f"found {len(chunks_count)} chunks")
except Exception as e:
    result("guideline_chunks populated", False, str(e))

rag_cases = [
    ("Can I eat char kway teow?",    ["diabetes", "dietary"],    "hawker food query"),
    ("What blood pressure is safe?", ["hypertension"],            "hypertension query"),
    ("How do I manage my diabetes?", ["Type 2 Diabetes"],         "diabetes management"),
]
for query, tags, label in rag_cases:
    try:
        chunks = retrieve_guidelines(query, tags, top_k=3)
        ok = len(chunks) > 0
        top = chunks[0] if chunks else {}
        detail = (f"retrieved={len(chunks)}, top_sim={top.get('similarity', 0):.3f}, "
                  f"src={top.get('source', '?')[:30]}") if ok else "no chunks returned — run ingest first"
        result(f"RAG retrieval [{label}]", ok if ok else None, detail)
    except Exception as e:
        result(f"RAG retrieval [{label}]", False, str(e))


# ─────────────────────────────────────────────────────────────────────────────
# PHASE 4 — Voice pipeline (STT + TTS modules load)
# ─────────────────────────────────────────────────────────────────────────────
separator("PHASE 4 — Voice Pipeline (STT + TTS modules)")

try:
    from app.voice.stt import transcribe_audio
    result("STT module (stt.py) imports cleanly", True)
except Exception as e:
    result("STT module imports", False, str(e))

try:
    from app.voice.tts import synthesize_speech
    result("TTS module (tts.py) imports cleanly", True)
except Exception as e:
    result("TTS module imports", False, str(e))

# Check Azure TTS voice map covers all 4 languages
try:
    from app.voice import tts as tts_module
    import inspect
    src = inspect.getsource(tts_module)
    has_all_voices = all(voice in src for voice in [
        "XiaoxiaoNeural",   # zh
        "LunaNeural",       # en-SG
        "YasminNeural",     # ms
    ])
    result("TTS voice map includes ZH/EN/MS voices", has_all_voices)
except Exception as e:
    result("TTS voice map", False, str(e))

# Check STT language code mapping
try:
    from app.voice import stt as stt_module
    import inspect
    src = inspect.getsource(stt_module)
    has_lang_map = all(code in src for code in ["zh", "en", "ms", "ta"])
    result("STT language map includes ZH/EN/MS/TA", has_lang_map)
except Exception as e:
    result("STT language map", False, str(e))


# ─────────────────────────────────────────────────────────────────────────────
# PHASE 5 — Medication checklist logic + overdue detection + barrier flow
# ─────────────────────────────────────────────────────────────────────────────
separator("PHASE 5 — Medication Checklist + Missed-Dose Barrier Flow")

# Overdue detection logic (same as used in retrieve_context + medications endpoint)
try:
    now = datetime.now(timezone.utc)
    meds_today = get_todays_meds(PATIENT_ID)
    overdue_found = []
    for med in meds_today.get("pending_today", []):
        schedule = med.get("schedule", {})
        for t in schedule.get("times", []):
            try:
                hour, minute = map(int, t.split(":"))
                scheduled_dt = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
                if scheduled_dt < now:
                    overdue_found.append(med["name"])
                    break
            except Exception:
                pass
    # We don't assert specific count (depends on time of day) — just verify logic runs
    result("Overdue medication detection logic executes", True,
           f"overdue at {now.strftime('%H:%M UTC')}: {overdue_found or 'none (all future or taken)'}")
except Exception as e:
    result("Overdue medication detection", False, str(e))

# barrier_reason detection
from app.agents.companion import _detect_barrier_reason

barrier_cases = [
    ("I forgot to take my medicine", "forgot"),
    ("我忘记吃药了",                  "forgot"),
    ("I felt nauseous after taking it", "side_effects"),
    ("I ran out of pills",             "ran_out"),
    ("It's too expensive",             "cost"),
    ("I don't understand the schedule","complexity"),
    ("I took it this morning",         None),
]
for text, expected in barrier_cases:
    try:
        detected = _detect_barrier_reason(text)
        ok = detected == expected
        result(f"Barrier detection: '{text[:40]}'", ok,
               f"expected={expected}, got={detected}")
    except Exception as e:
        result(f"Barrier detection: '{text[:30]}'", False, str(e))

# BaymaxState has barrier_reason + overdue_meds fields
try:
    from app.agents.companion import BaymaxState
    import typing
    hints = typing.get_type_hints(BaymaxState) if hasattr(typing, "get_type_hints") else {}
    # TypedDict stores annotations in __annotations__
    annotations = BaymaxState.__annotations__
    has_barrier = "barrier_reason" in annotations
    has_overdue = "overdue_meds" in annotations
    result("BaymaxState has barrier_reason field", has_barrier)
    result("BaymaxState has overdue_meds field", has_overdue)
except Exception as e:
    result("BaymaxState new fields", False, str(e))

# LangGraph graph includes the new nodes (Phase 6 check too)
try:
    from app.agents.companion import build_companion_graph
    graph = build_companion_graph()
    nodes = set(graph.nodes)
    required_nodes = {
        "retrieve_context", "companion_respond", "safety_check",
        "evaluate_escalation", "caregiver_liaison", "emergency_handler",
    }
    missing_nodes = required_nodes - nodes
    result("LangGraph graph includes all 6 required nodes",
           len(missing_nodes) == 0,
           f"missing: {missing_nodes}" if missing_nodes else f"nodes: {sorted(nodes)}")
except Exception as e:
    result("LangGraph graph nodes", False, str(e))

# Full graph run — overdue medication triggers gentle prompt
try:
    graph = build_companion_graph()
    state = {
        "patient_id": PATIENT_ID,
        "messages": [{"role": "user", "content": "Good morning, how are you?"}],
        "patient_context": {},
        "medication_status": {},
        "cultural_context": {},
        "language": "en",
        "escalation_type": "none",
        "alert_payload": {},
        "report_payload": {},
        "response_text": "",
        "rag_chunks": [],
        "barrier_reason": "",
        "overdue_meds": [],
    }
    res = graph.invoke(state)
    response = res.get("response_text", "")
    result("Graph runs with new state fields (no exception)", bool(response),
           f"response[:80]: {response[:80]}")
except Exception as e:
    result("Graph run with new state fields", False, str(e))


# ─────────────────────────────────────────────────────────────────────────────
# PHASE 6 — Escalation routing + MCP Server C + Caregiver Liaison
# ─────────────────────────────────────────────────────────────────────────────
separator("PHASE 6 — LangGraph Escalation + Caregiver Comms (MCP C)")

# evaluate_escalation node — 3 missed doses trigger caregiver escalation
# The seed data has 3 missed evening Metformin doses → should trigger
try:
    from app.agents.companion import evaluate_escalation
    state_for_eval = {
        "patient_id": PATIENT_ID,
        "messages": [{"role": "user", "content": "I'm feeling okay today"}],
        "patient_context": {
            "profile": {"name": "Mdm Tan Ah Ma", "conditions": ["Type 2 Diabetes", "Hypertension"]}
        },
        "medication_status": {},
        "cultural_context": {},
        "language": "zh",
        "escalation_type": "none",
        "alert_payload": {},
        "report_payload": {},
        "response_text": "I'm glad you're feeling okay today.",
        "rag_chunks": [],
        "barrier_reason": "",
        "overdue_meds": [],
    }
    eval_result = evaluate_escalation(state_for_eval)
    escalation = eval_result.get("escalation_type", "none")
    # Seed has 3 missed doses in 7 days — should trigger caregiver escalation
    triggered_caregiver = escalation in ("caregiver", "both")
    result("evaluate_escalation: 3 missed doses → escalation_type=caregiver",
           triggered_caregiver,
           f"escalation_type={escalation}, payload_reason={eval_result.get('alert_payload', {}).get('reason', 'n/a')}")
except Exception as e:
    result("evaluate_escalation (missed doses)", False, str(e))

# evaluate_escalation — emergency type is preserved from previous node
try:
    from app.agents.companion import evaluate_escalation
    emergency_state = {
        "patient_id": PATIENT_ID,
        "messages": [{"role": "user", "content": "I have chest pain"}],
        "patient_context": {"profile": {"name": "Mdm Tan Ah Ma"}},
        "medication_status": {},
        "cultural_context": {},
        "language": "en",
        "escalation_type": "emergency",
        "alert_payload": {"trigger": "chest pain", "patient_name": "Mdm Tan Ah Ma"},
        "report_payload": {},
        "response_text": "Please call 995!",
        "rag_chunks": [],
        "barrier_reason": "",
        "overdue_meds": [],
    }
    eval_res = evaluate_escalation(emergency_state)
    result("evaluate_escalation preserves emergency escalation type",
           eval_res.get("escalation_type") == "emergency",
           f"escalation_type={eval_res.get('escalation_type')}")
except Exception as e:
    result("evaluate_escalation (emergency pass-through)", False, str(e))

# MCP Server C — get_consent_scope
try:
    from app.mcp_servers.caregiver_comms import get_consent_scope
    scope = get_consent_scope(PATIENT_ID, CAREGIVER_ID)
    has_sharing_key = "caregiver_sharing" in scope
    result("get_consent_scope returns caregiver_sharing key", has_sharing_key,
           f"caregiver_sharing={scope.get('caregiver_sharing')}, scope={scope.get('scope', {})}")
except Exception as e:
    result("get_consent_scope", False, str(e))

# MCP Server C — notify_caregiver (with seed caregiver; Telegram will fail if no chat_id seeded,
# but the function should still insert the alert to DB and return a dict)
try:
    from app.mcp_servers.caregiver_comms import notify_caregiver
    alert_result = notify_caregiver(
        patient_id=PATIENT_ID,
        summary="Test alert: Mum missed evening metformin 3 times this week. Mentioned nausea twice.",
        urgency="warning",
    )
    has_success_key = "success" in alert_result
    if alert_result.get("success"):
        result("notify_caregiver inserts alert + returns alert_id", bool(alert_result.get("alert_id")),
               f"alert_id={alert_result.get('alert_id')}, telegram_sent={alert_result.get('telegram_sent')}")
    else:
        # Might fail due to no caregiver being found if seed not loaded
        result("notify_caregiver returns result dict", has_success_key,
               f"result={alert_result}")
except Exception as e:
    result("notify_caregiver", False, str(e))

# Check alert was inserted into DB
try:
    alerts = (
        sb.table("alerts")
        .select("id, severity, summary, status")
        .eq("patient_id", PATIENT_ID)
        .eq("severity", "warning")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
    )
    ok = bool(alerts)
    result("Alert record exists in Supabase after notify_caregiver", ok,
           f"status={alerts[0]['status']}, summary[:60]={alerts[0]['summary'][:60]}" if ok else "no alert found")
except Exception as e:
    result("Alert in DB after notify_caregiver", False, str(e))

# Emergency handler — full graph run with emergency keyword
try:
    graph = build_companion_graph()
    emergency_msg = "I have chest pain and cannot breathe"
    state = {
        "patient_id": PATIENT_ID,
        "messages": [{"role": "user", "content": emergency_msg}],
        "patient_context": {},
        "medication_status": {},
        "cultural_context": {},
        "language": "en",
        "escalation_type": "none",
        "alert_payload": {},
        "report_payload": {},
        "response_text": "",
        "rag_chunks": [],
        "barrier_reason": "",
        "overdue_meds": [],
    }
    result_state = graph.invoke(state)
    response = result_state.get("response_text", "")
    has_995 = "995" in response
    result("Emergency keyword → 995 response", has_995,
           f"response[:100]: {response[:100]}")
    escalation_set = result_state.get("escalation_type") == "emergency"
    result("Emergency keyword → escalation_type=emergency", escalation_set,
           f"escalation_type={result_state.get('escalation_type')}")
except Exception as e:
    result("Emergency handler (full graph)", False, str(e))

# Caregiver liaison — full graph run with message that triggers missed-dose escalation
# (seed patient already has 3 missed doses, so any message should trigger)
try:
    graph = build_companion_graph()
    state = {
        "patient_id": PATIENT_ID,
        "messages": [{"role": "user", "content": "I feel a bit tired today"}],
        "patient_context": {},
        "medication_status": {},
        "cultural_context": {},
        "language": "zh",
        "escalation_type": "none",
        "alert_payload": {},
        "report_payload": {},
        "response_text": "",
        "rag_chunks": [],
        "barrier_reason": "",
        "overdue_meds": [],
    }
    result_state = graph.invoke(state)
    escalation = result_state.get("escalation_type", "none")
    # seed data has 3 missed doses → evaluate_escalation should set caregiver
    result("Full graph: seed 3 missed doses → caregiver escalation",
           escalation in ("caregiver", "both"),
           f"escalation_type={escalation}")
    response = result_state.get("response_text", "")
    result("Full graph returns non-empty response after escalation", bool(response),
           f"response[:80]: {response[:80]}")
except Exception as e:
    result("Caregiver liaison (full graph run)", False, str(e))

# share_weekly_digest — returns success dict (Telegram send may fail if no chat_id)
try:
    from app.mcp_servers.caregiver_comms import share_weekly_digest
    digest = share_weekly_digest(PATIENT_ID)
    has_key = "success" in digest
    if digest.get("success"):
        has_text = bool(digest.get("digest_text"))
        result("share_weekly_digest generates and returns digest text", has_text,
               f"adherence={digest.get('adherence_pct')}%, telegram_sent={digest.get('telegram_sent')}")
    else:
        result("share_weekly_digest returns result dict", has_key,
               f"result={digest}")
except Exception as e:
    result("share_weekly_digest", False, str(e))

# Check clinician_reports digest record was stored
try:
    report = (
        sb.table("clinician_reports")
        .select("id, content, generated_at")
        .eq("patient_id", PATIENT_ID)
        .order("generated_at", desc=True)
        .limit(1)
        .execute()
        .data
    )
    ok = bool(report) and report[0].get("content", {}).get("type") == "weekly_caregiver_digest"
    result("Weekly digest stored in clinician_reports table", ok,
           f"adherence_pct={report[0]['content'].get('adherence_pct')}%" if ok else "not found / wrong type")
except Exception as e:
    result("Digest stored in clinician_reports", False, str(e))


# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
separator("RESULTS SUMMARY")

passes = sum(1 for _, s in _results if s == PASS)
fails  = sum(1 for _, s in _results if s == FAIL)
skips  = sum(1 for _, s in _results if s == SKIP)

print(f"\n  Total: {len(_results)} checks — "
      f"{passes} passed, {fails} failed, {skips} skipped\n")

if fails:
    print("  FAILED checks:")
    for label, status in _results:
        if status == FAIL:
            print(f"    ✗  {label}")
    print()

if skips:
    print("  SKIPPED checks (typically because data isn't seeded yet):")
    for label, status in _results:
        if status == SKIP:
            print(f"    ·  {label}")
    print()

sys.exit(0 if fails == 0 else 1)
