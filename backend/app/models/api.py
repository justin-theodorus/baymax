from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import Field

from app.models.base import AppBaseModel
from app.models.enums import ChannelType, LanguageCode
from app.models.escalation import EscalationDecision
from app.models.rag import GroundingCitation


class ChatRequest(AppBaseModel):
    session_id: UUID | None = None
    message: str = Field(min_length=1, max_length=5000)
    channel: ChannelType = ChannelType.TEXT
    language: LanguageCode | None = None


class ChatResponse(AppBaseModel):
    session_id: UUID
    response_text: str
    language: LanguageCode
    citations: list[GroundingCitation] = Field(default_factory=list)
    escalation: EscalationDecision | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class VoiceClientEvent(AppBaseModel):
    event: str
    session_id: UUID | None = None
    payload: dict[str, Any] = Field(default_factory=dict)