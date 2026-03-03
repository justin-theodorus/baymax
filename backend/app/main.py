from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

import jwt as pyjwt

from app.config import settings
from app.models.auth import CurrentUser, UserRole

app = FastAPI(
    title='Baymax 2.0 API',
    description='Multi-agent AI care companion for elderly Singaporeans',
    version='0.1.0',
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin, 'http://localhost:3000'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

bearer_scheme = HTTPBearer(auto_error=False)


def verify_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> CurrentUser:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Missing authorization token',
        )

    token = credentials.credentials

    try:
        payload = pyjwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=['HS256'],
            options={'verify_exp': True} if settings.supabase_jwt_secret else {'verify_signature': False},
        )
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Token expired')
    except pyjwt.InvalidTokenError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f'Invalid token: {e}')

    role: UserRole = payload.get('role', '')
    app_user_id: str = payload.get('app_user_id', '')
    user_id: str = payload.get('sub', '')

    if not role:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Token missing role claim')

    return CurrentUser(user_id=user_id, role=role, app_user_id=app_user_id)


def require_role(*roles: UserRole):
    def _check(current_user: CurrentUser = Depends(verify_token)) -> CurrentUser:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f'Access denied. Required role(s): {", ".join(roles)}',
            )
        return current_user
    return _check


# ── Health check ────────────────────────────────────────────────────────────

@app.get('/health', tags=['system'])
async def health_check():
    return {'status': 'ok', 'service': 'baymax-api', 'version': '0.1.0'}


# ── Protected route stubs (implemented in later phases) ─────────────────────

@app.post('/api/chat', tags=['patient'])
async def chat(current_user: CurrentUser = Depends(require_role('patient'))):
    """Patient chat endpoint — implemented in Phase 2."""
    return {'message': 'Chat endpoint — coming in Phase 2', 'patient_id': current_user.app_user_id}


@app.websocket('/api/voice')
async def voice_ws(websocket):  # type: ignore[no-untyped-def]
    """Voice WebSocket endpoint — implemented in Phase 4."""
    await websocket.accept()
    await websocket.send_json({'message': 'Voice endpoint — coming in Phase 4'})
    await websocket.close()


@app.get('/api/caregiver/{patient_id}/dashboard', tags=['caregiver'])
async def caregiver_dashboard(
    patient_id: str,
    current_user: CurrentUser = Depends(require_role('caregiver')),
):
    """Caregiver dashboard endpoint — implemented in Phase 6."""
    return {'message': 'Caregiver dashboard — coming in Phase 6', 'patient_id': patient_id}


@app.get('/api/clinician/{patient_id}/report', tags=['clinician'])
async def clinician_report(
    patient_id: str,
    current_user: CurrentUser = Depends(require_role('clinician')),
):
    """Clinician report endpoint — implemented in Phase 7."""
    return {'message': 'Clinician report — coming in Phase 7', 'patient_id': patient_id}
