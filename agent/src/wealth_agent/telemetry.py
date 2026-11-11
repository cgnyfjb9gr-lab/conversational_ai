"""Tracing setup for the wealth agent (spec 010).

Strands already emits the agent, cycle, model and tool spans. This module only decides *whether
and where* traces go and *whether content leaves the process*; the turn span and guardrail events
live in `agent.py` and `guardrails.py`. The contract is
`specs/010-agent-tracing/contracts/trace-schema.md`.

Modes (`TRACING_MODE`): `off` (default everywhere), `console` (local, no AWS), `adot` (the AWS
distro owns the provider and exporter; start with `opentelemetry-instrument`).

Call `configure_tracing()` from an entrypoint, before the first agent is built. Library code and
tests never call it. Only `TracingConfigError` escapes; any other setup error is logged and the
agent runs untraced.

Not traced yet (see the spec's Out of Scope list): backend, browser, evals, feedback trace
correlation, user identity, real guardrail policy evaluation, prompt registry or content hash,
notification delivery, long-term trace search, hosted/production content redaction.
"""

from __future__ import annotations

import logging
import os
import uuid
from collections.abc import MutableMapping
from importlib import metadata

SERVICE_NAME = "convai-wealth-agent"
DEFAULT_ENVIRONMENT = "local"
MODES = ("off", "console", "adot")

SEMCONV_VAR = "OTEL_SEMCONV_STABILITY_OPT_IN"
LATEST_CONVENTION = "gen_ai_latest_experimental"
# Empty allow-list: Strands replaces every sensitive value with its redaction marker.
REDACT_TOKEN = "gen_ai_unredacted_attributes="

logger = logging.getLogger(__name__)

_mode = "off"
_environment = DEFAULT_ENVIRONMENT
_console_ready = False


class TracingConfigError(ValueError):
    """Unsafe or ambiguous tracing configuration. Deliberately stops startup."""


def new_local_session_id() -> str:
    """Session id for entrypoints that have none (the CLI)."""
    return f"local-{uuid.uuid4()}"


def current_mode() -> str:
    return _mode


def effective_environment() -> str:
    return _environment


def _reset_for_tests() -> None:
    global _mode, _environment, _console_ready
    _mode, _environment, _console_ready = "off", DEFAULT_ENVIRONMENT, False


def _parse_resource_attributes(value: str | None) -> dict[str, str]:
    pairs = (item.split("=", 1) for item in (value or "").split(",") if "=" in item)
    return {key.strip(): val.strip() for key, val in pairs}


def resolve_environment(env: MutableMapping[str, str], mode: str) -> str:
    """One source of truth for `deployment.environment`; fail closed in AWS mode."""
    from_resource = _parse_resource_attributes(env.get("OTEL_RESOURCE_ATTRIBUTES")).get(
        "deployment.environment"
    )
    from_var = (env.get("DEPLOYMENT_ENVIRONMENT") or "").strip() or None
    if from_resource and from_var and from_resource.lower() != from_var.lower():
        raise TracingConfigError(
            "DEPLOYMENT_ENVIRONMENT "
            f"({from_var!r}) disagrees with deployment.environment in OTEL_RESOURCE_ATTRIBUTES "
            f"({from_resource!r}); set one value"
        )
    value = from_resource or from_var
    if value:
        return value.lower()
    if mode == "adot":
        raise TracingConfigError(
            "DEPLOYMENT_ENVIRONMENT must be set explicitly when TRACING_MODE=adot "
            "(an unlabelled hosted deployment is never treated as local)"
        )
    return DEFAULT_ENVIRONMENT


def _flag(value: str | None) -> bool | None:
    if value is None or not value.strip():
        return None
    return value.strip().lower() in {"1", "true", "yes", "on"}


def resolve_capture_content(env: MutableMapping[str, str], environment: str) -> bool:
    requested = _flag(env.get("TRACING_CAPTURE_CONTENT"))
    local = environment == DEFAULT_ENVIRONMENT
    if requested and not local:
        raise TracingConfigError(
            f"TRACING_CAPTURE_CONTENT=true is not allowed when the environment is {environment!r}; "
            "full prompt, reply and tool content may only be traced when the environment is 'local'"
        )
    return local if requested is None else requested


def _apply_content_policy(env: MutableMapping[str, str], capture: bool, mode: str) -> None:
    """Pin the content convention and, for metadata-only, turn on Strands' redaction."""
    tokens = [t.strip() for t in env.get(SEMCONV_VAR, "").split(",") if t.strip()]
    if mode == "adot" and LATEST_CONVENTION not in tokens:
        raise TracingConfigError(
            f"{SEMCONV_VAR} must include {LATEST_CONVENTION} when TRACING_MODE=adot "
            "(the content attribute names depend on it)"
        )
    if LATEST_CONVENTION not in tokens:
        tokens.append(LATEST_CONVENTION)
    if not capture:
        tokens = [t for t in tokens if not t.startswith("gen_ai_unredacted_attributes")]
        tokens.append(REDACT_TOKEN)
    env[SEMCONV_VAR] = ",".join(tokens)


def _service_version() -> str:
    try:
        return metadata.version("convai-agent")
    except metadata.PackageNotFoundError:
        return "0.1.0"


def build_console_provider(env: MutableMapping[str, str]):
    """A provider that records every turn (100% sampling, FR-010)."""
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.sampling import ALWAYS_ON, ParentBased

    resource = Resource.create(
        {
            "service.name": env.get("OTEL_SERVICE_NAME") or SERVICE_NAME,
            "service.version": _service_version(),
            "deployment.environment": resolve_environment(env, "console"),
        }
    )
    return TracerProvider(resource=resource, sampler=ParentBased(ALWAYS_ON))


def configure_tracing(
    mode: str | None = None,
    provider=None,
    env: MutableMapping[str, str] | None = None,
) -> None:
    """Set up tracing for this process. Safe to call more than once."""
    global _mode, _environment, _console_ready
    env = os.environ if env is None else env
    requested = (mode if mode is not None else env.get("TRACING_MODE") or "off").strip().lower()
    if requested not in MODES:
        logger.warning("Unknown TRACING_MODE %r; tracing is off (valid: %s)", requested, MODES)
        requested = "off"
    if requested == "off":
        _mode = "off"
        return

    try:
        from strands.telemetry import tracer as strands_tracer

        if getattr(strands_tracer, "_tracer_instance", None) is not None:
            raise TracingConfigError(
                "configure_tracing() must run before the first agent is built "
                "(Strands reads the tracing environment once, when its tracer is created)"
            )
        environment = resolve_environment(env, requested)
        capture = resolve_capture_content(env, environment)
        _apply_content_policy(env, capture, requested)
        _environment = environment

        if requested == "adot":
            logger.info("Tracing: ADOT owns the tracer provider and exporter")
        elif provider is not None:
            from opentelemetry import trace

            trace.set_tracer_provider(provider)
        elif not _console_ready:
            from opentelemetry import trace
            from strands.telemetry import StrandsTelemetry

            console_provider = build_console_provider(env)
            trace.set_tracer_provider(console_provider)
            StrandsTelemetry(tracer_provider=console_provider).setup_console_exporter()
            _console_ready = True
        _mode = requested
    except TracingConfigError:
        raise
    except Exception as exc:  # noqa: BLE001 - tracing must never stop the agent
        _mode = "off"
        logger.warning(
            "Tracing setup failed (%s: %s); continuing without tracing", type(exc).__name__, exc
        )
