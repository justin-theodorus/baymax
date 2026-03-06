import asyncio
import json
import uuid

import jwt as pyjwt
from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client

from app.config import settings
from app.models.auth import CurrentUser, UserRole
from app.models.chat import ChatRequest, ChatResponse, LogDoseRequest

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


# ── Caregiver / Clinician stubs ───────────────────────────────────────────────

@app.get("/api/caregiver/{patient_id}/dashboard", tags=["caregiver"])
async def caregiver_dashboard(
    patient_id: str,
    current_user: CurrentUser = Depends(require_role("caregiver")),
):
    return {"message": "Caregiver dashboard — coming in Phase 6", "patient_id": patient_id}


@app.get("/api/clinician/{patient_id}/report", tags=["clinician"])
async def clinician_report(
    patient_id: str,
    current_user: CurrentUser = Depends(require_role("clinician")),
):
    return {"message": "Clinician report — coming in Phase 7", "patient_id": patient_id}
