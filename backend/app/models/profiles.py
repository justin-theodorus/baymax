from __future__ import annotations

from datetime import date
from uuid import UUID

from pydantic import Field

from app.models.base import AppBaseModel, EntityModel, TimestampedModel
from app.models.enums import LanguageCode


class ConsentSettings(AppBaseModel):
    share_caregiver_summaries: bool = True
    share_clinician_reports: bool = True
    allow_telegram_alerts: bool = True
    allow_emergency_override: bool = True


class EmergencyContact(AppBaseModel):
    name: str
    relationship: str
    phone_number: str


class PatientProfile(EntityModel, TimestampedModel):
    user_id: UUID
    full_name: str
    preferred_name: str | None = None
    date_of_birth: date | None = None
    language_pref: LanguageCode = LanguageCode.EN
    timezone: str = "Asia/Singapore"
    chronic_conditions: list[str] = Field(default_factory=list)
    consent: ConsentSettings = Field(default_factory=ConsentSettings)
    emergency_contact: EmergencyContact | None = None
    linked_caregiver_ids: list[UUID] = Field(default_factory=list)


class CaregiverProfile(EntityModel, TimestampedModel):
    user_id: UUID
    full_name: str
    relationship_to_patient: str | None = None
    linked_patient_ids: list[UUID] = Field(default_factory=list)
    telegram_chat_id: str | None = None


class ClinicianProfile(EntityModel, TimestampedModel):
    user_id: UUID
    full_name: str
    specialty: str | None = None
    patient_ids: list[UUID] = Field(default_factory=list)