"""Agent construction and the single entry point used by the CLI, evals and (later) AgentCore.

Tracing (spec 010): `ask()` wraps each turn in a `wealth_agent.turn` span that carries the session
id, prompt version and compliance summary. Strands supplies the agent, cycle, model and tool spans
beneath it. Tracing never changes the returned answer and never raises into the caller; it is a
no-op unless an entrypoint configured it (see `telemetry.py`).
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from opentelemetry import trace
from strands import Agent
from strands.models.model import Model

from wealth_agent.guardrails import (
    GR_OUTPUT_DISCLAIMER,
    bind_guardrails,
    record_check,
    summarize,
)
from wealth_agent.prompts import DISCLAIMER, PROMPT_VERSION, SYSTEM_PROMPT
from wealth_agent.tools import STRANDS_TOOLS

logger = logging.getLogger(__name__)


def build_agent(model: Model, quiet: bool = False) -> Agent:
    """Create the agent. `quiet=True` disables Strands' default streaming to stdout."""
    kwargs: dict[str, Any] = {"callback_handler": None} if quiet else {}
    return Agent(
        model=model,
        tools=list(STRANDS_TOOLS),
        system_prompt=SYSTEM_PROMPT,
        trace_attributes={"prompt.version": PROMPT_VERSION},
        **kwargs,
    )


def _safely(action: Callable[[], Any]) -> None:
    try:
        action()
    except Exception:  # noqa: BLE001 - tracing must never change a reply
        logger.warning("Tracing call failed", exc_info=True)


def ask(agent: Callable[[str], Any], text: str, session_id: str | None = None) -> str:
    """Run one turn and append the disclaimer in code (FR-005)."""
    with trace.get_tracer("wealth_agent").start_as_current_span("wealth_agent.turn") as span:
        with bind_guardrails() as checks:
            try:
                _safely(lambda: span.set_attribute("prompt.version", PROMPT_VERSION))
                if session_id:
                    _safely(lambda: span.set_attribute("session.id", session_id))
                    attributes = getattr(agent, "trace_attributes", None)
                    if isinstance(attributes, dict):
                        attributes["session.id"] = session_id

                answer = str(agent(text)).strip()
                if answer.endswith(DISCLAIMER):
                    _safely(
                        lambda: record_check(
                            GR_OUTPUT_DISCLAIMER, "pass", "disclaimer present", "allow"
                        )
                    )
                    return answer
                _safely(
                    lambda: record_check(
                        GR_OUTPUT_DISCLAIMER,
                        "fail",
                        "model omitted disclaimer; appended by code",
                        "append_disclaimer",
                    )
                )
                return f"{answer}\n\n{DISCLAIMER}" if answer else DISCLAIMER
            finally:
                _safely(lambda: span.set_attributes(summarize(checks.checks)))
