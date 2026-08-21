"""Persistent app configuration for the web API (strategy editor a+b).

Stores provider/risk parameters, an editable system prompt and manual rules in
a local JSON file. Validation reuses the dataclass constructors.
"""

from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path

from market_data.llm import ProviderConfig
from market_data.risk import RiskConfig


class ConfigStore:
    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)

    def load(self) -> dict:
        if not self.path.exists():
            return {
                "provider": asdict(ProviderConfig()),
                "risk": asdict(RiskConfig()),
                "system_prompt": None,
                "manual_rules": [],
                "factors": None,
            }
        data = json.loads(self.path.read_text(encoding="utf-8"))
        data.setdefault("factors", None)
        return data

    def save(self, data: dict) -> dict:
        """Validate then persist. Raises ValueError on invalid provider/risk."""
        provider = ProviderConfig(**data.get("provider", {}))  # validates
        risk = RiskConfig(**data.get("risk", {}))              # validates
        payload = {
            "provider": asdict(provider),
            "risk": asdict(risk),
            "system_prompt": data.get("system_prompt"),
            "manual_rules": list(data.get("manual_rules", []) or []),
            "factors": data.get("factors"),
        }
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        return payload

    def provider_config(self) -> ProviderConfig:
        return ProviderConfig(**self.load()["provider"])

    def risk_config(self) -> RiskConfig:
        return RiskConfig(**self.load()["risk"])
