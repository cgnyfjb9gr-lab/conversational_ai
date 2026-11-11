# Implementation Plan: Agent Execution Tracing

**Branch**: `010-agent-tracing` | **Date**: 2026-11-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/010-agent-tracing/spec.md`

## Summary

Add OpenTelemetry tracing to the wealth agent so every user turn produces one complete trace: a turn root span, the Strands agent span, reasoning cycles, model calls, and tool calls. Strands already emits the agent/cycle/model/tool spans and captures full prompt, reply and tool content. This feature adds:

- A turn root span carrying `session.id`, `prompt.version`, and the compliance summary.
- Guardrail outcome events for the two checks that exist in code today: tool-input validation and the disclaimer check.
- Three tracing modes: `off` (the default everywhere), local `console`, and AWS export through the ADOT SDK.
- A hard content-capture policy: full content only when `deployment.environment=local`. Metadata-only export uses Strands' own redaction switch; no custom sanitizer is built.
- An AWS CloudWatch runbook, dashboard definition, metric filters and alarm definitions for the generative-AI observability view.

No backend, frontend, database or request/response contract changes. `feedback.trace_id` remains `null`; populating it is future work.

## Technical Context

**Language/Version**: Python 3.10+ (the agent package declares `requires-python = ">=3.10"`; local development currently uses 3.11/3.12)

**Primary Dependencies**:
- `strands-agents[ollama,otel]==1.63.0` (existing agent, plus the OpenTelemetry extra)
- `opentelemetry-api`, `opentelemetry-sdk` (transitive from Strands)
- `opentelemetry-exporter-otlp-proto-http` (from the `otel` extra)
- `aws-opentelemetry-distro==0.22.0` (new, AWS export only; Python >=3.10; pins `opentelemetry-sdk==1.45.1` exactly, so the existing 1.45.2 in `agent/.venv` is downgraded)
- `boto3` (already required by Strands; used by the ADOT credential chain)
- `ollama==0.6.3` (existing local model client)

**Storage**: N/A. Traces are exported to CloudWatch when AWS mode is enabled; no database tables change.

**Testing**: `pytest` with `InMemorySpanExporter`; no AWS, network, Ollama or database.

**Target Platform**: Local CLI (`python -m wealth_agent`) and the AgentCore entrypoint (`agent/agent.py`). CloudWatch export is targeted for the future AgentCore Runtime deployment.

**Project Type**: Python agent component inside a monorepo (`agent/`), with backend and frontend untouched.

**Performance Goals**: Tracing must not add a blocking network call to the reply path. Use batch export with a short export interval in local development. No measurable reply-latency regression in existing tests.

**Constraints**:
- CloudWatch OTLP traces endpoint accepts HTTP/protobuf only, requires Transaction Search, and authenticates with SigV4 (or a bearer key).
- Default random OTel trace IDs are silently dropped by X-Ray. The export path must supply X-Ray-compatible trace IDs.
- CloudWatch rejects spans larger than 200 KB. Strands does not cap content and ADOT owns the AWS-mode provider, so a cap is a known gap in this version (see Risks).
- Content attribute names depend on `OTEL_SEMCONV_STABILITY_OPT_IN`. This feature fixes it to `gen_ai_latest_experimental`.
- OpenTelemetry allows the global tracer provider to be set only once per process, and Strands' `Tracer` is a process singleton that reads the environment when first created. Setup order and test isolation depend on both.
- Full spans can be retained 90 days in `aws/spans`; X-Ray trace summaries and the service map expire after 30 days.
- 100% sampling is required for the POC.
- Full content capture is allowed only when `deployment.environment=local`.
- No AWS access is available during this feature, so the AWS path is documented and checklist-verified later.

**Scale/Scope**: POC volume, single local agent process. One trace per turn. No multi-tenant identity in traces.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Result |
|---|---|---|
| **I. Contract-First Interfaces** | No frontend↔backend or backend↔agent contract change. New fields must be additive/nullable. README must describe current contracts. | **PASS**. The only signature change is the internal `ask(agent, text, session_id=None)` helper. The agent HTTP request/response is unchanged, so the backend contract is unchanged. `feedback.trace_id` stays `null`. README will state that tracing exists and that `trace_id` is still null. |
| **II. Graceful Agent Degradation** | An agent failure must not reach the user; fallbacks must be logged; agent replies record `source` and `latency_ms`; outbound calls have a timeout. | **PASS**. Runtime tracing failures (setup of exporters, recording, export) are logged and swallowed. `ask()` still returns the same reply, and the backend fallback is untouched. The one deliberate exception is `TracingConfigError` (unsafe content/environment combination), which stops startup before any user turn exists. |
| **III. Persistence Through Alembic Only** | Schema changes only via Alembic; no manual DDL; transactions intact. | **PASS / N/A**. No database changes. |
| **IV. Tests Run Without External Services** | `pytest` with no Postgres, AWS or network. Each behavior has a test. | **PASS**. Tests use `InMemorySpanExporter` and never configure an OTLP exporter. The console exporter is only used by an explicit manual run. |
| **V. POC Simplicity** | Smallest design; each new runtime dependency justified in `plan.md`. | **PASS**. One new runtime dependency (`aws-opentelemetry-distro`) is required for the mandated AWS OTLP path. No collector, Jaeger, database or new service is introduced. Dashboard/alarm artifacts are manual, not IaC. |

**Post-design re-check**: No violations. No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/010-agent-tracing/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── trace-schema.md
├── checklists/
│   └── requirements.md
├── ops/
│   ├── iam-policy.json
│   ├── dashboard.json
│   ├── metric-filters.md
│   └── alarms.json
└── tasks.md              # created by /speckit-tasks
```

### Source Code (repository root)

```text
agent/
├── agent.py                         # AgentCore entrypoint: configure tracing, pass session_id
├── requirements.txt                 # add aws-opentelemetry-distro; strands-agents[ollama,otel]
├── pyproject.toml                   # mirror dependencies for local/uv installs
├── src/wealth_agent/
│   ├── __main__.py                  # CLI: configure console tracing, generate local session id
│   ├── agent.py                     # ask(): turn span, disclaimer check, compliance summary
│   ├── guardrails.py                # NEW: rule ids, per-turn collector, record/summary helpers
│   ├── telemetry.py                 # NEW: modes, resource, content policy, metadata-only exporter
│   ├── tools.py                     # _safe(): record GR-TOOL-INPUT on the active tool span
│   ├── prompts.py                   # unchanged; PROMPT_VERSION is the version source
│   ├── model.py                     # unchanged
│   └── portfolio.py                 # unchanged
└── tests/
    ├── conftest.py                  # NEW: session-scoped in-memory provider, per-test reset
    ├── test_agent.py                # updated: turn span, session id, disclaimer outcome
    ├── test_tools.py                # updated: tool guardrail event
    ├── test_telemetry.py            # NEW: modes, content policy, redaction, resilience
    └── test_guardrails.py           # NEW: collector, summary, concurrency isolation
```

**Structure Decision**: Keep the existing `agent/` package layout. New tracing concerns go in two focused modules (`telemetry.py`, `guardrails.py`) rather than being spread across the model/tools. Backend and frontend are untouched.

## Phase 0: Research

See [research.md](./research.md). Resolved decisions:

1. **CloudWatch via OTLP** is the backend, rather than the X-Ray SDK or a third-party APM. It satisfies the AWS/OpenTelemetry constraint and gives the GenAI Observability view.
2. **ADOT collectorless** (`aws-opentelemetry-distro` + `opentelemetry-instrument`) is the export path. It handles SigV4 and the AWS credential chain, and mirrors the documented AgentCore off-runtime path.
3. **Strands built-in telemetry** provides agent/cycle/model/tool spans. We do not hand-instrument those; we add a turn root span, guardrail events and configuration.
4. **One trace per turn**, with `session.id` as the correlation attribute. A session-wide trace would be long-lived and harder to query.
5. **Full content, local only**. Full content is required for review, but the code refuses it outside local.
6. **Existing checks only** for guardrails. No new policy engine or Bedrock Guardrails in this feature.
7. **Span-derived metrics** for counts; latency alarms use CloudWatch Application Signals where available, with an average-duration metric-filter fallback.
8. **90-day full spans / 30-day trace summaries** is accepted and documented.
9. **AgentCore-compatible routing** now, so the migration to AgentCore Runtime does not require a telemetry rewrite.
10. **No unresolved clarifications.**

## Phase 1: Design

### 1. Trace model

The full span/attribute/event contract is in [contracts/trace-schema.md](./contracts/trace-schema.md). The entity model is in [data-model.md](./data-model.md).

```text
wealth_agent.turn                         one per ask() call (trace root unless auto-instrumentation adds a parent)
│  session.id, prompt.version, compliance_*
├── invoke_agent <agent name>             Strands (session.id, prompt.version via trace_attributes)
│   └── execute_event_loop_cycle          Strands
│       ├── chat                          Strands model call
│       └── execute_tool <tool name>      Strands tool call
│           └── event guardrail.check     GR-TOOL-INPUT
└── event guardrail.check                 GR-OUTPUT-DISCLAIMER
```

- Root span name: `wealth_agent.turn`.
- Root span attributes: `session.id`, `prompt.version`, `compliance_status`, `compliance_failed_rules`, `compliance_check_count`.
- Tool spans: add `tool_ok`, `guardrail_rule_id=GR-TOOL-INPUT`, `guardrail_result`, `guardrail_reason`, `guardrail_action`. `_safe()` runs inside Strands' `use_span` for the tool call, so `trace.get_current_span()` is the `execute_tool` span; the stub-model integration test (below) proves this rather than assuming it.
- Strands applies `Agent(trace_attributes=...)` to its agent and tool spans, so `prompt.version` and `session.id` are set there as well as on the root span. `session.id` is also what the GenAI sessions view groups on.
- Disclaimer: add a `guardrail.check` event on the root span with `GR-OUTPUT-DISCLAIMER`.
- A failed guardrail is a policy outcome, not an infrastructure failure. The span status stays `OK`; only unexpected exceptions set `ERROR`.

### 2. Components and initialization

**`telemetry.py`**
- `configure_tracing(mode: str | None = None, provider: TracerProvider | None = None) -> None`
  - Modes: `off` (default everywhere, including both entrypoints), `console`, `adot`. An unknown value is treated as `off` with a logged warning.
  - Must run **before** `build_agent()`: it sets `OTEL_SEMCONV_STABILITY_OPT_IN` (merge `gen_ai_latest_experimental`; add `gen_ai_unredacted_attributes=` for metadata-only), and Strands reads that once, when the first agent is built. If a Strands `Tracer` already exists, raise `TracingConfigError` rather than silently using stale settings.
  - `console`: create a `StrandsTelemetry` provider and register a console exporter. Repeated calls are no-ops.
  - `adot`: do not create a provider; rely on `opentelemetry-instrument` and the AWS configurator. Log once that ADOT owns the provider.
  - `off`: do nothing.
  - `provider`: test hook only. OpenTelemetry will not replace an already-set global provider, so the hook registers the provider once per process; tests reuse one provider and clear its exporter between tests.
  - Only `TracingConfigError` propagates. Any other setup error is logged as a warning and the agent runs with tracing off.
- `new_local_session_id() -> str` returns `local-<uuid4>` (used by the CLI; separate function so it can be tested).
- Resource attributes: `service.name=convai-wealth-agent`, `service.version` from package metadata (fallback `0.1.0`), `deployment.environment`.
- Effective environment (single source of truth): `deployment.environment` from `OTEL_RESOURCE_ATTRIBUTES` if present, else `DEPLOYMENT_ENVIRONMENT`. If both are set and differ, raise `TracingConfigError`. If neither is set: `local` in `console` mode, but `TracingConfigError` in `adot` mode (fail closed).
- Content policy:
  - environment `local` and `TRACING_CAPTURE_CONTENT` unset or true → full content.
  - any other environment with `TRACING_CAPTURE_CONTENT=true` → `TracingConfigError` at startup.
  - any other environment otherwise → metadata-only, via Strands' redaction token (see §3).
- The function is called by the entrypoints, never by library functions. `ask()` and `build_agent()` do not configure tracing, so tests and imports have no side effects.

**`guardrails.py`**
- Rule constants: `GR_TOOL_INPUT = "GR-TOOL-INPUT"`, `GR_OUTPUT_DISCLAIMER = "GR-OUTPUT-DISCLAIMER"`.
- `TurnGuardrails` collector: a small list of `GuardrailCheck` records (`rule_id`, `result`, `reason`, `action`).
- `current_guardrails()` / `bind_guardrails()` use `contextvars.ContextVar` so concurrent sessions cannot mix results.
- `record_check(...)` appends to the current collector and, if a span is recording, adds a `guardrail.check` event and the flat attributes.
- `summarize(checks)` returns `compliance_status`, `compliance_failed_rules`, `compliance_check_count`.
- No new policy evaluation. Only the two existing checks call this module.

**`agent.py`**
- `ask(agent, text, session_id=None)` creates the root span with `trace.get_tracer(__name__).start_as_current_span("wealth_agent.turn")`.
- Bind a fresh `TurnGuardrails` collector for the turn; reset it in `finally`.
- Set `session.id` (generated by the caller or `None`) and `prompt.version`.
- Call the agent inside the root span; apply the existing disclaimer logic.
- Record `GR-OUTPUT-DISCLAIMER`:
  - `pass` when the raw answer already ends with the disclaimer (same test the existing code uses).
  - `fail` when the code had to append it; `guardrail_action=append_disclaimer`.
- Set the compliance summary attributes on the root span before it ends.
- Keep the return value byte-identical to today.

**`tools.py`**
- In the `_safe` wrapper, after the handler returns, call `record_check(GR_TOOL_INPUT, result, reason, action)` on the current span.
- `ok=true` → `pass`, reason `"arguments accepted"`.
- `ok=false` → `fail`, reason from `error`, action `"return_error"`.
- The wrapper still never raises. Tracing code is wrapped so a tracing failure cannot change the tool result.

**Entrypoints**
- `__main__.py`: `configure_tracing(os.getenv("TRACING_MODE"))` (unset means `off`); call it before `build_agent()`; use `new_local_session_id()` as the session id and pass it to `ask()`.
- `agent/agent.py`: `configure_tracing(os.getenv("TRACING_MODE"))` before the first `build_agent()`; pass the request `session_id` (existing value, including the existing `"default"` fallback) to `ask()`.
- Default is `off` so the REPL output, evals and the agent server behave exactly as before unless tracing is explicitly enabled (US3 scenario 1).

### 3. Content-capture policy

Full content is required for the POC review, and it is Strands' default, so local mode needs no extra work. Content names differ by semantic-convention mode; this feature uses the latest convention (`gen_ai_latest_experimental`), where content is `gen_ai.system_instructions`, `gen_ai.input.messages`, `gen_ai.output.messages`, and on tool spans `gen_ai.tool.call.arguments` / `gen_ai.tool.call.result`.

- Local, content on: nothing to do beyond setting the convention.
- Non-local, content on: `configure_tracing` raises `TracingConfigError` (names the environment and the setting).
- Non-local, content off (metadata-only): `configure_tracing` adds the token `gen_ai_unredacted_attributes=` to `OTEL_SEMCONV_STABILITY_OPT_IN`. Strands then replaces every sensitive value above with its redaction marker before the span is created, so nothing sensitive reaches any exporter, including ADOT's.
- Guardrail reasons are short strings. Tool-failure reasons are the existing validation messages, which can echo argument *names* (`unknown argument(s): ...`) but never argument values.
- A per-attribute size cap is **not** built (see Risks). Strands does not cap content, and in AWS mode ADOT owns the provider and exporter, so a wrapper cannot be inserted from application code.
- Hosted/prod redaction beyond this switch (PII policy, classifier) remains future work.

### 4. Export modes and AWS compatibility

| `TRACING_MODE` | Provider | Exporter | Use |
|---|---|---|---|
| `off` | none | none | tests, evals, CI |
| `console` | `StrandsTelemetry` | console | local development |
| `adot` | supplied by `opentelemetry-instrument` | ADOT/OTLP → CloudWatch | AWS / AgentCore path |

AWS run shape (documented in `quickstart.md`):

```bash
export TRACING_MODE=adot
export AGENT_OBSERVABILITY_ENABLED=true
export OTEL_PYTHON_DISTRO=aws_distro
export OTEL_PYTHON_CONFIGURATOR=aws_configurator
export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
export OTEL_TRACES_EXPORTER=otlp
export OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental
export OTEL_SERVICE_NAME=convai-wealth-agent
export OTEL_RESOURCE_ATTRIBUTES="service.name=convai-wealth-agent,deployment.environment=local,aws.log.group.names=/aws/bedrock-agentcore/runtimes/convai-wealth-agent"
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT="https://xray.<region>.amazonaws.com/v1/traces"
export OTEL_EXPORTER_OTLP_LOGS_HEADERS="x-aws-log-group=/aws/bedrock-agentcore/runtimes/convai-wealth-agent,x-aws-log-stream=runtime-logs,x-aws-metric-namespace=bedrock-agentcore"
PYTHONPATH=src opentelemetry-instrument python -m wealth_agent
```

- Transaction Search is an account-level prerequisite and must be enabled before the first trace arrives.
- SigV4 is the recommended auth; the ADOT configurator uses the boto3 credential chain. Bearer keys are not used.
- The GenAI dashboard routing uses the documented `aws.log.group.names` resource attribute and log-group headers.
- ADOT is expected to supply X-Ray-compatible trace IDs. This is a named validation item because default OTel random IDs are silently dropped by X-Ray.
- `opentelemetry-instrument` auto-instruments HTTP libraries, so the AgentCore server span and `httpx` calls to Ollama may appear around the turn span. This is expected and is checked in the first AWS run.
- `OTEL_SEMCONV_STABILITY_OPT_IN` and `deployment.environment` are read at process start by ADOT, before `configure_tracing` runs. `configure_tracing` therefore validates them (and refuses on a mismatch) instead of trying to change them in `adot` mode.
- If ADOT and Strands both configure a provider, the ADOT path wins and `StrandsTelemetry` is skipped. Validate with one traced run.

### 5. Dashboard and alarms

Artifacts under `specs/010-agent-tracing/ops/` are applied manually:

- `iam-policy.json`: `xray:PutTraceSegments`, `xray:PutTelemetryRecords`, `xray:GetSamplingRules`, `xray:GetSamplingTargets`, plus the CloudWatch Logs actions needed for the GenAI log group.
- `dashboard.json`: invocations, agent errors, tool errors, p50/p95 latency, token usage (when the model reports it), guardrail pass/fail.
- `metric-filters.md`: metric filter patterns and the CloudWatch Logs Insights queries used to derive them.
- `alarms.json`: four alarm definitions:
  1. Agent error rate > 5% over 5 minutes.
  2. Any guardrail failure.
  3. Tool error rate > 10%.
  4. p95 latency > 8 seconds (below the backend's 10-second timeout).
- Notifications are console-only for this version. `spec.md` and the runbook record the future SNS topic.
- Latency caveat: CloudWatch Logs metric filters cannot compute p95 natively. Use CloudWatch Application Signals if enabled; otherwise use an average-duration metric filter and mark the alarm as a POC approximation.

### 6. Error handling and resilience

- `configure_tracing` catches exporter/provider setup errors, logs a warning and leaves the agent running.
- `record_check` and the root-span code are wrapped so tracing failures never change a tool result or a reply.
- Exporters use batching; the request path never waits for CloudWatch.
- If the provider is a no-op (tracing off), `trace.get_current_span()` is non-recording and the helpers do nothing.

### 7. Testing strategy

| Test | What it proves |
|---|---|
| `test_telemetry.py::test_off_mode_is_noop` | Default imports/tests emit no spans and make no network calls. |
| `test_telemetry.py::test_unknown_mode_is_off` | Unknown `TRACING_MODE` warns and behaves as off. |
| `test_telemetry.py::test_console_mode_configures_provider` | Local mode registers a provider and console exporter. |
| `test_telemetry.py::test_non_local_full_content_refused` | Startup error outside local. |
| `test_telemetry.py::test_adot_requires_explicit_environment` | `adot` with no environment set is refused (fail closed). |
| `test_telemetry.py::test_environment_mismatch_refused` | `OTEL_RESOURCE_ATTRIBUTES` and `DEPLOYMENT_ENVIRONMENT` disagree → refused. |
| `test_telemetry.py::test_metadata_only_redacts_content` | With a fresh Strands `Tracer`, a stub-model turn exports no prompt, message or tool content (checks attributes **and** events). |
| `test_telemetry.py::test_setup_error_does_not_break_ask` | Non-config setup errors are logged, not raised. |
| `test_telemetry.py::test_exporter_failure_does_not_break_ask` | A failing exporter does not change the reply. |
| `test_guardrails.py::test_collector_summary` | Pass/fail roll-up, failed rule ids and count. |
| `test_guardrails.py::test_concurrent_collectors_are_isolated` | Context-variable isolation. |
| `test_agent.py::test_ask_creates_turn_span` | Root span name, session id, prompt version. |
| `test_agent.py::test_disclaimer_pass_when_model_complies` | `GR-OUTPUT-DISCLAIMER` pass. |
| `test_agent.py::test_disclaimer_fail_when_code_appends` | `GR-OUTPUT-DISCLAIMER` fail + action. |
| `test_agent.py::test_stub_model_turn_produces_full_span_tree` | A real Strands `Agent` with a scripted stub `Model` (one tool call, then an answer; no Ollama) produces `wealth_agent.turn` → `invoke_agent` → cycle → `chat` + `execute_tool`, and the `GR-TOOL-INPUT` event lands on the `execute_tool` span and in the turn's collector (proves the context-propagation assumption that a `FakeAgent` cannot). |
| `test_tools.py::test_tool_guardrail_pass_and_fail` | `GR-TOOL-INPUT` event and attributes; handlers called outside any turn are unaffected. |
| Existing suites | No behavior change; backend/frontend untouched. |

**Test isolation**: `tests/conftest.py` installs one `TracerProvider` with an `InMemorySpanExporter` for the whole session (OpenTelemetry cannot replace a global provider), clears the exporter before each test, and resets Strands' singleton `Tracer` plus the relevant environment variables for tests that need a different content mode.

### 8. Rollout and verification

1. Implement `telemetry.py` and `guardrails.py` with tests; no exporter configured by default.
2. Wire the root span and guardrail events; run the existing agent suite.
3. Add `console` mode and verify one manual turn prints a complete trace.
4. Add `adot` mode and the runbook artifacts; unit-test the configuration decisions.
5. When AWS access exists, execute the `quickstart.md` AWS checklist: Transaction Search, retention, IAM, first trace, GenAI view, dashboard, alarms.
6. Update `README.md` with local tracing instructions and the future-layer note.

### 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| ADOT and Strands double-configure telemetry | `adot` mode skips `StrandsTelemetry`; one-run validation item. |
| X-Ray drops non-X-Ray trace IDs | Use ADOT's configurator/provider; verify trace id format in the first AWS run. |
| GenAI dashboard routing is unverified without AWS | Keep routing env vars in the runbook; acceptance checklist item. |
| 200 KB span limit | **Known gap, no cap built.** Strands has no cap hook and ADOT owns the AWS provider. Local prompts and synthetic portfolio data are a few KB. The first AWS run records real span sizes; if needed, add a collector with a truncation processor (future work). |
| Content attribute names change with the semantic-convention opt-in | Fix the convention to `gen_ai_latest_experimental`; the redaction test runs against the real Strands tracer rather than a hand-maintained key list. |
| Strands upgrade renames content attributes or the redaction token | `strands-agents` is pinned; the redaction test fails on upgrade if content leaks. |
| Disclaimer "failures" are frequent with a small local model | Documented in spec Assumptions; thresholds reviewed after the first AWS run. |
| ADOT pins `opentelemetry-sdk==1.45.1` exactly | Pin `aws-opentelemetry-distro==0.22.0`; T003 verifies a clean install and regenerates the lock file. |
| 100% sampling cost | POC volume; document review before hosted use. |
| p95 alarm from span logs | Application Signals preferred; average-duration filter fallback documented. |
| `aws/spans` retention is manual | Runbook step with console/CLI instructions. |
| No AWS access in this feature | AWS path is "implemented and documented, not end-to-end verified"; local tests cover the code. |

### 10. Dependency justification (Constitution V)

`aws-opentelemetry-distro` is required because the mandated AWS OTLP endpoint uses SigV4, and the ADOT configurator is the documented way to sign exports from a Python agent. A local collector would add a second process and container; raw OTel exporters would require custom SigV4 signing and X-Ray ID handling. The single dependency is the smallest design that meets the constraint.

## Complexity Tracking

No constitution violations. No entries required.

## Future Work

The deferred layers are recorded in `spec.md` and will be repeated in `README.md`:

- Backend request/HTTP spans and W3C propagation.
- Browser spans and trace headers on `/api/chat`.
- Evals/CI trace export and version comparison.
- `feedback.trace_id` population (agent → backend → feedback contract change).
- `user.id` in traces.
- Real guardrail policy evaluation (Bedrock Guardrails or a rules engine).
- Prompt registry or content hash.
- SNS/email/Slack alarm notifications.
- 90-day searchable trace summaries (only 90-day span storage is in scope).
- Hosted/production content redaction.
