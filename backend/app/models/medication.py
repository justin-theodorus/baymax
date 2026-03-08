from __future__ import annotations

from datetime import date, datetime, time
from uuid import UUID

from pydantic import Field

from app.models.base import AppBaseModel, EntityModel, TimestampedModel
from app.models.enums import AdherenceStatus


class MedicationSchedule(AppBaseModel):
    label: str = "default"
    times: list[time] = Field(default_factory=list)
    days_of_week: list[int] = Field(default_factory=lambda: [0, 1, 2, 3, 4, 5, 6])  # Mon=0
    instructions: str | None = None


class MedicationProfile(EntityModel, TimestampedModel):
    patient_id: UUID
    name: str
    dosage_text: str
    frequency_text: str
    schedule: MedicationSchedule
    start_date: date | None = None
    end_date: date | None = None
    prescribed_by: str | None = None
    active: bool = True


class MedicationAdherenceEvent(EntityModel, TimestampedModel):
    patient_id: UUID
    medication_id: UUID
    scheduled_for: datetime
    taken_at: datetime | None = None
    status: AdherenceStatus = AdherenceStatus.UNKNOWN
    note: str | None = None