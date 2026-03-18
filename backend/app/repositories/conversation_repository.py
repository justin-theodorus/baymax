from __future__ import annotations

from abc import ABC, abstractmethod
from uuid import UUID

from app.models.base import utc_now
from app.models.conversation import ConversationMessage, ConversationSession
from app.models.enums import ChannelType, LanguageCode


class ConversationRepository(ABC):
    @abstractmethod
    async def create_session(
        self,
        patient_id: UUID,
        channel: ChannelType,
        language: LanguageCode,
    ) -> ConversationSession:
        raise NotImplementedError

    @abstractmethod
    async def get_session(self, session_id: UUID) -> ConversationSession | None:
        raise NotImplementedError

    @abstractmethod
    async def add_message(self, message: ConversationMessage) -> ConversationMessage:
        raise NotImplementedError

    @abstractmethod
    async def list_recent_messages(
        self,
        session_id: UUID,
        limit: int = 10,
    ) -> list[ConversationMessage]:
        raise NotImplementedError

    @abstractmethod
    async def touch_session(self, session_id: UUID) -> None:
        raise NotImplementedError


class InMemoryConversationRepository(ConversationRepository):
    def __init__(self) -> None:
        self._sessions: dict[UUID, ConversationSession] = {}
        self._messages: list[ConversationMessage] = []

    async def create_session(
        self,
        patient_id: UUID,
        channel: ChannelType,
        language: LanguageCode,
    ) -> ConversationSession:
        session = ConversationSession(
            patient_id=patient_id,
            channel=channel,
            language=language,
        )
        self._sessions[session.id] = session
        return session

    async def get_session(self, session_id: UUID) -> ConversationSession | None:
        return self._sessions.get(session_id)

    async def add_message(self, message: ConversationMessage) -> ConversationMessage:
        self._messages.append(message)
        await self.touch_session(message.session_id)
        return message

    async def list_recent_messages(
        self,
        session_id: UUID,
        limit: int = 10,
    ) -> list[ConversationMessage]:
        messages = [msg for msg in self._messages if msg.session_id == session_id]
        messages.sort(key=lambda item: item.created_at)
        return messages[-limit:]

    async def touch_session(self, session_id: UUID) -> None:
        session = self._sessions.get(session_id)
        if session is None:
            return
        now = utc_now()
        session.updated_at = now
        session.last_message_at = now