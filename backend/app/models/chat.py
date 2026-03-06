from pydantic import BaseModel


class ChatRequest(BaseModel):
    patient_id: str
    message: str
    language: str = "en"


class ChatResponse(BaseModel):
    response: str
    language: str
    conversation_id: str


class LogDoseRequest(BaseModel):
    patient_id: str
    medication_id: str
    taken: bool
    timestamp: str | None = None
