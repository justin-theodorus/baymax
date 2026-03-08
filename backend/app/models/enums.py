from enum import Enum


class UserRole(str, Enum):
    PATIENT = "patient"
    CAREGIVER = "caregiver"
    CLINICIAN = "clinician"


class LanguageCode(str, Enum):
    EN = "en"
    ZH = "zh"
    MS = "ms"
    TA = "ta"


class ChannelType(str, Enum):
    TEXT = "text"
    VOICE = "voice"


class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"
    TOOL = "tool"


class SessionStatus(str, Enum):
    ACTIVE = "active"
    CLOSED = "closed"


class AdherenceStatus(str, Enum):
    TAKEN = "taken"
    MISSED = "missed"
    SKIPPED = "skipped"
    UNKNOWN = "unknown"


class AlertSeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    EMERGENCY = "emergency"


class SummaryAudience(str, Enum):
    CAREGIVER = "caregiver"
    CLINICIAN = "clinician"


class AgentRoute(str, Enum):
    END = "end"
    CAREGIVER_LIAISON = "caregiver_liaison"
    CLINICIAN_BRIDGE = "clinician_bridge"
    EMERGENCY_HANDLER = "emergency_handler"