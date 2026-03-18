from __future__ import annotations

from fastapi import HTTPException, status

from app.agents.graph import CompanionGraphRunner
from app.core.config import Settings
from app.models.api import ChatRequest, ChatResponse
from app.models.audit import AuditLogEntry
from app.models.auth import CurrentUser
from app.models.conversation import ConversationMessage
from app.models.enums import LanguageCode, MessageRole
from app.models.profiles import ConsentSettings, PatientProfile
from app.repositories.audit_repository import AuditRepository
from app.repositories.conversation_repository import ConversationRepository
from app.repositories.medication_repository import MedicationRepository
from app.repositories.patient_repository import PatientRepository
from app.repositories.rag_repository import RagRepository
from app.services.safety_service import SafetyService


class ChatService:
    def __init__(
        self,
        settings: Settings,
        patient_repository: PatientRepository,
        medication_repository: MedicationRepository,
        conversation_repository: ConversationRepository,
        rag_repository: RagRepository,
        audit_repository: AuditRepository,
        safety_service: SafetyService,
    ) -> None:
        self._settings = settings
        self._patient_repository = patient_repository
        self._medication_repository = medication_repository
        self._conversation_repository = conversation_repository
        self._rag_repository = rag_repository
        self._audit_repository = audit_repository
        self._graph_runner = CompanionGraphRunner(
            rag_repository=self._rag_repository,
            safety_service=safety_service,
        )

    async def handle_patient_message(
        self,
        current_user: CurrentUser,
        payload: ChatRequest,
    ) -> ChatResponse:
        patient = await self._get_or_create_patient(current_user)

        language = payload.language or patient.language_pref or LanguageCode.EN

        if payload.session_id is None:
            session = await self._conversation_repository.create_session(
                patient_id=patient.id,
                channel=payload.channel,
                language=language,
            )
        else:
            session = await self._conversation_repository.get_session(payload.session_id)
            if session is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Session not found",
                )
            if session.patient_id != patient.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You do not have access to this session",
                )

        user_message = ConversationMessage(
            session_id=session.id,
            patient_id=patient.id,
            role=MessageRole.USER,
            channel=payload.channel,
            content=payload.message,
            language=language,
            safe_for_summary=False,
        )
        await self._conversation_repository.add_message(user_message)

        recent_messages = await self._conversation_repository.list_recent_messages(
            session.id,
            limit=12,
        )
        medications = await self._medication_repository.list_active_for_patient(patient.id)

        result = await self._graph_runner.run(
            patient=patient,
            session=session,
            latest_user_message=payload.message,
            recent_messages=recent_messages,
            medications=medications,
            language=language,
        )

        assistant_message = ConversationMessage(
            session_id=session.id,
            patient_id=patient.id,
            role=MessageRole.ASSISTANT,
            channel=payload.channel,
            content=result.response_text,
            language=language,
            citations=result.citations,
            safe_for_summary=True,
        )
        await self._conversation_repository.add_message(assistant_message)

        await self._audit_repository.append(
            AuditLogEntry(
                actor_role=current_user.role,
                actor_app_user_id=current_user.app_user_id,
                patient_id=patient.id,
                action="chat.message.create",
                resource_type="conversation_message",
                resource_id=user_message.id,
                metadata={"session_id": str(session.id)},
            )
        )

        return ChatResponse(
            session_id=session.id,
            response_text=result.response_text,
            language=language,
            citations=result.citations,
            escalation=result.escalation,
            metadata={
                "agent": "companion",
                "session_status": session.status,
            },
        )

    async def _get_or_create_patient(self, current_user: CurrentUser) -> PatientProfile:
        patient = await self._patient_repository.get_by_id(current_user.app_user_id)
        if patient is not None:
            return patient

        if not self._settings.use_mock_repositories:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Patient profile not found",
            )

        mock_patient = PatientProfile(
            id=current_user.app_user_id,
            user_id=current_user.auth_user_id,
            full_name="Demo Patient",
            preferred_name="Ah Ma" if current_user.email is None else "Demo Patient",
            language_pref=LanguageCode.EN,
            chronic_conditions=["diabetes", "hypertension"],
            consent=ConsentSettings(),
            linked_caregiver_ids=[],
        )
        return await self._patient_repository.upsert(mock_patient)