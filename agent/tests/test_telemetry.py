"""Tracing configuration: modes, environment, content policy, resilience (FR-007/008/012)."""

import logging
import re

import pytest
from opentelemetry import trace
from strands.telemetry import tracer as strands_tracer

from wealth_agent import telemetry
from wealth_agent.telemetry import TracingConfigError, configure_tracing, new_local_session_id


def test_new_local_session_id_format():
    first, second = new_local_session_id(), new_local_session_id()
    uuid4 = r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}"
    assert re.fullmatch(f"local-{uuid4}", first)
    assert first != second


def test_off_mode_is_noop(monkeypatch):
    env = {}
    configure_tracing("off", env=env)
    assert env == {}
    assert telemetry.current_mode() == "off"


def test_mode_defaults_to_off_when_unset():
    configure_tracing(None, env={})
    assert telemetry.current_mode() == "off"


def test_unknown_mode_is_off_with_warning(caplog):
    with caplog.at_level(logging.WARNING):
        configure_tracing("bogus", env={})
    assert telemetry.current_mode() == "off"
    assert "bogus" in caplog.text


def test_console_mode_configures_provider_and_defaults_to_local(capsys):
    env = {}
    configure_tracing("console", env=env)
    assert telemetry.current_mode() == "console"
    assert telemetry.effective_environment() == "local"
    assert "gen_ai_latest_experimental" in env["OTEL_SEMCONV_STABILITY_OPT_IN"]
    assert "gen_ai_unredacted_attributes" not in env["OTEL_SEMCONV_STABILITY_OPT_IN"]


def test_console_mode_is_idempotent():
    configure_tracing("console", env={})
    configure_tracing("console", env={})
    assert telemetry.current_mode() == "console"


def test_console_provider_samples_everything():
    provider = telemetry.build_console_provider({"DEPLOYMENT_ENVIRONMENT": "local"})
    tracer = provider.get_tracer("t")
    for _ in range(50):
        with tracer.start_as_current_span("turn") as span:
            assert span.is_recording()
    assert provider.resource.attributes["service.name"] == "convai-wealth-agent"
    assert provider.resource.attributes["deployment.environment"] == "local"


def test_non_local_full_content_is_refused():
    env = {"DEPLOYMENT_ENVIRONMENT": "staging", "TRACING_CAPTURE_CONTENT": "true"}
    with pytest.raises(TracingConfigError):
        configure_tracing("console", env=env)


def test_tracing_config_error_names_the_setting():
    env = {"DEPLOYMENT_ENVIRONMENT": "staging", "TRACING_CAPTURE_CONTENT": "true"}
    with pytest.raises(TracingConfigError) as exc:
        configure_tracing("console", env=env)
    assert "TRACING_CAPTURE_CONTENT" in str(exc.value)
    assert "staging" in str(exc.value)


def test_non_local_without_content_flag_is_metadata_only():
    env = {"DEPLOYMENT_ENVIRONMENT": "staging"}
    configure_tracing("console", env=env)
    assert "gen_ai_unredacted_attributes=" in env["OTEL_SEMCONV_STABILITY_OPT_IN"].split(",")


def test_metadata_only_replaces_an_existing_allow_list():
    env = {
        "DEPLOYMENT_ENVIRONMENT": "prod",
        "TRACING_CAPTURE_CONTENT": "false",
        "OTEL_SEMCONV_STABILITY_OPT_IN": "gen_ai_unredacted_attributes=gen_ai.*",
    }
    configure_tracing("console", env=env)
    tokens = env["OTEL_SEMCONV_STABILITY_OPT_IN"].split(",")
    assert "gen_ai_unredacted_attributes=" in tokens
    assert "gen_ai_unredacted_attributes=gen_ai.*" not in tokens


def test_adot_requires_explicit_environment():
    env = {"OTEL_SEMCONV_STABILITY_OPT_IN": "gen_ai_latest_experimental"}
    with pytest.raises(TracingConfigError) as exc:
        configure_tracing("adot", env=env)
    assert "DEPLOYMENT_ENVIRONMENT" in str(exc.value)


def test_environment_mismatch_refused():
    env = {
        "DEPLOYMENT_ENVIRONMENT": "local",
        "OTEL_RESOURCE_ATTRIBUTES": "service.name=x,deployment.environment=prod",
    }
    with pytest.raises(TracingConfigError):
        configure_tracing("console", env=env)


def test_environment_read_from_resource_attributes():
    env = {
        "OTEL_RESOURCE_ATTRIBUTES": "service.name=x,deployment.environment=staging",
        "TRACING_CAPTURE_CONTENT": "true",
    }
    with pytest.raises(TracingConfigError):
        configure_tracing("console", env=env)


def test_adot_requires_latest_semconv():
    env = {"DEPLOYMENT_ENVIRONMENT": "local"}
    with pytest.raises(TracingConfigError) as exc:
        configure_tracing("adot", env=env)
    assert "gen_ai_latest_experimental" in str(exc.value)


def test_adot_mode_does_not_create_a_local_provider(caplog):
    before = trace.get_tracer_provider()
    env = {
        "DEPLOYMENT_ENVIRONMENT": "local",
        "OTEL_SEMCONV_STABILITY_OPT_IN": "gen_ai_latest_experimental",
    }
    with caplog.at_level(logging.INFO):
        configure_tracing("adot", env=env)
    assert trace.get_tracer_provider() is before
    assert telemetry.current_mode() == "adot"
    assert "ADOT" in caplog.text


def test_adot_mode_needs_no_aws_credentials(monkeypatch):
    for name in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_PROFILE"):
        monkeypatch.delenv(name, raising=False)
    env = {
        "DEPLOYMENT_ENVIRONMENT": "local",
        "OTEL_SEMCONV_STABILITY_OPT_IN": "gen_ai_latest_experimental",
    }
    configure_tracing("adot", env=env)  # must not raise or touch the network


def test_configure_refuses_when_strands_tracer_already_exists():
    strands_tracer.get_tracer()
    with pytest.raises(TracingConfigError):
        configure_tracing("console", env={})


def test_non_config_setup_error_is_logged_not_raised(monkeypatch, caplog):
    def boom(*_a, **_k):
        raise RuntimeError("exporter exploded")

    monkeypatch.setattr(telemetry, "build_console_provider", boom)
    with caplog.at_level(logging.WARNING):
        configure_tracing("console", env={})  # must not raise
    assert telemetry.current_mode() == "off"
    assert "exporter exploded" in caplog.text


def test_off_mode_produces_no_spans_and_prints_nothing(capsys):
    from wealth_agent.agent import ask

    class Fake:
        def __call__(self, text):
            return "ok"

    ask(Fake(), "hi")
    assert capsys.readouterr().out == ""


def test_tests_do_not_configure_otlp():
    import sys

    assert "opentelemetry.exporter.otlp.proto.http.trace_exporter" not in sys.modules
