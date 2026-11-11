"""Guardrail collector and compliance summary (FR-004 to FR-006)."""

import threading

from opentelemetry import trace

from wealth_agent.guardrails import (
    GR_OUTPUT_DISCLAIMER,
    GR_TOOL_INPUT,
    bind_guardrails,
    current_guardrails,
    record_check,
    summarize,
)


def test_summary_of_no_checks_is_pass():
    assert summarize([]) == {
        "compliance_status": "pass",
        "compliance_failed_rules": "",
        "compliance_check_count": 0,
    }


def test_summary_fails_when_any_check_fails_and_sorts_rule_ids():
    with bind_guardrails() as checks:
        record_check(GR_TOOL_INPUT, "pass", "arguments accepted", "allow")
        record_check(GR_OUTPUT_DISCLAIMER, "fail", "model omitted disclaimer", "append_disclaimer")
        record_check(GR_TOOL_INPUT, "fail", "years must be between 1 and 60", "return_error")
    summary = summarize(checks.checks)
    assert summary["compliance_status"] == "fail"
    assert summary["compliance_failed_rules"] == f"{GR_OUTPUT_DISCLAIMER},{GR_TOOL_INPUT}"
    assert summary["compliance_check_count"] == 3


def test_record_check_outside_a_turn_is_a_noop():
    assert current_guardrails() is None
    record_check(GR_TOOL_INPUT, "fail", "x", "return_error")  # must not raise


def test_binding_is_reset_after_the_turn():
    with bind_guardrails():
        assert current_guardrails() is not None
    assert current_guardrails() is None


def test_record_check_adds_event_to_current_span(spans):
    tracer = trace.get_tracer("t")
    with tracer.start_as_current_span("tool"), bind_guardrails():
        record_check(
            GR_TOOL_INPUT, "fail", "bad", "return_error",
            tool_name="project_savings", span_attributes=True,
        )
    (span,) = spans()
    (event,) = span.events
    assert event.name == "guardrail.check"
    assert event.attributes["guardrail_rule_id"] == GR_TOOL_INPUT
    assert event.attributes["guardrail_result"] == "fail"
    assert event.attributes["gen_ai.tool.name"] == "project_savings"
    assert span.attributes["guardrail_result"] == "fail"
    assert span.attributes["tool_ok"] is False


def test_concurrent_collectors_are_isolated():
    results = {}
    barrier = threading.Barrier(2)

    def turn(name, result):
        with bind_guardrails() as checks:
            barrier.wait()
            record_check(GR_TOOL_INPUT, result, "r", "allow")
            barrier.wait()
            results[name] = summarize(checks.checks)

    a = threading.Thread(target=turn, args=("a", "fail"))
    b = threading.Thread(target=turn, args=("b", "pass"))
    for thread in (a, b):
        thread.start()
    for thread in (a, b):
        thread.join()
    assert results["a"]["compliance_status"] == "fail"
    assert results["b"]["compliance_status"] == "pass"
    assert results["a"]["compliance_check_count"] == results["b"]["compliance_check_count"] == 1
