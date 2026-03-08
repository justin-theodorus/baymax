from __future__ import annotations

from uuid import UUID

from pydantic import Field

from app.models.base import AppBaseModel, EntityModel, TimestampedModel


class GuidelineChunk(EntityModel, TimestampedModel):
    source_title: str
    source_url: str | None = None
    source_organization: str
    chunk_text: str
    embedding_model: str | None = None
    tags: list[str] = Field(default_factory=list)


class GroundingCitation(AppBaseModel):
    chunk_id: UUID
    source_title: str
    source_organization: str
    excerpt: str
    relevance_score: float