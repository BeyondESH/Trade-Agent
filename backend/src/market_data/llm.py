"""Pluggable LLM providers for the trading agent (design D1-D3).

Provides:
- AgentDecision: structured decision contract.
- ProviderConfig: validated configuration.
- RuleBasedProvider: deterministic left-side S/R baseline (offline, testable).
- LLMTextProvider: wraps an injected `complete(system, user) -> str` callable,
  builds the prompt and parses a JSON decision (falls back to hold on failure).
- make_provider + urllib-based adapters for OpenAI-compatible endpoints / Ollama
  (documented; not exercised live in unit tests).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Callable

Complete = Callable[[str, str], str]

VALID_ACTIONS = {"open", "close", "hold"}
VALID_SIDES = {"long", "short", None}


@dataclass
class AgentDecision:
    action: str  # "open" | "close" | "hold"
    symbol: str
    side: str | None = None  # "long" | "short" | None
    reference_price: float | None = None
    reason: str = ""
    confidence: float = 0.0


@dataclass
class ProviderConfig:
    kind: str = "rule"  # "rule" | "openai" | "ollama" | "llm"
    model: str = ""
    base_url: str = ""
    api_key: str = ""
    near_pct: float = 0.005       # how close price must be to a level
    min_strength: float = 2.0     # minimum level strength to act
    leverage: float = 100.0
    category: str = "USDT-FUTURES"

    def __post_init__(self) -> None:
        if not (0.0 < self.near_pct <= 1.0):
            raise ValueError(f"near_pct must be in (0,1], got {self.near_pct}")
        if self.min_strength < 0:
            raise ValueError("min_strength must be >= 0")
        if self.leverage < 1.0:
            raise ValueError("leverage must be >= 1")


def _nearest(levels: list[dict], price: float, kind: str) -> dict | None:
    """Nearest support (below) or resistance (above) by price distance."""
    if kind == "support":
        cands = [l for l in levels if l["kind"] == "support" and l["price"] <= price]
        return max(cands, key=lambda l: l["price"]) if cands else None
    cands = [l for l in levels if l["kind"] == "resistance" and l["price"] >= price]
    return min(cands, key=lambda l: l["price"]) if cands else None


class RuleBasedProvider:
    """Deterministic left-side strategy: buy near strong support, sell near
    strong resistance, else hold."""

    def __init__(self, cfg: ProviderConfig | None = None) -> None:
        self.cfg = cfg or ProviderConfig(kind="rule")

    def propose(self, context: dict) -> AgentDecision:
        price = context["price"]
        symbol = context["symbol"]
        levels = context.get("levels", [])
        cfg = self.cfg

        sup = _nearest(levels, price, "support")
        res = _nearest(levels, price, "resistance")

        if sup and sup["strength"] >= cfg.min_strength:
            if (price - sup["price"]) / price <= cfg.near_pct:
                return AgentDecision(
                    "open", symbol, "long", sup["price"],
                    f"price near strong support {sup['price']:.2f} "
                    f"(strength {sup['strength']:.1f})", confidence=0.6,
                )
        if res and res["strength"] >= cfg.min_strength:
            if (res["price"] - price) / price <= cfg.near_pct:
                return AgentDecision(
                    "open", symbol, "short", res["price"],
                    f"price near strong resistance {res['price']:.2f} "
                    f"(strength {res['strength']:.1f})", confidence=0.6,
                )
        return AgentDecision("hold", symbol, None, None, "no strong level nearby", 0.3)


_SYSTEM_PROMPT = (
    "You are a crypto futures trading assistant using a LEFT-SIDE strategy: prefer "
    "buying near strong SUPPORT and selling near strong RESISTANCE. You are given a "
    "JSON context with current price, indicator values and ranked support/resistance "
    "levels. Respond with ONLY a JSON object: "
    '{"action":"open|close|hold","side":"long|short|null",'
    '"reference_price":number|null,"reason":string,"confidence":number}.'
)


class LLMTextProvider:
    def __init__(self, complete: Complete, cfg: ProviderConfig | None = None,
                 system_prompt: str | None = None) -> None:
        self._complete = complete
        self.cfg = cfg or ProviderConfig(kind="llm")
        self._system_prompt = system_prompt or _SYSTEM_PROMPT

    def propose(self, context: dict) -> AgentDecision:
        symbol = context["symbol"]
        try:
            raw = self._complete(self._system_prompt, json.dumps(context, default=str))
            data = json.loads(_extract_json(raw))
            action = data.get("action")
            if action not in VALID_ACTIONS:
                raise ValueError(f"invalid action {action!r}")
            side = data.get("side")
            side = side if side in VALID_SIDES else None
            return AgentDecision(
                action=action,
                symbol=symbol,
                side=side,
                reference_price=data.get("reference_price"),
                reason=str(data.get("reason", "")),
                confidence=float(data.get("confidence", 0.0) or 0.0),
            )
        except Exception as exc:  # noqa: BLE001 - degrade to hold on any failure
            return AgentDecision("hold", symbol, None, None, f"llm parse fallback: {exc}", 0.0)


def _extract_json(text: str) -> str:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise ValueError("no JSON object in LLM output")
    return text[start : end + 1]


def make_provider(cfg: ProviderConfig, complete: Complete | None = None):
    if cfg.kind == "rule":
        return RuleBasedProvider(cfg)
    if complete is None:
        complete = _build_complete(cfg)
    return LLMTextProvider(complete, cfg)


def _build_complete(cfg: ProviderConfig) -> Complete:
    if cfg.kind == "ollama":
        return build_ollama_complete(cfg)
    return build_openai_complete(cfg)


def build_ollama_complete(cfg: ProviderConfig) -> Complete:
    """Local Ollama chat adapter (documented; not unit-tested live)."""
    import urllib.request

    base = cfg.base_url or "http://localhost:11434"

    def complete(system: str, user: str) -> str:
        payload = json.dumps({
            "model": cfg.model or "llama3",
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "stream": False,
        }).encode()
        req = urllib.request.Request(
            f"{base}/api/chat", data=payload, headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = json.loads(resp.read())
        return body.get("message", {}).get("content", "")

    return complete


def build_openai_complete(cfg: ProviderConfig) -> Complete:
    """OpenAI-compatible chat-completions adapter (documented; not unit-tested live)."""
    import urllib.request

    base = cfg.base_url or "https://api.openai.com/v1"

    def complete(system: str, user: str) -> str:
        payload = json.dumps({
            "model": cfg.model or "gpt-4o-mini",
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.0,
        }).encode()
        req = urllib.request.Request(
            f"{base}/chat/completions",
            data=payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {cfg.api_key}",
            },
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = json.loads(resp.read())
        return body["choices"][0]["message"]["content"]

    return complete
