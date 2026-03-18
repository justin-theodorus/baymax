from __future__ import annotations

from abc import ABC, abstractmethod

from app.models.rag import GuidelineChunk


class RagRepository(ABC):
    @abstractmethod
    async def retrieve_guidance(
        self,
        query: str,
        limit: int = 3,
    ) -> list[GuidelineChunk]:
        raise NotImplementedError


class InMemoryRagRepository(RagRepository):
    def __init__(self, seed: list[GuidelineChunk] | None = None) -> None:
        self._items = seed or []

    async def retrieve_guidance(
        self,
        query: str,
        limit: int = 3,
    ) -> list[GuidelineChunk]:
        query_tokens = set(query.lower().split())
        ranked: list[tuple[int, GuidelineChunk]] = []

        for chunk in self._items:
            chunk_tokens = set(chunk.chunk_text.lower().split())
            score = len(query_tokens.intersection(chunk_tokens))
            ranked.append((score, chunk))

        ranked.sort(key=lambda item: item[0], reverse=True)
        return [chunk for score, chunk in ranked if score > 0][:limit]