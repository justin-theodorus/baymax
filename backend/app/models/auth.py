from dataclasses import dataclass
from typing import Literal


UserRole = Literal['patient', 'caregiver', 'clinician']


@dataclass
class CurrentUser:
    user_id: str
    role: UserRole
    app_user_id: str
