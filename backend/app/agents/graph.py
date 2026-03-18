from __future__ import annotations

from dataclasses import dataclass

from app.models.conversation import ConversationMessage, ConversationSession
from app.models.enums import AgentRoute, LanguageCode
from app.models.escalation import EscalationDecision
from app.models.medication import MedicationProfile
from app.models.profiles import PatientProfile
from app.models.rag import GroundingCitation
from app.repositories.rag_repository import RagRepository
from app.services.safety_service import SafetyService


@dataclass
class GraphExecutionResult:
    response_text: str
    citations: list[GroundingCitation]
    escalation: EscalationDecision


class CompanionGraphRunner:
    def __init__(
        self,
        rag_repository: RagRepository,
        safety_service: SafetyService,
    ) -> None:
        self._rag_repository = rag_repository
        self._safety_service = safety_service

    async def run(
        self,
        patient: PatientProfile,
        session: ConversationSession,
        latest_user_message: str,
        recent_messages: list[ConversationMessage],
        medications: list[MedicationProfile],
        language: LanguageCode,
    ) -> GraphExecutionResult:
        retrieved_chunks = await self.retrieve_context(latest_user_message)
        citations = self._build_citations(retrieved_chunks)

        draft_response = self.companion_respond(
            patient=patient,
            latest_user_message=latest_user_message,
            medications=medications,
            language=language,
            has_citations=bool(citations),
        )

        safety_result = self.safety_check(draft_response, latest_user_message, language)
        final_response = safety_result.final_safe_text or draft_response

        escalation = self.evaluate_escalation(
            patient=patient,
            latest_user_message=latest_user_message,
            language=language,
        )

        return GraphExecutionResult(
            response_text=final_response,
            citations=citations,
            escalation=escalation,
        )

    async def retrieve_context(self, latest_user_message: str):
        return await self._rag_repository.retrieve_guidance(latest_user_message, limit=3)

    def companion_respond(
        self,
        patient: PatientProfile,
        latest_user_message: str,
        medications: list[MedicationProfile],
        language: LanguageCode,
        has_citations: bool,
    ) -> str:
        lowered = latest_user_message.lower()
        preferred_name = patient.preferred_name or patient.full_name

        medication_names = [item.name for item in medications[:3]]
        medication_summary = ", ".join(medication_names) if medication_names else ""

        if language == LanguageCode.ZH:
            response = f"{preferred_name}，我在这里陪你一起整理健康事项。"
            if "药" in latest_user_message and medication_summary:
                response += f" 我看到你目前的药物包括：{medication_summary}。"
            elif medication_summary:
                response += " 我也可以帮你整理服药和预约提醒。"
            if has_citations:
                response += " 我会根据已载入的健康资料提供一般性支持。"
            response += " 如果你感觉明显不舒服、症状加重，或不确定下一步，请联系护理团队。"
            return response

        response = f"{preferred_name}, I’m here to help you stay organised with your care."
        if any(word in lowered for word in ["medication", "medicine", "pill"]) and medication_summary:
            response += f" Your current medication list includes {medication_summary}."
        elif medication_summary:
            response += " I can also help you keep track of medication and appointments."
        if has_citations:
            response += " I’ll keep my guidance general and grounded in the loaded care materials."
        response += " If symptoms feel worse, unusual, or worrying, please contact your care team."
        return response

    def safety_check(
        self,
        draft_response: str,
        latest_user_message: str,
        language: LanguageCode,
    ):
        if self._safety_service.detect_emergency(latest_user_message):
            emergency_text = self._safety_service.get_emergency_script(language)
            return self._safety_service.apply_policy_gate(emergency_text)

        return self._safety_service.apply_policy_gate(draft_response)

    def evaluate_escalation(
        self,
        patient: PatientProfile,
        latest_user_message: str,
        language: LanguageCode,
    ) -> EscalationDecision:
        lowered = latest_user_message.lower()

        if self._safety_service.detect_emergency(latest_user_message):
            return EscalationDecision(
                route=AgentRoute.EMERGENCY_HANDLER,
                reason="Emergency keyword detected",
                caregiver_alert_required=True,
                clinician_summary_required=False,
                emergency_protocol_required=True,
            )

        if any(term in lowered for term in ["missed", "forgot", "skip", "late medication"]):
            caregiver_route_allowed = (
                patient.consent.share_caregiver_summaries
                and len(patient.linked_caregiver_ids) > 0
            )
            return EscalationDecision(
                route=AgentRoute.CAREGIVER_LIAISON if caregiver_route_allowed else AgentRoute.END,
                reason="Possible medication adherence issue mentioned",
                caregiver_alert_required=caregiver_route_allowed,
                clinician_summary_required=False,
                emergency_protocol_required=False,
            )

        return EscalationDecision(
            route=AgentRoute.END,
            reason="No escalation needed",
            caregiver_alert_required=False,
            clinician_summary_required=False,
            emergency_protocol_required=False,
        )

    def _build_citations(self, chunks) -> list[GroundingCitation]:
        citations: list[GroundingCitation] = []

        for index, chunk in enumerate(chunks):
            citations.append(
                GroundingCitation(
                    chunk_id=chunk.id,
                    source_title=chunk.source_title,
                    source_organization=chunk.source_organization,
                    excerpt=chunk.chunk_text[:180],
                    relevance_score=max(0.1, 1.0 - (index * 0.1)),
                )
            )

        return citations