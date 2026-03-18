from __future__ import annotations

from typing import Any

from app.models.enums import LanguageCode
from app.models.escalation import SafetyScreenResult


class SafetyService:
    def __init__(
        self,
        safety_rules: dict[str, Any],
        emergency_keywords: dict[str, Any],
    ) -> None:
        self._safety_rules = safety_rules or {}
        self._emergency_keywords = emergency_keywords or {}

    def detect_emergency(self, text: str) -> bool:
        lowered = text.lower()
        keywords = self._emergency_keywords.get("keywords", [])
        return any(keyword.lower() in lowered for keyword in keywords)

    def get_emergency_script(self, language: LanguageCode) -> str:
        response_map = self._emergency_keywords.get("response", {})
        return response_map.get(
            language.value,
            response_map.get(
                "en",
                "This may be urgent. Please call 995 immediately or go to the nearest emergency department.",
            ),
        )

    def apply_policy_gate(self, text: str) -> SafetyScreenResult:
        lowered = text.lower()
        blocked_patterns = self._safety_rules.get("blocked_patterns", [])
        softened_rules = self._safety_rules.get("soften_instead", [])

        matched = [
            pattern
            for pattern in blocked_patterns
            if pattern.lower() in lowered
        ]

        if not matched:
            return SafetyScreenResult(
                is_blocked=False,
                contains_emergency_keywords=self.detect_emergency(text),
                final_safe_text=text,
            )

        fallback = (
            "I can share general support, but diagnosis or medication changes should come from your clinician. "
            "If you feel worse or are worried, please contact your care team."
        )
        if softened_rules:
            fallback = " ".join(softened_rules)

        return SafetyScreenResult(
            is_blocked=True,
            contains_emergency_keywords=self.detect_emergency(text),
            blocked_rules=matched,
            softened_rules=softened_rules,
            final_safe_text=fallback,
        )