from __future__ import annotations

from typing import Any

from fastapi import Request

from app.repositories.audit_repository import AuditRepository
from app.repositories.conversation_repository import ConversationRepository
from app.repositories.medication_repository import MedicationRepository
from app.repositories.patient_repository import PatientRepository
from app.repositories.rag_repository import RagRepository

def get_patient_repository(request: Request) -> PatientRepository:
    return request.app.state.patient_repo

def get_medication_repository(request: Request) -> MedicationRepository:
    return request.app.state.medication_repo

def get_conversation_repository(request: Request) -> ConversationRepository:
    return request.app.state.conversation_repo

def get_rag_repository(request: Request) -> RagRepository:
    return request.app.state.rag_repo

def get_audit_repository(request: Request) -> AuditRepository:
    return request.app.state.audit_repo

def get_policy_bundle(request: Request) -> dict[str, Any]:
    return {
        "safety_rules": request.app.state.safety_rules,
        "emergency_keywords": request.app.state.emergency_keywords,
        "escalation_rules": request.app.state.escalation_rules,
    }