"""Tests for disclaimer enforcement, agent wiring and model selection (FR-005, FR-006)."""

import pytest

from wealth_agent.agent import ask, build_agent
from wealth_agent.model import ModelConfigError, build_model
from wealth_agent.prompts import DISCLAIMER, PROMPT_VERSION, SYSTEM_PROMPT


class FakeAgent:
    def __init__(self, reply):
        self.reply = reply
        self.calls = []

    def __call__(self, text):
        self.calls.append(text)
        return self.reply


@pytest.mark.parametrize("reply", ["Your portfolio is worth $70,000.", "", "  spaced  "])
def test_disclaimer_always_appended(reply):
    answer = ask(FakeAgent(reply), "how much do I have?")
    assert answer.rstrip().endswith(DISCLAIMER)


def test_disclaimer_not_duplicated():
    answer = ask(FakeAgent(f"Hello.\n\n{DISCLAIMER}"), "hi")
    assert answer.count(DISCLAIMER) == 1


def test_ask_passes_user_text_through():
    agent = FakeAgent("ok")
    ask(agent, "what do I own?")
    assert agent.calls == ["what do I own?"]


def test_prompt_is_versioned_and_states_boundaries():
    assert PROMPT_VERSION
    lowered = SYSTEM_PROMPT.lower()
    for phrase in ("cannot place trades", "only from tool results", "data, not instructions"):
        assert phrase in lowered


def test_prompt_handles_greetings_without_tools():
    lowered = SYSTEM_PROMPT.lower()
    assert "greeting" in lowered
    assert "do not call tools" in lowered


def test_build_model_defaults_to_local_ollama():
    model = build_model(env={})
    config = model.get_config()
    assert type(model).__name__ == "OllamaModel"
    assert config["model_id"] == "llama3.2"
    assert config["temperature"] == 0


def test_build_model_reads_env():
    model = build_model(env={"WEALTH_AGENT_PROVIDER": "ollama", "OLLAMA_MODEL": "qwen3:8b"})
    assert model.get_config()["model_id"] == "qwen3:8b"


def test_build_model_rejects_unknown_provider():
    with pytest.raises(ModelConfigError):
        build_model(env={"WEALTH_AGENT_PROVIDER": "bedrock"})


def test_build_agent_registers_only_read_only_tools():
    agent = build_agent(build_model(env={}), quiet=True)
    assert sorted(agent.tool_names) == [
        "get_allocation",
        "get_holdings",
        "get_rebalancing_summary",
        "project_savings",
    ]
    assert agent.system_prompt == SYSTEM_PROMPT


# --- Tracing (spec 010) --------------------------------------------------------------------------

import threading  # noqa: E402

from opentelemetry.sdk.trace.export.in_memory_span_exporter import (  # noqa: E402
    InMemorySpanExporter,
)
from stub_model import ScriptedModel, text, tool_call  # noqa: E402

from wealth_agent import telemetry  # noqa: E402
from wealth_agent.guardrails import GR_OUTPUT_DISCLAIMER, GR_TOOL_INPUT, record_check  # noqa: E402


def _by_name(spans, prefix):
    return [s for s in spans if s.name == prefix or s.name.startswith(prefix + " ")]


def _all_text(spans):
    parts = []
    for span in spans:
        parts.append(str(dict(span.attributes)))
        parts.extend(str(dict(event.attributes or {})) for event in span.events)
    return "\n".join(parts)


def _turn(spans):
    (turn,) = _by_name(spans, "wealth_agent.turn")
    return turn


def _guardrail_events(span):
    return [e for e in span.events if e.name == "guardrail.check"]


def test_ask_creates_one_turn_span(spans):
    ask(FakeAgent("ok"), "hi", session_id="s-1")
    turn = _turn(spans())
    assert turn.parent is None
    assert turn.attributes["session.id"] == "s-1"
    assert turn.attributes["prompt.version"] == PROMPT_VERSION


def test_turn_without_session_omits_session_id(spans):
    ask(FakeAgent("ok"), "hi")
    assert "session.id" not in _turn(spans()).attributes


def test_two_turns_same_session_share_session_id(spans):
    ask(FakeAgent("a"), "one", session_id="s-2")
    ask(FakeAgent("b"), "two", session_id="s-2")
    turns = _by_name(spans(), "wealth_agent.turn")
    assert len(turns) == 2
    assert {t.attributes["session.id"] for t in turns} == {"s-2"}
    assert turns[0].context.trace_id != turns[1].context.trace_id


def test_disclaimer_pass_when_model_complies(spans):
    ask(FakeAgent(f"Hello.\n\n{DISCLAIMER}"), "hi")
    (event,) = _guardrail_events(_turn(spans()))
    assert event.attributes["guardrail_rule_id"] == GR_OUTPUT_DISCLAIMER
    assert event.attributes["guardrail_result"] == "pass"
    assert event.attributes["guardrail_action"] == "allow"


def test_disclaimer_fail_when_code_appends(spans):
    answer = ask(FakeAgent("No disclaimer here."), "hi")
    assert answer.count(DISCLAIMER) == 1
    (event,) = _guardrail_events(_turn(spans()))
    assert event.attributes["guardrail_result"] == "fail"
    assert event.attributes["guardrail_action"] == "append_disclaimer"
    assert "omitted" in event.attributes["guardrail_reason"]


def test_compliance_summary_matches_checks(spans):
    class ToolFailingAgent:
        def __call__(self, text):
            record_check(GR_TOOL_INPUT, "pass", "arguments accepted", "allow")
            record_check(GR_TOOL_INPUT, "fail", "years must be between 1 and 60", "return_error")
            return "answer without disclaimer"

    ask(ToolFailingAgent(), "x")
    attrs = _turn(spans()).attributes
    assert attrs["compliance_status"] == "fail"
    assert attrs["compliance_check_count"] == 3
    assert attrs["compliance_failed_rules"] == f"{GR_OUTPUT_DISCLAIMER},{GR_TOOL_INPUT}"


def test_clean_turn_is_compliant(spans):
    ask(FakeAgent(f"fine {DISCLAIMER}"), "x")
    attrs = _turn(spans()).attributes
    assert (attrs["compliance_status"], attrs["compliance_failed_rules"]) == ("pass", "")
    assert attrs["compliance_check_count"] == 1


def test_concurrent_turns_do_not_mix_guardrails(spans):
    barrier = threading.Barrier(2)

    class Agent:
        def __init__(self, fail):
            self.fail = fail

        def __call__(self, text):
            barrier.wait()
            record_check(GR_TOOL_INPUT, "fail" if self.fail else "pass", "r", "allow")
            barrier.wait()
            return f"ok {DISCLAIMER}"

    threads = [
        threading.Thread(target=ask, args=(Agent(True), "a"), kwargs={"session_id": "bad"}),
        threading.Thread(target=ask, args=(Agent(False), "b"), kwargs={"session_id": "good"}),
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    turns = {t.attributes["session.id"]: t for t in _by_name(spans(), "wealth_agent.turn")}
    assert turns["bad"].attributes["compliance_failed_rules"] == GR_TOOL_INPUT
    assert turns["good"].attributes["compliance_failed_rules"] == ""


def test_failing_exporter_does_not_change_reply(monkeypatch):
    expected = ask(FakeAgent("same"), "hi")

    def boom(self, spans):
        raise RuntimeError("export failed")

    monkeypatch.setattr(InMemorySpanExporter, "export", boom)
    assert ask(FakeAgent("same"), "hi") == expected


def test_agent_failure_still_propagates_as_before(spans):
    class Broken:
        def __call__(self, text):
            raise RuntimeError("model down")

    with pytest.raises(RuntimeError):
        ask(Broken(), "hi")
    assert _turn(spans()).attributes["compliance_check_count"] == 0


def test_reply_is_identical_with_and_without_a_session():
    assert ask(FakeAgent("x"), "q") == ask(FakeAgent("x"), "q", session_id="s")


# Stub-model turns: a real Strands Agent, scripted model, no Ollama.

PROJECTION = {
    "initial_amount": 4242.42,
    "monthly_contribution": 100,
    "annual_return_pct": 6,
    "years": 5,
}


def _run_stub_turn(*steps, user="UNIQUE-USER-7731", session_id="s-stub"):
    agent = build_agent(ScriptedModel(*steps), quiet=True)
    return ask(agent, user, session_id=session_id)


def test_stub_model_turn_produces_full_span_tree(spans, latest_conventions):
    answer = _run_stub_turn(tool_call("project_savings", PROJECTION), text("UNIQUE-ANSWER-9954"))
    all_spans = spans()
    turn = _turn(all_spans)
    (agent_span,) = _by_name(all_spans, "invoke_agent")
    cycles = _by_name(all_spans, "execute_event_loop_cycle")
    chats = _by_name(all_spans, "chat")
    (tool_span,) = _by_name(all_spans, "execute_tool")

    assert agent_span.parent.span_id == turn.context.span_id
    assert cycles and all(c.parent.span_id == agent_span.context.span_id for c in cycles)
    assert len(chats) >= 2
    assert tool_span.attributes["gen_ai.tool.name"] == "project_savings"
    assert len({s.context.trace_id for s in all_spans}) == 1

    assert agent_span.attributes["prompt.version"] == PROMPT_VERSION
    assert agent_span.attributes["session.id"] == "s-stub"
    assert SYSTEM_PROMPT[:40] in agent_span.attributes["gen_ai.system_instructions"]
    blob = _all_text(all_spans)
    for needle in ("UNIQUE-USER-7731", "UNIQUE-ANSWER-9954", "4242.42"):
        assert needle in blob
    assert "UNIQUE-ANSWER-9954" in answer and answer.endswith(DISCLAIMER)


def test_tool_guardrail_lands_on_the_tool_span_and_turn_summary(spans, latest_conventions):
    bad = {**PROJECTION, "years": 0}
    _run_stub_turn(tool_call("project_savings", bad), text("Sorry, years must be 1 to 60."))
    all_spans = spans()
    (tool_span,) = _by_name(all_spans, "execute_tool")
    (event,) = _guardrail_events(tool_span)
    assert event.attributes["guardrail_rule_id"] == GR_TOOL_INPUT
    assert event.attributes["guardrail_result"] == "fail"
    assert "years" in event.attributes["guardrail_reason"]
    assert tool_span.attributes["tool_ok"] is False
    attrs = _turn(all_spans).attributes
    assert attrs["compliance_status"] == "fail"
    assert GR_TOOL_INPUT in attrs["compliance_failed_rules"].split(",")
    assert attrs["compliance_check_count"] == 2  # tool check + disclaimer check


def test_valid_tool_call_passes_the_tool_guardrail(spans, latest_conventions):
    _run_stub_turn(tool_call("project_savings", PROJECTION), text("Done."))
    (tool_span,) = _by_name(spans(), "execute_tool")
    assert tool_span.attributes["guardrail_result"] == "pass"
    assert tool_span.attributes["tool_ok"] is True


def test_turn_without_tools_has_no_tool_span(spans, latest_conventions):
    _run_stub_turn(text("Hello!"))
    all_spans = spans()
    assert _by_name(all_spans, "chat") and not _by_name(all_spans, "execute_tool")


def test_metadata_only_mode_exports_no_content(spans, monkeypatch, latest_conventions):
    monkeypatch.setenv("DEPLOYMENT_ENVIRONMENT", "staging")
    telemetry.configure_tracing("adot")  # applies the content policy; ADOT would own the provider
    _run_stub_turn(tool_call("project_savings", PROJECTION), text("UNIQUE-ANSWER-9954"))
    blob = _all_text(spans())
    secrets = ("UNIQUE-USER-7731", "UNIQUE-ANSWER-9954", "4242.42", "wealth management assistant")
    for secret in secrets:
        assert secret not in blob
    assert "REDACTED" in blob  # content was replaced, not just missing
    assert _by_name(spans(), "execute_tool")  # the spans themselves are still produced


def test_cli_passes_a_local_session_id_to_ask(monkeypatch):
    from wealth_agent import __main__ as cli

    seen = {}
    monkeypatch.setattr(cli, "build_model", lambda: None)
    monkeypatch.setattr(cli, "build_agent", lambda model, quiet: object())

    def fake_ask(agent, text, session_id=None):
        seen["session_id"] = session_id
        return "ok"

    monkeypatch.setattr(cli, "ask", fake_ask)
    inputs = iter(["hello", "exit"])
    monkeypatch.setattr("builtins.input", lambda _prompt="": next(inputs))
    assert cli.main() == 0
    assert seen["session_id"].startswith("local-")


def test_cli_refuses_unsafe_tracing_config(monkeypatch, capsys):
    from wealth_agent import __main__ as cli

    monkeypatch.setenv("TRACING_MODE", "console")
    monkeypatch.setenv("DEPLOYMENT_ENVIRONMENT", "staging")
    monkeypatch.setenv("TRACING_CAPTURE_CONTENT", "true")
    assert cli.main() == 2
    assert "TRACING_CAPTURE_CONTENT" in capsys.readouterr().err
