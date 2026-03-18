from __future__ import annotations

from abc import ABC, abstractmethod

from app.models.audit import AuditLogEntry


class AuditRepository(ABC):
    @abstractmethod
    async def append(self, entry: AuditLogEntry) -> AuditLogEntry:
        raise NotImplementedError

    @abstractmethod
    async def list_entries(self) -> list[AuditLogEntry]:
        raise NotImplementedError


class InMemoryAuditRepository(AuditRepository):
    def __init__(self) -> None:
        self._entries: list[AuditLogEntry] = []

    async def append(self, entry: AuditLogEntry) -> AuditLogEntry:
        self._entries.append(entry)
        return entry

    async def list_entries(self) -> list[AuditLogEntry]:
        return list(self._entries)