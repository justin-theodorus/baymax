from __future__ import annotations

from abc import ABC, abstractmethod
from uuid import UUID

from app.models.medication import MedicationProfile


class MedicationRepository(ABC):
    @abstractmethod
    async def list_active_for_patient(self, patient_id: UUID) -> list[MedicationProfile]:
        raise NotImplementedError


class InMemoryMedicationRepository(MedicationRepository):
    def __init__(self, seed: list[MedicationProfile] | None = None) -> None:
        self._items = seed or []

    async def list_active_for_patient(self, patient_id: UUID) -> list[MedicationProfile]:
        return [
            item
            for item in self._items
            if item.patient_id == patient_id and item.active
        ]