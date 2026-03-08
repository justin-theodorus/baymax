from __future__ import annotations

from uuid import UUID

from pydantic import Field

from app.models.base import AppBaseModel, EntityModel, TimestampedModel
from app.models.enums import AgentRoute, AlertSeverity


class SafetyScreenResult(AppBaseModel):
    is_blocked: bool = False
    contains_emergency_keywords: bool = False
    blocked_rules: list[str] = Field(default_factory=list)
    softened_rules: list[str] = Field(default_factory=list)
    final_safe_text: str | None = None


class EscalationDecision(AppBaseModel):
    route: AgentRoute = AgentRoute.END
    reason: str
    caregiver_alert_required: bool = False
    clinician_summary_required: bool = False
    emergency_protocol_required: bool = False


class CaregiverAlert(EntityModel, TimestampedModel):
    patient_id: UUID
    caregiver_id: UUID
    severity: AlertSeverity
    title: str
    message: str
    telegram_sent: bool = False


class ClinicianHandoff(EntityModel, TimestampedModel):
    patient_id: UUID
    clinician_id: UUID | None = None
    title: str
    summary: str
    action_items: list[str] = Field(default_factory=list)