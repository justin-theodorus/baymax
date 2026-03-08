from __future__ import annotations

from typing import Any
from typing_extensions import TypedDict

from app.models.auth import CurrentUser
from app.models.conversation import ConversationMessage, ConversationSession
from app.models.escalation import CaregiverAlert, ClinicianHandoff, EscalationDecision, SafetyScreenResult
from app.models.medication import MedicationAdherenceEvent, MedicationProfile
from app.models.profiles import CaregiverProfile, ClinicianProfile, PatientProfile
from app.models.rag import GuidelineChunk


class AgentContextSnapshot(TypedDict, total=False):
    current_user: CurrentUser
    patient: PatientProfile
    caregiver: CaregiverProfile | None
    clinician: ClinicianProfile | None
    session: ConversationSession
    recent_messages: list[ConversationMessage]
    medications: list[MedicationProfile]
    adherence_events: list[MedicationAdherenceEvent]
    retrieved_guidelines: list[GuidelineChunk]
    language: str


class GraphState(TypedDict, total=False):
    context: AgentContextSnapshot
    latest_user_message: str
    draft_response: str
    safety_result: SafetyScreenResult
    escalation_decision: EscalationDecision
    caregiver_alert: CaregiverAlert | None
    clinician_handoff: ClinicianHandoff | None
    final_response: str
    metadata: dict[str, Any]