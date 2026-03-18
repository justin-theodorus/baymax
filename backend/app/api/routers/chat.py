from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps.auth import require_patient
from app.api.deps.request_context import (
    get_audit_repository,
    get_conversation_repository,
    get_medication_repository,
    get_patient_repository,
    get_policy_bundle,
    get_rag_repository,
)
from app.core.config import get_settings
from app.models.api import ChatRequest, ChatResponse
from app.models.auth import CurrentUser
from app.repositories.audit_repository import AuditRepository
from app.repositories.conversation_repository import ConversationRepository
from app.repositories.medication_repository import MedicationRepository
from app.repositories.patient_repository import PatientRepository
from app.repositories.rag_repository import RagRepository
from app.services.chat_service import ChatService
from app.services.safety_service import SafetyService

router = APIRouter(prefix="/chat", tags=["patient-chat"])


@router.post("/messages", response_model=ChatResponse)
async def create_chat_message(
    payload: ChatRequest,
    current_user: CurrentUser = Depends(require_patient),
    patient_repository: PatientRepository = Depends(get_patient_repository),
    medication_repository: MedicationRepository = Depends(get_medication_repository),
    conversation_repository: ConversationRepository = Depends(get_conversation_repository),
    rag_repository: RagRepository = Depends(get_rag_repository),
    audit_repository: AuditRepository = Depends(get_audit_repository),
    policy_bundle: dict = Depends(get_policy_bundle),
) -> ChatResponse:
    service = ChatService(
        settings=get_settings(),
        patient_repository=patient_repository,
        medication_repository=medication_repository,
        conversation_repository=conversation_repository,
        rag_repository=rag_repository,
        audit_repository=audit_repository,
        safety_service=SafetyService(
            safety_rules=policy_bundle["safety_rules"],
            emergency_keywords=policy_bundle["emergency_keywords"],
        ),
    )
    return await service.handle_patient_message(current_user=current_user, payload=payload)