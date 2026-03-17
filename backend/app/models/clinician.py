from pydantic import BaseModel


class RecommendationFlag(BaseModel):
    type: str  # "review" | "positive" | "discuss"
    description: str
    source: str
    confidence: float


class ClinicianReportRequest(BaseModel):
    start_date: str | None = None
    end_date: str | None = None


class ClinicianReportResponse(BaseModel):
    id: str | None
    patient_id: str
    report: dict


class VisitBriefRequest(BaseModel):
    appointment_date: str
