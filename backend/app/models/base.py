from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

class AppBaseModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        validate_assignment=True,
        populate_by_name=True,
        str_strip_whitespace=True,
    )

class EntityModel(AppBaseModel):
    id: UUID = Field(default_factory=uuid4)

class TimestampedModel(AppBaseModel):
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)