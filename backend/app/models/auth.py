from __future__ import annotations

from uuid import UUID

from pydantic import Field

from app.models.base import AppBaseModel
from app.models.enums import UserRole


class JwtClaims(AppBaseModel):
    sub: UUID
    role: UserRole
    app_user_id: UUID
    email: str | None = None
    exp: int | None = None
    iat: int | None = None


class CurrentUser(AppBaseModel):
    auth_user_id: UUID = Field(alias="sub")
    app_user_id: UUID
    role: UserRole
    email: str | None = None