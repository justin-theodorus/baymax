from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import Field

from app.models.base import EntityModel, TimestampedModel, utc_now
from app.models.enums import (
    ChannelType,
    LanguageCode,
    MessageRole,
    SessionStatus,
    SummaryAudience,
)
from app.models.rag import GroundingCitation


class ConversationSession(EntityModel, TimestampedModel):
    patient_id: UUID
    channel: ChannelType = ChannelType.TEXT
    language: LanguageCode = LanguageCode.EN
    status: SessionStatus = SessionStatus.ACTIVE
    started_at: datetime = Field(default_factory=utc_now)
    last_message_at: datetime = Field(default_factory=utc_now)


class ConversationMessage(EntityModel, TimestampedModel):
    session_id: UUID
    patient_id: UUID
    role: MessageRole
    channel: ChannelType
    content: str
    language: LanguageCode
    citations: list[GroundingCitation] = Field(default_factory=list)
    safe_for_summary: bool = False


class ConversationSummary(EntityModel, TimestampedModel):
    patient_id: UUID
    session_id: UUID | None = None
    audience: SummaryAudience
    summary_text: str
    generated_from_message_ids: list[UUID] = Field(default_factory=list)