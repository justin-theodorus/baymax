from __future__ import annotations

from collections.abc import Callable
from typing import Iterable

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import InvalidTokenError

from app.core.config import get_settings
from app.models.auth import CurrentUser, JwtClaims
from app.models.enums import UserRole

bearer_scheme = HTTPBearer(auto_error=True)

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> CurrentUser:
    settings = get_settings()
    token = credentials.credentials

    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"verify_aud": False},
        )
        claims = JwtClaims.model_validate(payload)
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unable to validate token",
        ) from exc

    return CurrentUser(
        sub=claims.sub,
        app_user_id=claims.app_user_id,
        role=claims.role,
        email=claims.email,
    )


def require_roles(allowed_roles: Iterable[UserRole]) -> Callable:
    allowed = set(allowed_roles)

    async def dependency(
        current_user: CurrentUser = Depends(get_current_user),
    ) -> CurrentUser:
        if current_user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this resource",
            )
        return current_user

    return dependency


require_patient = require_roles([UserRole.PATIENT])
require_caregiver = require_roles([UserRole.CAREGIVER])
require_clinician = require_roles([UserRole.CLINICIAN])