"""Guardrail outcomes for the two checks that exist in code today (spec 010, FR-004 to FR-006).

`GR-TOOL-INPUT` is the tool argument validation in `tools._safe()`; `GR-OUTPUT-DISCLAIMER` is the
disclaimer enforcement in `agent.ask()`. Each turn binds its own collector in a `ContextVar`, so
concurrent turns cannot mix results. Nothing here evaluates policy or raises into the caller.
"""

from __future__ import annotations

import logging
from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field

from opentelemetry import trace

GR_TOOL_INPUT = "GR-TOOL-INPUT"
GR_OUTPUT_DISCLAIMER = "GR-OUTPUT-DISCLAIMER"

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class GuardrailCheck:
    rule_id: str
    result: str  # "pass" | "fail"
    reason: str
    action: str  # "allow" | "return_error" | "append_disclaimer"
    tool_name: str | None = None


@dataclass
class TurnGuardrails:
    checks: list[GuardrailCheck] = field(default_factory=list)


_current: ContextVar[TurnGuardrails | None] = ContextVar("wealth_agent_guardrails", default=None)


def current_guardrails() -> TurnGuardrails | None:
    return _current.get()


@contextmanager
def bind_guardrails() -> Iterator[TurnGuardrails]:
    """Bind a fresh collector for one turn and always unbind it."""
    collector = TurnGuardrails()
    token = _current.set(collector)
    try:
        yield collector
    finally:
        _current.reset(token)


def summarize(checks: Sequence[GuardrailCheck]) -> dict[str, str | int]:
    failed = sorted({c.rule_id for c in checks if c.result == "fail"})
    return {
        "compliance_status": "fail" if failed else "pass",
        "compliance_failed_rules": ",".join(failed),
        "compliance_check_count": len(checks),
    }


def record_check(
    rule_id: str,
    result: str,
    reason: str,
    action: str,
    tool_name: str | None = None,
    *,
    span_attributes: bool = False,
) -> None:
    """Record one outcome on the current turn and span. Never raises."""
    try:
        check = GuardrailCheck(rule_id, result, reason, action, tool_name)
        collector = _current.get()
        if collector is not None:
            collector.checks.append(check)
        span = trace.get_current_span()
        if not span.is_recording():
            return
        attributes: dict[str, str | bool] = {
            "guardrail_rule_id": rule_id,
            "guardrail_result": result,
            "guardrail_reason": reason,
            "guardrail_action": action,
        }
        if tool_name:
            attributes["gen_ai.tool.name"] = tool_name
        span.add_event("guardrail.check", attributes)
        if span_attributes:
            span.set_attributes({**attributes, "tool_ok": result == "pass"})
    except Exception:  # noqa: BLE001 - tracing must never change a tool result or a reply
        logger.warning("Could not record guardrail outcome", exc_info=True)
