from __future__ import annotations

from abc import ABC, abstractmethod
from uuid import UUID

from app.models.profiles import PatientProfile


class PatientRepository(ABC):
    @abstractmethod
    async def get_by_id(self, patient_id: UUID) -> PatientProfile | None:
        raise NotImplementedError

    @abstractmethod
    async def upsert(self, patient: PatientProfile) -> PatientProfile:
        raise NotImplementedError


class InMemoryPatientRepository(PatientRepository):
    def __init__(self, seed: list[PatientProfile] | None = None) -> None:
        self._items: dict[UUID, PatientProfile] = {
            item.id: item for item in (seed or [])
        }

    async def get_by_id(self, patient_id: UUID) -> PatientProfile | None:
        return self._items.get(patient_id)

    async def upsert(self, patient: PatientProfile) -> PatientProfile:
        self._items[patient.id] = patient
        return patient