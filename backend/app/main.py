from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import yaml
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.models.rag import GuidelineChunk
from app.repositories.audit_repository import InMemoryAuditRepository
from app.repositories.conversation_repository import InMemoryConversationRepository
from app.repositories.medication_repository import InMemoryMedicationRepository
from app.repositories.patient_repository import InMemoryPatientRepository
from app.repositories.rag_repository import InMemoryRagRepository

APP_DIR = Path(__file__).resolve().parent
BACKEND_DIR = APP_DIR.parent
CONFIG_DIR = BACKEND_DIR / "config"
POLICY_DIR = APP_DIR / "policies"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("baymax.backend")

DEFAULT_APP_CONFIG: dict[str, Any] = {
    "app": {
        "name": "Baymax 2.0 Backend",
        "version": "0.1.0",
        "debug": True,
        "api_prefix": "/api",
        "docs_url": "/docs",
        "redoc_url": "/redoc",
    }
}

DEFAULT_CORS_CONFIG: dict[str, Any] = {
    "cors": {
        "allow_origins": ["*"],
        "allow_credentials": True,
        "allow_methods": ["*"],
        "allow_headers": ["*"],
    }
}


def load_yaml(path: Path, default: dict[str, Any] | None = None) -> dict[str, Any]:
    if not path.exists():
        return default or {}
    with path.open("r", encoding="utf-8") as file:
        data = yaml.safe_load(file) or {}
    return data


def build_default_guideline_chunks() -> list[GuidelineChunk]:
    return [
        GuidelineChunk(
            source_title="HPB Demo Guidance - Medication Routine",
            source_organization="HPB",
            chunk_text=(
                "Keeping a regular routine, using reminders, and maintaining an up-to-date medication list "
                "can support medication adherence for chronic condition management."
            ),
            tags=["medication", "routine", "adherence"],
        ),
        GuidelineChunk(
            source_title="MOH Demo Guidance - Seek Urgent Help",
            source_organization="MOH",
            chunk_text=(
                "Chest pain and difficulty breathing are warning symptoms that may require urgent medical attention. "
                "Call emergency services or seek urgent care immediately."
            ),
            tags=["emergency", "chest pain", "breathing"],
        ),
        GuidelineChunk(
            source_title="HPB Demo Guidance - Ask Your Care Team",
            source_organization="HPB",
            chunk_text=(
                "When unsure about medications, symptoms, or next steps, patients should consult their doctor, "
                "nurse, or pharmacist rather than changing treatment on their own."
            ),
            tags=["care team", "medications", "support"],
        ),
    ]


app_config = load_yaml(CONFIG_DIR / "app.yaml", DEFAULT_APP_CONFIG)
cors_config = load_yaml(CONFIG_DIR / "cors.yaml", DEFAULT_CORS_CONFIG)
feature_flags = load_yaml(CONFIG_DIR / "features.yaml", {})
safety_rules = load_yaml(POLICY_DIR / "safety_rules.yaml", {"blocked_patterns": []})
emergency_keywords = load_yaml(POLICY_DIR / "emergency_keywords.yaml", {"keywords": []})
escalation_rules = load_yaml(POLICY_DIR / "escalation_rules.yaml", {})


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.app_config = app_config
    app.state.feature_flags = feature_flags
    app.state.safety_rules = safety_rules
    app.state.emergency_keywords = emergency_keywords
    app.state.escalation_rules = escalation_rules

    app.state.patient_repo = InMemoryPatientRepository()
    app.state.medication_repo = InMemoryMedicationRepository()
    app.state.conversation_repo = InMemoryConversationRepository()
    app.state.rag_repo = InMemoryRagRepository(seed=build_default_guideline_chunks())
    app.state.audit_repo = InMemoryAuditRepository()

    logger.info("Baymax backend starting")
    logger.info("Loaded feature flags: %s", list(feature_flags.keys()))
    logger.info("Loaded %s emergency keywords", len(emergency_keywords.get("keywords", [])))
    yield
    logger.info("Baymax backend shutting down")


def register_system_routes(app: FastAPI) -> None:
    @app.get("/", tags=["system"])
    async def root() -> dict[str, Any]:
        return {
            "service": app.title,
            "version": app.version,
            "status": "ok",
        }

    @app.get("/health", tags=["system"])
    async def health() -> dict[str, Any]:
        return {
            "status": "healthy",
            "service": app.title,
            "version": app.version,
        }

    @app.get("/health/ready", tags=["system"])
    async def readiness() -> dict[str, Any]:
        return {
            "status": "ready",
            "policies_loaded": {
                "safety_rules": bool(app.state.safety_rules),
                "emergency_keywords": bool(app.state.emergency_keywords),
                "escalation_rules": bool(app.state.escalation_rules),
            },
        }


def register_optional_routers(app: FastAPI) -> None:
    try:
        from app.api.router import api_router
    except ModuleNotFoundError:
        logger.info("app.api.router not created yet; skipping API router registration")
        return

    app.include_router(api_router, prefix=app_config["app"]["api_prefix"])


def create_app() -> FastAPI:
    app = FastAPI(
        title=app_config["app"]["name"],
        version=app_config["app"]["version"],
        debug=app_config["app"]["debug"],
        docs_url=app_config["app"]["docs_url"],
        redoc_url=app_config["app"]["redoc_url"],
        lifespan=lifespan,
    )

    cors = cors_config["cors"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors["allow_origins"],
        allow_credentials=cors["allow_credentials"],
        allow_methods=cors["allow_methods"],
        allow_headers=cors["allow_headers"],
    )

    register_system_routes(app)
    register_optional_routers(app)
    return app


app = create_app()