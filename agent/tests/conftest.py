"""Shared tracing fixtures (spec 010).

OpenTelemetry allows the global tracer provider to be set once per process, so one provider with an
in-memory exporter is installed for the whole session and cleared before each test. Strands keeps
a process-wide `Tracer` that reads the environment when first created, so it is reset per test.
"""

import pytest
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from strands.telemetry import tracer as strands_tracer

from wealth_agent import telemetry

_EXPORTER = InMemorySpanExporter()
_PROVIDER = TracerProvider()
_PROVIDER.add_span_processor(SimpleSpanProcessor(_EXPORTER))
trace.set_tracer_provider(_PROVIDER)

TRACING_ENV = (
    "TRACING_MODE",
    "TRACING_CAPTURE_CONTENT",
    "DEPLOYMENT_ENVIRONMENT",
    "OTEL_RESOURCE_ATTRIBUTES",
    "OTEL_SEMCONV_STABILITY_OPT_IN",
    "OTEL_TRACES_SAMPLER",
)


@pytest.fixture(autouse=True)
def _clean_tracing_state(monkeypatch):
    """Tracing off and nothing leaked between tests, unless a test opts in."""
    for name in TRACING_ENV:
        monkeypatch.delenv(name, raising=False)
    _EXPORTER.clear()
    strands_tracer._tracer_instance = None
    telemetry._reset_for_tests()
    yield
    strands_tracer._tracer_instance = None
    telemetry._reset_for_tests()
    _EXPORTER.clear()


@pytest.fixture
def spans():
    """Finished spans recorded in-memory (call `spans()` to read them)."""
    return _EXPORTER.get_finished_spans


@pytest.fixture
def latest_conventions(monkeypatch):
    """Use the content convention this feature requires (contracts/trace-schema.md section 5)."""
    monkeypatch.setenv("OTEL_SEMCONV_STABILITY_OPT_IN", "gen_ai_latest_experimental")
