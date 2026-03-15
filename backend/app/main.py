import asyncio
import io
import json
import uuid
from datetime import datetime, timezone, timedelta

import jwt as pyjwt
from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client

from app.config import settings
from app.models.auth import CurrentUser, UserRole
from app.models.chat import ChatRequest, ChatResponse, LogDoseRequest, BarrierReasonRequest

app = FastAPI(
    title="Baymax 2.0 API",
    description="Multi-agent AI care companion for elderly Singaporeans",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

bearer_scheme = HTTPBearer(auto_error=False)


def _sb():
    return create_client(settings.supabase_url, settings.supabase_secret_key)


def _decode_token(token: str) -> dict:
    jwt_options = (
        {"verify_exp": True} if settings.supabase_jwt_secret else {"verify_signature": False}
    )
    return pyjwt.decode(
        token,
        settings.supabase_jwt_secret or "dummy",
        algorithms=["HS256"],
        options=jwt_options,
    )


def verify_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> CurrentUser:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization token",
        )
    try:
        payload = _decode_token(credentials.credentials)
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except pyjwt.InvalidTokenError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {e}")

    role: UserRole = payload.get("role", "")
    app_user_id: str = payload.get("app_user_id", "")
    user_id: str = payload.get("sub", "")

    if not role:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Token missing role claim")

    return CurrentUser(user_id=user_id, role=role, app_user_id=app_user_id)


def require_role(*roles: UserRole):
    def _check(current_user: CurrentUser = Depends(verify_token)) -> CurrentUser:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role(s): {', '.join(roles)}",
            )
        return current_user

    return _check


# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/health", tags=["system"])
async def health_check():
    return {"status": "ok", "service": "baymax-api", "version": "0.2.0"}


# ── Patient chat ──────────────────────────────────────────────────────────────

@app.post("/api/chat", tags=["patient"], response_model=ChatResponse)
async def chat(
    req: ChatRequest,
    current_user: CurrentUser = Depends(require_role("patient")),
):
    # Security: patient_id in body must match JWT claim
    if req.patient_id != current_user.app_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="patient_id mismatch")

    sb = _sb()

    # Load recent conversation history (last 10 messages, oldest first)
    history_rows = (
        sb.table("conversations")
        .select("role,content")
        .eq("patient_id", req.patient_id)
        .order("created_at", desc=True)
        .limit(10)
        .execute()
        .data
    )
    history_rows.reverse()
    messages = history_rows + [{"role": "user", "content": req.message}]

    # Build and run LangGraph companion graph
    from app.agents.companion import build_companion_graph

    graph = build_companion_graph()
    initial_state = {
        "patient_id": req.patient_id,
        "messages": messages,
        "patient_context": {},
        "medication_status": {},
        "cultural_context": {},
        "language": req.language,
        "escalation_type": "none",
        "alert_payload": {},
        "report_payload": {},
        "response_text": "",
        "rag_chunks": [],
        "barrier_reason": "",
        "overdue_meds": [],
    }

    result = await asyncio.to_thread(graph.invoke, initial_state)
    response_text: str = result.get("response_text", "")
    final_language: str = result.get("language", req.language)

    # Persist both turns to conversations table
    sb.table("conversations").insert(
        {
            "patient_id": req.patient_id,
            "role": "user",
            "content": req.message,
            "language": req.language,
        }
    ).execute()

    assistant_row = (
        sb.table("conversations")
        .insert(
            {
                "patient_id": req.patient_id,
                "role": "assistant",
                "content": response_text,
                "language": final_language,
            }
        )
        .execute()
    )

    conversation_id = (
        assistant_row.data[0]["id"] if assistant_row.data else str(uuid.uuid4())
    )

    return ChatResponse(
        response=response_text,
        language=final_language,
        conversation_id=conversation_id,
    )


# ── Medication dose logging ───────────────────────────────────────────────────

@app.post("/api/medications/log-dose", tags=["patient"])
async def log_medication_dose(
    req: LogDoseRequest,
    current_user: CurrentUser = Depends(require_role("patient")),
):
    if req.patient_id != current_user.app_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="patient_id mismatch")

    from app.mcp_servers.medication import log_dose

    result = await asyncio.to_thread(log_dose, req.patient_id, req.medication_id, req.taken, req.timestamp)
    return result


# ── Voice WebSocket ───────────────────────────────────────────────────────────

@app.websocket("/api/voice")
async def voice_ws(websocket: WebSocket):
    # Auth: extract token from query param
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001)
        return

    try:
        payload = _decode_token(token)
        role = payload.get("role", "")
        patient_id = payload.get("app_user_id", "")
        if role != "patient":
            await websocket.close(code=4003)
            return
    except pyjwt.InvalidTokenError:
        await websocket.close(code=4001)
        return

    await websocket.accept()

    language = "en"
    speed = "normal"
    audio_chunks: list[bytes] = []

    try:
        while True:
            message = await websocket.receive()

            if message.get("type") == "websocket.disconnect":
                break

            # Text message: either JSON config or "END" sentinel
            if message.get("text") is not None:
                text_data: str = message["text"]

                if text_data == "END":
                    if not audio_chunks:
                        continue

                    audio_bytes = b"".join(audio_chunks)
                    audio_chunks = []

                    # STT — raw audio discarded immediately after transcription
                    from app.voice.stt import transcribe_audio

                    stt_result = await asyncio.to_thread(transcribe_audio, audio_bytes)
                    transcript: str = stt_result["transcript"]
                    detected_lang: str = stt_result["language"]
                    if detected_lang in ("en", "zh", "ms", "ta"):
                        language = detected_lang

                    if not transcript:
                        await websocket.send_json({"type": "error", "text": "Could not transcribe audio"})
                        continue

                    await websocket.send_json(
                        {"type": "transcript", "text": transcript, "language": language}
                    )

                    # Run companion graph
                    from app.agents.companion import build_companion_graph

                    sb = _sb()
                    history_rows = (
                        sb.table("conversations")
                        .select("role,content")
                        .eq("patient_id", patient_id)
                        .order("created_at", desc=True)
                        .limit(10)
                        .execute()
                        .data
                    )
                    history_rows.reverse()
                    messages = history_rows + [{"role": "user", "content": transcript}]

                    initial_state = {
                        "patient_id": patient_id,
                        "messages": messages,
                        "patient_context": {},
                        "medication_status": {},
                        "cultural_context": {},
                        "language": language,
                        "escalation_type": "none",
                        "alert_payload": {},
                        "report_payload": {},
                        "response_text": "",
                        "rag_chunks": [],
                        "barrier_reason": "",
                        "overdue_meds": [],
                    }

                    graph = build_companion_graph()
                    result = await asyncio.to_thread(graph.invoke, initial_state)
                    response_text: str = result.get("response_text", "")
                    final_language: str = result.get("language", language)

                    # Persist to conversations (text only — no audio stored)
                    sb.table("conversations").insert(
                        {"patient_id": patient_id, "role": "user", "content": transcript, "language": language}
                    ).execute()
                    sb.table("conversations").insert(
                        {"patient_id": patient_id, "role": "assistant", "content": response_text, "language": final_language}
                    ).execute()

                    await websocket.send_json({"type": "response_text", "text": response_text})

                    # TTS — synthesize and stream audio back
                    from app.voice.tts import synthesize_speech

                    audio_data = await asyncio.to_thread(
                        synthesize_speech, response_text, final_language, speed
                    )

                    chunk_size = 4096
                    for i in range(0, len(audio_data), chunk_size):
                        await websocket.send_bytes(audio_data[i : i + chunk_size])

                else:
                    # Try to parse as JSON config
                    try:
                        config = json.loads(text_data)
                        if config.get("type") == "config":
                            speed = config.get("speed", speed)
                            language = config.get("language", language)
                    except (json.JSONDecodeError, Exception):
                        pass

            # Binary message: audio chunk
            elif message.get("bytes") is not None:
                audio_chunks.append(message["bytes"])

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "text": str(e)})
        except Exception:
            pass


# ── Medications today ─────────────────────────────────────────────────────────

@app.get("/api/medications/today", tags=["patient"])
async def medications_today(
    patient_id: str,
    current_user: CurrentUser = Depends(require_role("patient")),
):
    if patient_id != current_user.app_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="patient_id mismatch")

    from app.mcp_servers.medication import get_todays_meds

    result = await asyncio.to_thread(get_todays_meds, patient_id)

    # Compute overdue flag for each pending medication
    now = datetime.now(timezone.utc)
    pending_with_status = []
    for med in result.get("pending_today", []):
        schedule = med.get("schedule", {})
        times = schedule.get("times", [])
        overdue = False
        for t in times:
            try:
                hour, minute = map(int, t.split(":"))
                scheduled_dt = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
                if scheduled_dt < now:
                    overdue = True
                    break
            except Exception:
                pass
        pending_with_status.append({**med, "overdue": overdue})

    return {
        "medications": result.get("medications", []),
        "logs": result.get("logs", []),
        "taken_today": result.get("taken_today", []),
        "pending_today": pending_with_status,
    }


# ── Barrier reason logging ────────────────────────────────────────────────────

@app.post("/api/medications/barrier", tags=["patient"])
async def log_barrier_reason(
    req: BarrierReasonRequest,
    current_user: CurrentUser = Depends(require_role("patient")),
):
    if req.patient_id != current_user.app_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="patient_id mismatch")

    sb = _sb()
    # Update the most recent medication_log for this medication (today, not taken)
    result = (
        sb.table("medication_logs")
        .update({"barrier_reason": req.barrier_reason})
        .eq("patient_id", req.patient_id)
        .eq("medication_id", req.medication_id)
        .is_("taken", "false")
        .order("scheduled_time", desc=True)
        .limit(1)
        .execute()
    )
    return {"success": True, "updated": len(result.data) > 0}


# ── Caregiver endpoints ───────────────────────────────────────────────────────

def _verify_caregiver_patient_access(caregiver: CurrentUser, patient_id: str) -> None:
    """Verify that this caregiver is linked to the requested patient (via patient_ids array)."""
    sb = _sb()
    row = (
        sb.table("caregivers")
        .select("id, patient_ids")
        .eq("id", caregiver.app_user_id)
        .execute()
        .data
    )
    if not row or patient_id not in (row[0].get("patient_ids") or []):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized for this patient")


@app.get("/api/caregiver/{patient_id}/dashboard", tags=["caregiver"])
async def caregiver_dashboard(
    patient_id: str,
    current_user: CurrentUser = Depends(require_role("caregiver")),
):
    _verify_caregiver_patient_access(current_user, patient_id)
    sb = _sb()

    now = datetime.now(timezone.utc)
    week_ago = (now - timedelta(days=7)).isoformat()

    # Medication adherence % over last 7 days (use scheduled_time for filtering)
    logs = (
        sb.table("medication_logs")
        .select("taken")
        .eq("patient_id", patient_id)
        .gte("scheduled_time", week_ago)
        .execute()
        .data
    )
    total = len(logs)
    taken_count = sum(1 for l in logs if l.get("taken"))
    adherence_pct = round((taken_count / total * 100) if total > 0 else 0)

    # Last check-in (most recent conversation)
    last_conv = (
        sb.table("conversations")
        .select("created_at")
        .eq("patient_id", patient_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
    )
    last_checkin = last_conv[0]["created_at"] if last_conv else None

    # Active alerts (schema: summary, not message)
    alerts = (
        sb.table("alerts")
        .select("id, severity, status, summary")
        .eq("patient_id", patient_id)
        .eq("status", "pending")
        .execute()
        .data
    )
    active_alert_count = len(alerts)

    # Traffic-light level: critical > warning > info > green
    traffic_light = "green"
    for alert in alerts:
        sev = alert.get("severity", "")
        if sev == "critical":
            traffic_light = "critical"
            break
        elif sev == "warning":
            traffic_light = "warning"
        elif sev == "info" and traffic_light == "green":
            traffic_light = "info"

    return {
        "patient_id": patient_id,
        "adherence_pct": adherence_pct,
        "last_checkin": last_checkin,
        "active_alert_count": active_alert_count,
        "traffic_light": traffic_light,
    }


@app.get("/api/caregiver/{patient_id}/alerts", tags=["caregiver"])
async def caregiver_alerts(
    patient_id: str,
    current_user: CurrentUser = Depends(require_role("caregiver")),
    limit: int = 20,
    offset: int = 0,
):
    _verify_caregiver_patient_access(current_user, patient_id)
    sb = _sb()

    alerts = (
        sb.table("alerts")
        .select("*")
        .eq("patient_id", patient_id)
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
        .data
    )
    return {"alerts": alerts, "total": len(alerts)}


@app.post("/api/caregiver/{patient_id}/alerts/{alert_id}/acknowledge", tags=["caregiver"])
async def acknowledge_alert(
    patient_id: str,
    alert_id: str,
    current_user: CurrentUser = Depends(require_role("caregiver")),
):
    _verify_caregiver_patient_access(current_user, patient_id)
    sb = _sb()

    result = (
        sb.table("alerts")
        .update({"status": "acknowledged"})
        .eq("id", alert_id)
        .eq("patient_id", patient_id)
        .execute()
    )
    return {"success": True, "alert_id": alert_id}


@app.get("/api/caregiver/{patient_id}/digest", tags=["caregiver"])
async def get_digest(
    patient_id: str,
    current_user: CurrentUser = Depends(require_role("caregiver")),
):
    _verify_caregiver_patient_access(current_user, patient_id)
    sb = _sb()

    # Fetch latest digest from clinician_reports used as digest storage
    digest = (
        sb.table("clinician_reports")
        .select("*")
        .eq("patient_id", patient_id)
        .order("generated_at", desc=True)
        .limit(1)
        .execute()
        .data
    )
    if not digest:
        return {"digest": None, "message": "No digest generated yet"}

    row = digest[0]
    # Map DB `content` JSONB to expected frontend structure
    summary_data = row.get("content") or {}
    return {
        "digest": {
            "id": row["id"],
            "patient_id": row["patient_id"],
            "period_start": row["period_start"],
            "period_end": row["period_end"],
            "summary": summary_data,
            "generated_at": row["generated_at"],
        }
    }


@app.post("/api/caregiver/{patient_id}/digest/generate", tags=["caregiver"])
async def generate_digest(
    patient_id: str,
    current_user: CurrentUser = Depends(require_role("caregiver")),
):
    _verify_caregiver_patient_access(current_user, patient_id)

    from app.mcp_servers.caregiver_comms import share_weekly_digest

    result = await asyncio.to_thread(share_weekly_digest, patient_id)
    return result


@app.get("/api/telegram/register", tags=["caregiver"])
async def telegram_register(
    caregiver_id: str,
    current_user: CurrentUser = Depends(require_role("caregiver")),
):
    if caregiver_id != current_user.app_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="caregiver_id mismatch")

    import secrets
    from app.mcp_servers.governance import audit_log as gov_audit

    token = secrets.token_urlsafe(16)

    # Log pending registration via MCP Server E
    gov_audit(
        agent="telegram_registration",
        action="pending_registration",
        patient_id=None,
        reasoning=f"caregiver_id:{caregiver_id}:token:{token}",
    )

    bot_username = "BaymaxCareBot"
    return {
        "registration_link": f"https://t.me/{bot_username}?start={token}",
        "message": "Send this link to your caregiver to register for Telegram notifications.",
    }


# ── Clinician endpoints ───────────────────────────────────────────────────────

def _verify_clinician_patient_access(clinician: CurrentUser, patient_id: str) -> None:
    """Verify that this clinician has this patient on their panel."""
    sb = _sb()
    row = (
        sb.table("clinicians")
        .select("id, patient_ids")
        .eq("id", clinician.app_user_id)
        .execute()
        .data
    )
    if not row or patient_id not in (row[0].get("patient_ids") or []):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized for this patient")


@app.get("/api/clinician/{patient_id}/report", tags=["clinician"])
async def clinician_report(
    patient_id: str,
    start_date: str | None = None,
    end_date: str | None = None,
    current_user: CurrentUser = Depends(require_role("clinician")),
):
    _verify_clinician_patient_access(current_user, patient_id)

    from app.mcp_servers.clinician_summary import generate_weekly_brief

    result = await asyncio.to_thread(generate_weekly_brief, patient_id, start_date, end_date)
    return {"patient_id": patient_id, **result}


@app.get("/api/clinician/{patient_id}/report/pdf", tags=["clinician"])
async def clinician_report_pdf(
    patient_id: str,
    start_date: str | None = None,
    end_date: str | None = None,
    current_user: CurrentUser = Depends(require_role("clinician")),
):
    _verify_clinician_patient_access(current_user, patient_id)

    from app.mcp_servers.clinician_summary import generate_weekly_brief

    result = await asyncio.to_thread(generate_weekly_brief, patient_id, start_date, end_date)
    report = result.get("report", {})

    html_content = _build_report_html(report)

    try:
        import weasyprint
        pdf_bytes = weasyprint.HTML(string=html_content).write_pdf()
    except ImportError:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="PDF export requires weasyprint. Install it with: pip install weasyprint",
        )

    header = report.get("header", {})
    patient_name = header.get("patient_name", "patient").replace(" ", "_")
    filename = f"baymax_report_{patient_name}_{datetime.now(timezone.utc).strftime('%Y%m%d')}.pdf"

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/clinician/{patient_id}/flags", tags=["clinician"])
async def clinician_flags(
    patient_id: str,
    days: int = 7,
    current_user: CurrentUser = Depends(require_role("clinician")),
):
    _verify_clinician_patient_access(current_user, patient_id)

    from app.mcp_servers.clinician_summary import get_trend_flags

    flags = await asyncio.to_thread(get_trend_flags, patient_id, days)
    return {"patient_id": patient_id, "days": days, "flags": flags}


def _build_report_html(report: dict) -> str:
    """Build an HTML string for PDF export from the structured report dict."""
    header = report.get("header", {})
    adherence = report.get("medication_adherence", {})
    vitals = report.get("vitals_summary", {})
    lifestyle = report.get("lifestyle_insights", {})
    symptoms = report.get("patient_symptoms", [])
    flags = report.get("recommendation_flags", [])
    transparency = report.get("data_transparency", {})

    # Format dates
    period_start = header.get("period_start", "")[:10]
    period_end = header.get("period_end", "")[:10]
    generated_at = header.get("generated_at", "")[:19].replace("T", " ")

    # Per-medication rows
    per_med_rows = ""
    for med_name, data in adherence.get("per_medication", {}).items():
        barriers = ", ".join(data.get("barriers", [])) or "—"
        per_med_rows += f"""
        <tr>
          <td>{med_name}</td>
          <td>{data.get('taken', 0)}/{data.get('total', 0)}</td>
          <td>{data.get('adherence_pct', 0)}%</td>
          <td>{barriers}</td>
        </tr>"""

    # Vitals rows
    vitals_rows = ""
    for vtype, data in vitals.get("readings", {}).items():
        label = vtype.replace("_", " ").title()
        vitals_rows += f"""
        <tr>
          <td>{label}</td>
          <td>{data.get('count', 0)}</td>
          <td>{data.get('avg', '—')} {data.get('unit', '')}</td>
          <td>{data.get('min', '—')} – {data.get('max', '—')}</td>
        </tr>"""

    # Anomaly rows
    anomaly_rows = ""
    for anomaly in vitals.get("anomalies", []):
        anomaly_rows += f"<li style='color:#b91c1c;'>{anomaly.get('description', '')}</li>"

    # Symptoms rows
    symptom_rows = ""
    for s in symptoms:
        symptom_rows += f"""
        <tr>
          <td>{s.get('symptom', '').title()}</td>
          <td>{s.get('frequency', 0)}</td>
          <td>{(s.get('last_mentioned') or '')[:10]}</td>
        </tr>"""

    # Recommendation flags
    flag_items = ""
    flag_icons = {"review": "⚠", "positive": "✓", "discuss": "📋"}
    flag_colors = {"review": "#b45309", "positive": "#15803d", "discuss": "#1d4ed8"}
    for f in flags:
        ftype = f.get("type", "discuss")
        icon = flag_icons.get(ftype, "📋")
        color = flag_colors.get(ftype, "#1d4ed8")
        confidence_pct = int(f.get("confidence", 0) * 100)
        flag_items += f"""
        <div class="flag" style="border-left:4px solid {color}; padding:8px 12px; margin:6px 0; background:#f9fafb;">
          <span style="color:{color}; font-weight:bold;">{icon} {ftype.upper()}</span>
          <span style="margin-left:8px;">{f.get('description', '')}</span>
          <span style="color:#6b7280; font-size:11px; margin-left:8px;">Source: {f.get('source', '')} | Confidence: {confidence_pct}%</span>
        </div>"""

    conditions = ", ".join(header.get("conditions") or []) or "—"

    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body {{ font-family: Arial, sans-serif; font-size: 13px; color: #1f2937; margin: 0; padding: 24px; }}
  h1 {{ font-size: 20px; color: #1e1b4b; margin-bottom: 4px; }}
  h2 {{ font-size: 15px; color: #1e1b4b; border-bottom: 2px solid #e5e7eb; padding-bottom: 4px; margin-top: 24px; }}
  .disclaimer {{ background: #fef3c7; border: 2px solid #f59e0b; padding: 10px 16px; border-radius: 6px;
                 font-weight: bold; color: #92400e; margin-bottom: 20px; font-size: 13px; }}
  .meta {{ color: #6b7280; font-size: 12px; margin-bottom: 16px; }}
  table {{ width: 100%; border-collapse: collapse; margin-top: 8px; }}
  th {{ background: #f3f4f6; text-align: left; padding: 7px 10px; font-size: 12px; color: #374151; }}
  td {{ padding: 6px 10px; border-bottom: 1px solid #f3f4f6; }}
  .adherence-pct {{ font-size: 28px; font-weight: bold; color: #1e1b4b; }}
  ul {{ margin: 4px 0; padding-left: 18px; }}
  li {{ margin: 3px 0; }}
</style>
</head>
<body>
<h1>BAYMAX PATIENT SUMMARY REPORT</h1>
<div class="meta">
  <strong>Patient:</strong> {header.get('patient_name', '—')} &nbsp;|&nbsp;
  <strong>Age:</strong> {header.get('age', '—')} &nbsp;|&nbsp;
  <strong>Conditions:</strong> {conditions}<br>
  <strong>Period:</strong> {period_start} – {period_end} &nbsp;|&nbsp;
  <strong>Generated:</strong> {generated_at} UTC
</div>
<div class="disclaimer">
  ⚠ AI-Generated Summary — for clinical review only, not a clinical record.
  All findings require professional clinical judgement.
</div>

<h2>Medication Adherence</h2>
<div class="adherence-pct">{adherence.get('overall_pct', 0)}%</div>
<p>Overall adherence: {adherence.get('taken_doses', 0)} of {adherence.get('total_doses', 0)} doses taken.</p>
<table>
  <thead><tr><th>Medication</th><th>Doses Taken</th><th>Adherence</th><th>Barriers</th></tr></thead>
  <tbody>{per_med_rows or '<tr><td colspan="4">No medication data</td></tr>'}</tbody>
</table>

<h2>Vitals Summary</h2>
<table>
  <thead><tr><th>Vital</th><th>Readings</th><th>Average</th><th>Range</th></tr></thead>
  <tbody>{vitals_rows or '<tr><td colspan="4">No vitals recorded</td></tr>'}</tbody>
</table>
{f'<p><strong>Anomalies:</strong><ul>{anomaly_rows}</ul></p>' if anomaly_rows else ''}

<h2>Lifestyle &amp; Behavioural Insights</h2>
<p>{lifestyle.get('summary', 'No lifestyle data available.')}</p>

<h2>Patient-Reported Symptoms</h2>
{f'''<table>
  <thead><tr><th>Symptom</th><th>Frequency</th><th>Last Mentioned</th></tr></thead>
  <tbody>{symptom_rows}</tbody>
</table>''' if symptoms else '<p>No symptoms reported this period.</p>'}

<h2>Recommendation Flags</h2>
{flag_items if flag_items else '<p>No recommendation flags generated.</p>'}

<h2>Data Transparency</h2>
<p><strong>Sources used:</strong> {', '.join(transparency.get('sources_used', []))}</p>
<p>{transparency.get('confidence_notes', '')}</p>
</body>
</html>"""
