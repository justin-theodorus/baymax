from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import Field

from app.models.base import EntityModel, TimestampedModel
from app.models.enums import UserRole


class AuditLogEntry(EntityModel, TimestampedModel):
    actor_role: UserRole
    actor_app_user_id: UUID
    patient_id: UUID | None = None
    action: str
    resource_type: str
    resource_id: UUID | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)