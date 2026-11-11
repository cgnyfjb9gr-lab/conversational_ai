---

description: "Task list for agent execution tracing"
---

# Tasks: Agent Execution Tracing

**Input**: Design documents from `specs/010-agent-tracing/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/trace-schema.md](./contracts/trace-schema.md), [quickstart.md](./quickstart.md)

**Tests**: Included. The project constitution (Principle IV) and FR-013 require automated tests for each behavior, and the tracing tests must run without AWS, network, Ollama or a database.

**Organization**: Tasks are grouped by user story so each story can be implemented and validated independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US5)
- Every task includes an exact file path

## Path Conventions

- Agent package: `agent/src/wealth_agent/`
- Agent tests: `agent/tests/`
- Agent entrypoints: `agent/agent.py`, `agent/src/wealth_agent/__main__.py`
- Feature docs/ops: `specs/010-agent-tracing/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the dependencies and configuration surface required by every story.

- [X] T001 Change `strands-agents[ollama]` to `strands-agents[ollama,otel]==1.63.0` and add `aws-opentelemetry-distro==0.22.0` in `agent/requirements.txt`; mirror both in `agent/pyproject.toml`; regenerate `agent/uv.lock` (currently untracked)
- [X] T002 Add the tracing variables from contracts/trace-schema.md §6 to `.env.example` (and a new `agent/.env.example` if the agent keeps its own config surface): `TRACING_MODE`, `TRACING_CAPTURE_CONTENT`, `DEPLOYMENT_ENVIRONMENT`, `OTEL_SERVICE_NAME`, `OTEL_TRACES_SAMPLER`, `AWS_REGION`, `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`; include no secrets
- [X] T003 [P] Verify the dependency set resolves together in a clean `agent/.venv` (expect `opentelemetry-sdk`/`-api` to move to 1.45.1 because `aws-opentelemetry-distro` pins them exactly) and that the existing suite still passes; record any pin adjustments in `agent/requirements.txt`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The telemetry and guardrail primitives every story depends on. No story work begins until this phase is complete.

**⚠️ CRITICAL**: Complete this phase before starting any user story.

- [X] T004 Create `agent/src/wealth_agent/telemetry.py` in three steps (a: `TracingConfigError`, `new_local_session_id()`, resource attributes; b: `configure_tracing(mode=None, provider=None)` with the `off`/`console`/`adot` modes and the "before first Agent/Tracer" check; c: environment resolution and content policy). Combined scope: with `TracingConfigError`, `configure_tracing(mode=None, provider=None)`, `new_local_session_id()`, resource attributes (`service.name=convai-wealth-agent`, `service.version`, `deployment.environment`), the `off`/`console`/`adot` modes (unknown → `off` + warning), the single-source environment resolution (fail closed in `adot`), the content-capture policy via `OTEL_SEMCONV_STABILITY_OPT_IN` (`gen_ai_latest_experimental`; add `gen_ai_unredacted_attributes=` for metadata-only), and the "must run before the first Agent/Tracer exists" check. Only `TracingConfigError` propagates; other setup errors are logged. No custom sanitizer and no truncation (FR-007, FR-008, FR-012; contracts §5–6)
- [X] T005 [P] Create `agent/tests/test_telemetry.py` with failing tests for: off mode is a no-op; unknown mode is off; console mode configures a provider; non-local + full content raises `TracingConfigError`; `adot` with no environment raises; environment mismatch raises; non-config setup errors do not raise to the caller (FR-007, FR-012, FR-013)
- [X] T006 Create `agent/src/wealth_agent/guardrails.py` with `GR_TOOL_INPUT`, `GR_OUTPUT_DISCLAIMER`, `GuardrailCheck`, `TurnGuardrails`, `bind_guardrails()`, `current_guardrails()`, `record_check()` and `summarize()`; use `contextvars.ContextVar` for per-turn isolation (FR-004–006; contracts §3–4)
- [X] T007 [P] Create `agent/tests/test_guardrails.py` with failing tests for pass/fail roll-up, empty-check turns (`pass`, `0`, `""`), sorted failed rule ids, and concurrent collectors staying isolated (FR-006)
- [X] T008 First add the `session_id=None` parameter to `ask()` in `agent/src/wealth_agent/agent.py` (signature only; the turn span itself is T014), then wire `configure_tracing(os.getenv("TRACING_MODE"))` into `agent/src/wealth_agent/__main__.py` and `agent/agent.py` **before** `build_agent()`; default is `off`, so the REPL, evals and the agent server are unchanged unless tracing is enabled; pass the request `session_id` through to `ask()`; use `new_local_session_id()` in the CLI (FR-001, FR-008)
- [X] T009 Create `agent/tests/conftest.py` (no conftest exists yet) with a session-scoped `TracerProvider` + `InMemorySpanExporter` (OpenTelemetry cannot replace a global provider, so do not try to reset it), a per-test fixture that clears the exporter, a fixture that resets Strands' singleton `Tracer` and the tracing env vars for tests that need a different content mode, and `TRACING_MODE` unset for tests that do not opt in (FR-013)
- [X] T010a Enforce 100% sampling (FR-010): in `console` mode create the provider with an always-on sampler (honouring `OTEL_TRACES_SAMPLER` if set to `parentbased_always_on`), add a test in `agent/tests/test_telemetry.py` that every turn is recorded, and include `OTEL_TRACES_SAMPLER=parentbased_always_on` in the AWS runbook check (FR-010)
- [X] T010 Add a resilience helper in `agent/src/wealth_agent/telemetry.py` (or guardrails.py) so `record_check()` and span setup are no-ops when no provider is recording and never raise into tool or agent code (FR-012)

**Checkpoint**: Telemetry modes, content policy, guardrail primitives and test infrastructure are ready.

---

## Phase 3: User Story 1 - Inspect a complete agent turn (Priority: P1) 🎯 MVP

**Goal**: One trace per user turn with the root turn span, Strands agent/cycle/model/tool spans, full content, prompt version and session correlation.

**Independent Test**: Run one local turn that calls a tool and confirm exactly one `wealth_agent.turn` trace exists with child `invoke_agent`, `execute_event_loop_cycle`, `chat` and `execute_tool` spans, plus `session.id`, `prompt.version`, the full system prompt, user message, final answer and tool arguments/results.

### Tests for User Story 1 (write first; expect failure)

- [X] T011 [US1] Add `test_ask_creates_one_turn_span` to `agent/tests/test_agent.py`: a `FakeAgent` turn produces exactly one non-recording-safe root span named `wealth_agent.turn`, with no parent, carrying `session.id` and `prompt.version`
- [X] T012 [US1] Add `test_two_turns_same_session_share_session_id` to `agent/tests/test_agent.py`: two `ask()` calls with the same `session_id` produce two traces whose root spans carry the same `session.id`
- [X] T013 [P] [US1] Add `test_new_local_session_id_format` to `agent/tests/test_telemetry.py` covering `new_local_session_id()` (`local-<uuid4>`, unique per call), and a check that `__main__.py` passes it to `ask()`

### Implementation for User Story 1

- [X] T014 [US1] Implement `ask(agent, text, session_id=None)` in `agent/src/wealth_agent/agent.py`: start the `wealth_agent.turn` root span, set `session.id` and `prompt.version`, call the agent inside the span, and return the existing answer unchanged (FR-001–003)
- [X] T015 [US1] Pass `trace_attributes={"prompt.version": PROMPT_VERSION}` to `Agent(...)` in `build_agent()` (supported in strands 1.63.0; it lands on the agent and tool spans), and in `ask()` also set `session.id` on `agent.trace_attributes` when that dict exists (the `FakeAgent` in tests has none)
- [X] T016 [US1] Ensure the full system prompt is present on the trace: with `gen_ai_latest_experimental`, Strands records it as `gen_ai.system_instructions` on the `invoke_agent` span; confirm in a console run and assert it in the stub-model test (there is no `system_prompt` attribute) (FR-003)
- [X] T017 [US1] Pass `session_id` from `agent/agent.py` and `agent/src/wealth_agent/__main__.py` into `ask()`; keep the CLI and AgentCore response shapes unchanged (FR-001, FR-017)
- [X] T018 [US1] (shares `test_agent.py` with T011/T012: do these sequentially) Add `test_stub_model_turn_produces_full_span_tree` to `agent/tests/test_agent.py`: a real Strands `Agent` with a scripted stub `Model` (one `project_savings` tool call, then a text answer; no Ollama) and the in-memory exporter; assert `wealth_agent.turn` → `invoke_agent` → `execute_event_loop_cycle` → `chat` / `execute_tool`, the system prompt, user message, final answer, tool arguments and result are present, and the returned answer is unchanged (FR-002–003, FR-012)
- [X] T019 [US1] Manually run `TRACING_MODE=console` per quickstart Part 1.2 and confirm the Strands child span hierarchy; record the observed span names in the PR description

**Checkpoint**: User Story 1 is independently functional and demonstrable with the console exporter.

---

## Phase 4: User Story 2 - Review guardrail and compliance outcomes (Priority: P1)

**Goal**: Every existing check records rule id, pass/fail, reason and action; the root span carries the compliance summary.

**Independent Test**: Run a turn with an invalid tool request and a turn where the model omits the disclaimer. Confirm `GR-TOOL-INPUT` and `GR-OUTPUT-DISCLAIMER` outcomes and the root compliance summary.

### Tests for User Story 2 (write first; expect failure)

- [X] T020 [P] [US2] Add `test_tool_guardrail_pass` and `test_tool_guardrail_fail` to `agent/tests/test_tools.py`: valid args produce `GR-TOOL-INPUT` pass/allow; invalid args produce fail/return_error with the existing error reason
- [X] T021 [P] [US2] Add `test_disclaimer_pass_when_model_complies` to `agent/tests/test_agent.py`: raw answer already ending with the disclaimer produces `GR-OUTPUT-DISCLAIMER` pass/allow
- [X] T022 [P] [US2] Add `test_disclaimer_fail_when_code_appends` to `agent/tests/test_agent.py`: raw answer without the disclaimer produces fail/append_disclaimer, and the final answer still contains the disclaimer exactly once
- [X] T023 [P] [US2] Add `test_compliance_summary_matches_checks` to `agent/tests/test_agent.py`: `compliance_check_count`, `compliance_failed_rules` and `compliance_status` match the recorded checks
- [X] T024 [P] [US2] Add `test_concurrent_turns_do_not_mix_guardrails` to `agent/tests/test_agent.py`: two interleaved `ask()` calls keep their own failed-rule lists
- [X] T024a [P] [US2] In the stub-model test from T018, add an invalid tool call (for example `years=0`) and assert the `GR-TOOL-INPUT` fail event is on the `execute_tool` span and in the turn's collector, and the compliance summary on the root span lists it. This proves `_safe()` sees the tool span and the per-turn collector across Strands' tool thread, which a `FakeAgent` cannot

### Implementation for User Story 2

- [X] T025 [US2] Call `record_check(GR_TOOL_INPUT, ...)` from the `_safe()` wrapper in `agent/src/wealth_agent/tools.py`; map `ok=true` to pass/allow and `ok=false` to fail/return_error with the existing error text; wrap the tracing call so it cannot raise (FR-004)
- [X] T026 [US2] Implement the disclaimer check in `agent/src/wealth_agent/agent.py`: pass when the raw answer already ends with the disclaimer; fail with `append_disclaimer` when the code appends it; emit the `guardrail.check` event on the root span (FR-005)
- [X] T027 [US2] Compute and set `compliance_status`, `compliance_failed_rules` and `compliance_check_count` on the root span before it ends, using the turn's own collector (FR-006; data-model ComplianceSummary)
- [X] T028 [US2] Add the `guardrail.check` event attributes (`guardrail_rule_id`, `guardrail_result`, `guardrail_reason`, `guardrail_action`) to both checks, matching contracts/trace-schema.md §3
- [X] T029 [US2] Manually run the tool-failure and disclaimer-correction scenarios in quickstart Part 1.3 and record the observed events in the PR description

**Checkpoint**: User Stories 1 and 2 are independently functional; compliance review is possible.

---

## Phase 5: User Story 3 - Trace safely in development and test (Priority: P2)

**Goal**: Tracing never changes the reply, never requires external services in tests, and refuses unsafe content capture outside local.

**Independent Test**: Run all existing suites with tracing off and with an in-memory provider; simulate a failing exporter; confirm replies and tests are unchanged and no network calls occur.

### Tests for User Story 3

- [X] T030 [P] [US3] Add `test_off_mode_produces_no_spans` and `test_off_mode_prints_nothing` to `agent/tests/test_telemetry.py`
- [X] T031 [P] [US3] Add `test_failing_exporter_does_not_change_reply` to `agent/tests/test_agent.py` using a monkeypatched failing exporter
- [X] T032 [P] [US3] Add `test_non_local_full_content_is_refused` and `test_metadata_only_redacts_content` to `agent/tests/test_telemetry.py`; run the stub-model turn from T018 with a fresh Strands `Tracer` in metadata-only mode and assert no prompt, user text, answer, tool argument or tool result string appears in any span attribute **or event**
- [X] T033 [P] [US3] Add `test_tests_do_not_configure_otlp` to `agent/tests/test_telemetry.py` asserting that importing the package and calling `ask()` with the default test fixture creates no OTLP exporter
- [X] T034 [P] [US3] Add `test_tracing_config_error_names_the_setting` to `agent/tests/test_telemetry.py` for the startup refusal message

### Implementation for User Story 3

- [X] T035 [US3] Audit `agent/src/wealth_agent/telemetry.py` and `agent/src/wealth_agent/agent.py` so tracing setup only happens in entrypoints and every runtime tracing call is exception-safe, while `TracingConfigError` still propagates at startup (FR-007, FR-012)
- [X] T036 [US3] Ensure the fixtures in `agent/tests/conftest.py` clear spans, the Strands `Tracer` singleton and tracing env vars between tests so nothing leaks (FR-013)
- [X] T037 [US3] Run `pytest` from `agent/` with no AWS, network, Ollama or database; fix regressions (the backend/frontend check is in T057)
- [X] T038 [US3] Run `ruff` from `agent/` and fix lint/format issues in the new and changed files

**Checkpoint**: Tracing is safe by default and the full suite remains offline.

---

## Phase 6: User Story 4 - Send traces to the AWS observability service (Priority: P2)

**Goal**: The ADOT export path, manual AWS runbook, dashboard, metric filters and alarms are ready to apply when credentials exist.

**Independent Test**: Follow quickstart Part 2 in an AWS account: enable Transaction Search, set 90-day retention, apply IAM, run with `TRACING_MODE=adot`, and confirm the trace, GenAI view, dashboard and four alarms.

### Tests for User Story 4

- [X] T039 [P] [US4] Add `test_adot_mode_does_not_create_a_local_provider` to `agent/tests/test_telemetry.py`: `adot` mode logs once and leaves the provider to `opentelemetry-instrument`
- [X] T040a [P] [US4] Add `test_adot_requires_latest_semconv` to `agent/tests/test_telemetry.py`: `adot` mode without `gen_ai_latest_experimental` in `OTEL_SEMCONV_STABILITY_OPT_IN` raises `TracingConfigError` (content names depend on it)
- [X] T040 [P] [US4] Add `test_adot_mode_requires_no_aws_credentials_to_configure` to `agent/tests/test_telemetry.py`: configuration succeeds and no network call is made
- [X] T041 [P] [US4] Review `specs/010-agent-tracing/quickstart.md` against FR-014 and confirm the AWS steps cover Transaction Search, 90-day retention, IAM, verification, dashboard and alarms (a manual review item, not an automated test)

### Implementation for User Story 4

- [X] T042 [US4] Create `specs/010-agent-tracing/ops/iam-policy.json` with `xray:PutTraceSegments`, `xray:PutTelemetryRecords`, `xray:GetSamplingRules`, `xray:GetSamplingTargets` and the CloudWatch Logs actions for the GenAI log group; add a least-privilege note
- [X] T043 [US4] Create `specs/010-agent-tracing/ops/metric-filters.md` with the CloudWatch Logs metric filter patterns and Logs Insights queries for agent errors, tool errors, guardrail failures, duration and token usage; document that the exact `aws/spans` paths must be confirmed against a real span
- [X] T044 [US4] Create `specs/010-agent-tracing/ops/dashboard.json` with widgets for invocations, agent error rate, tool error rate, p50/p95 latency, token usage and guardrail pass/fail
- [X] T045 [US4] Create `specs/010-agent-tracing/ops/alarms.json` with the four alarms: agent error rate > 5% (5 min), any guardrail failure (5 min), tool error rate > 10% (5 min), p95 latency > 8 s (5 min)
- [X] T046 [US4] Document the p95 limitation and the Application Signals/average-duration fallback in `specs/010-agent-tracing/ops/metric-filters.md` and `quickstart.md`
- [X] T047 [US4] Finalize the AWS runbook in `specs/010-agent-tracing/quickstart.md`: Transaction Search, `aws/spans` 90-day retention, IAM, env vars, `opentelemetry-instrument`, verification, dashboard, alarms, and the console-only/SNS-future note
- [X] T048 [US4] Add a short "AWS tracing setup" pointer and the deferred AWS verification note to `README.md`
- [X] T049 [US4] Record the first-AWS-run checklist in `specs/010-agent-tracing/quickstart.md`; leave the AWS-only items unchecked until credentials are available

**Checkpoint**: The AWS path is implemented and documented; only the credentialed verification remains.

---

## Phase 7: User Story 5 - Know what is not traced yet (Priority: P3)

**Goal**: The repository and feature docs clearly list the untraced layers and their dependencies.

**Independent Test**: Read `README.md` and `specs/010-agent-tracing/spec.md` and confirm every deferred layer is listed with a reason.

### Implementation for User Story 5

- [X] T050 [US5] Add a "Tracing coverage and future layers" section to `README.md` listing backend request/HTTP spans, browser spans, evals/CI, `feedback.trace_id`, `user.id`, real guardrail evaluation, prompt registry/content hash, SNS notifications, 90-day searchable summaries and hosted redaction
- [X] T050a [US5] Record the known gaps in the README tracing section and runbook: no span size cap (200 KB CloudWatch limit), disclaimer failures expected to be frequent with a small local model, and that AWS verification is pending
- [X] T051 [US5] Add a README note that `feedback.trace_id` remains `null` in this version and why (no agent→backend contract change yet)
- [X] T052 [US5] Add a module docstring in `agent/src/wealth_agent/telemetry.py` pointing to contracts/trace-schema.md and the future-layer list

**Checkpoint**: The scope boundary is discoverable without reading the full spec.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, validation and delivery hygiene.

- [X] T053 [P] Update the `agent/` section of `README.md` with local tracing commands (Bash and PowerShell), env vars, console output expectations and the AWS runbook link
- [X] T054 [P] Update `.env.example` / `agent/.env.example` with the final variable names and a comment that full content is local-only
- [ ] T055 (partly done: ran with a scripted model because Ollama is not running here; still needs one real-Ollama turn and the timing) Run the full local quickstart from `specs/010-agent-tracing/quickstart.md` Part 1 using only the repository docs, time it (SC-005: under 10 minutes), and record the result in the PR description
- [X] T056 Verify the constitution gates after implementation: no contract change, graceful degradation, no Alembic change, offline tests, dependency justification
- [ ] T057 (agent suite and ruff pass; backend suite not run here: no Python 3.12 backend environment; backend and frontend files are unchanged) Run the agent and backend test suites one final time and confirm the frontend suite is untouched and still passing
- [ ] T058 Open a PR from the working branch (currently `kejiya/traces`; the spec names `010-agent-tracing`, so align the two) (never push to `main`), summarize the trace schema, local verification and the deferred AWS verification, and link `specs/010-agent-tracing/`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; start immediately.
- **Foundational (Phase 2)**: Depends on Setup; blocks all user stories.
- **User Stories (Phases 3–7)**: Depend on Foundational. US1 and US2 are both P1 and are the MVP; US2 consumes the collector from Phase 2 but does not block US1.
- **Polish (Phase 8)**: Depends on the desired user stories being complete.

### User Story Dependencies

- **US1 (P1)**: Starts after Foundational. No dependency on other stories. Delivers the complete turn trace.
- **US2 (P1)**: Starts after Foundational. Depends on the guardrail collector (T006) but can run in parallel with US1 once the root span exists; the disclaimer check needs the root span from US1.
- **US3 (P2)**: Starts after Foundational; benefits from US1/US2 to test the actual spans.
- **US4 (P2)**: Starts after Foundational; independent of US1/US2 for config tests, but the runbook is only meaningful once content and guardrail spans exist.
- **US5 (P3)**: Starts after the scope is implemented; mostly documentation.

### Within Each User Story

- Write the listed tests first and confirm they fail.
- Implement the core behavior, then the integration, then the manual validation.
- Keep `agent/agent.py` and `agent/src/wealth_agent/__main__.py` changes small and backward compatible.

### Parallel Opportunities

- T005, T007, T009 and T010 can run in parallel after T004/T006.
- T011, T012 and T013 can run in parallel (same file: coordinate edits or use separate test functions).
- T020–T024 can run in parallel (different test files/functions).
- T039–T041 can run in parallel.
- T042–T045 (ops artifacts) can run in parallel.
- T050–T052 can run in parallel.
- T053–T054 can run in parallel.

---

## Parallel Example: User Story 1

```bash
# Tests first (same file, coordinate the edits):
Task: "Add test_ask_creates_one_turn_span to agent/tests/test_agent.py"
Task: "Add test_two_turns_same_session_share_session_id to agent/tests/test_agent.py"
Task: "Add test_cli_generates_local_session_id to agent/tests/test_agent.py"

# Then implementation:
Task: "Implement the turn root span in agent/src/wealth_agent/agent.py"
Task: "Pass session_id from agent/agent.py and __main__.py"
```

## Parallel Example: User Story 4

```bash
# Ops artifacts are independent:
Task: "Create specs/010-agent-tracing/ops/iam-policy.json"
Task: "Create specs/010-agent-tracing/ops/metric-filters.md"
Task: "Create specs/010-agent-tracing/ops/dashboard.json"
Task: "Create specs/010-agent-tracing/ops/alarms.json"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

Both P1 stories together deliver the requested value: a complete turn trace with guardrail and compliance outcomes. Implement Phases 1–4 first, then stop and validate locally with the console exporter.

1. Complete Setup and Foundational.
2. Complete US1 (complete turn trace).
3. Complete US2 (guardrail/compliance outcomes).
4. **STOP and VALIDATE** with quickstart Part 1. The trace is demonstrable without AWS.
5. Then add US3 (safety), US4 (AWS export/ops) and US5 (future-layer note).

### Incremental Delivery

1. Setup + Foundational → primitives ready.
2. US1 → one complete trace per turn → demo.
3. US2 → guardrail/compliance review → demo.
4. US3 → safe offline tests and content policy → merge-ready.
5. US4 → AWS runbook, dashboard and alarms → ready for credentials.
6. US5 + Polish → documentation and PR.

### Notes

- `[P]` tasks touch different files or independent test functions; coordinate when editing the same file.
- The AWS-only checklist items stay unchecked until an account with credentials is available; this is expected and recorded in the PR.
- Do not add backend/frontend tracing, `user.id`, `feedback.trace_id`, Bedrock Guardrails, a prompt registry or SNS in this feature.
