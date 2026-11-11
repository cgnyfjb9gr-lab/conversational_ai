# Feature Specification: Agent Execution Tracing

**Feature Branch**: `010-agent-tracing`

**Created**: 2026-11-07

**Status**: Draft

**Input**: User description: "Set up traces for this project, every step: prompts, versions, tool calls, guardrails, compliance outcomes, etc. The project uses AWS infrastructure, so use an AWS service that uses OpenTelemetry. Start with the agent; keep a note that the rest of the layers need tracing later."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Inspect a complete agent turn (Priority: P1)

An engineer or reviewer opens the observability console after a chat turn and sees one complete trace: the turn itself, the agent invocation, each reasoning cycle, each model call, and each tool call. The trace shows the full system prompt and prompt version, the user message, the model's output, and every tool's arguments and result.

**Why this priority**: Without a complete, content-rich trace, neither debugging nor compliance review is possible. This is the core value of the feature.

**Independent Test**: Enable tracing for the local agent, run one question that triggers a tool (for example a savings projection), and confirm the trace contains a turn span with child agent, cycle, model and tool spans, plus the prompt text, prompt version, user message, final answer, and tool input/output.

**Acceptance Scenarios**:

1. **Given** tracing is enabled for a local agent turn, **When** the user asks a question, **Then** exactly one trace is produced for that turn and it contains the turn span, the agent span, at least one model span, and the tool spans used.
2. **Given** the agent answers without calling a tool, **When** the turn completes, **Then** the trace still contains the turn and model spans and records that no tool was called.
3. **Given** a conversation continues in the same session, **When** a second turn runs, **Then** it produces its own trace and carries the same session identifier.
4. **Given** a turn is traced, **When** the trace is inspected, **Then** it contains the full system prompt, the prompt version, the user message, the final answer, and each tool's arguments and result.

---

### User Story 2 - Review guardrail and compliance outcomes (Priority: P1)

A reviewer can see, for every turn, which guardrail checks ran, whether each passed or failed, and why. The turn's top-level summary shows whether the turn was compliant and which rules failed.

**Why this priority**: The review use case is the reason tracing was requested. A trace without explicit guardrail and compliance outcomes cannot support an audit conversation.

**Independent Test**: Run a turn with an invalid tool request and a turn where the model omits the disclaimer. Confirm each turn contains a guardrail outcome for the relevant rule with a pass/fail result, a short reason, and a compliance summary on the turn span.

**Acceptance Scenarios**:

1. **Given** a tool receives invalid arguments, **When** the tool returns an error, **Then** the trace records a failed tool-input guardrail outcome with the rule identifier and the error reason.
2. **Given** a tool receives valid arguments, **When** the tool returns successfully, **Then** the trace records a passed tool-input guardrail outcome.
3. **Given** the model's raw answer already ends with the required disclaimer, **When** the turn completes, **Then** the disclaimer guardrail outcome is recorded as passed.
4. **Given** the model's raw answer omits the disclaimer, **When** the code appends it, **Then** the trace records a failed disclaimer outcome with the corrective action and the final answer still contains the disclaimer.
5. **Given** any turn completes, **When** the turn span is inspected, **Then** it shows an overall compliance status, the number of checks, and the failed rule identifiers (if any).

---

### User Story 3 - Trace safely in development and test (Priority: P2)

A developer can turn tracing on locally without AWS access and see spans in the console. Tests and CI run without AWS, network access, Ollama or a database. Tracing never changes the user-visible answer and never turns an agent failure into a user-facing error.

**Why this priority**: The project must remain demoable and testable on any laptop. Observability must not make the agent fragile.

**Independent Test**: Run the existing test suites with tracing disabled and with an in-memory trace collector. Confirm all tests pass, no network calls are made, and a deliberately failing trace exporter does not change the agent's reply.

**Acceptance Scenarios**:

1. **Given** no tracing configuration, **When** the agent runs, **Then** it behaves exactly as before and the reply is unchanged.
2. **Given** the local console exporter, **When** a turn runs, **Then** spans are printed locally without AWS credentials.
3. **Given** a trace exporter that fails, **When** a turn runs, **Then** the user still receives the normal answer and the failure is logged, not surfaced.
4. **Given** the automated test suite, **When** it runs, **Then** it needs no AWS, network, Ollama or database.

---

### User Story 4 - Send traces to the AWS observability service (Priority: P2)

When AWS access is available, an operator can send agent traces to the organization's AWS observability service over OpenTelemetry, see them in the generative-AI observability view, and use a dashboard and alarms to monitor errors, latency, tool failures and guardrail failures.

**Why this priority**: The POC must prove the production path, but AWS access is not available yet. The feature can be built and locally verified first.

**Independent Test**: Follow the AWS runbook with credentials: enable trace ingestion, set span retention, run the agent, and confirm the trace appears in the console, the dashboard shows the turn, and the alarms exist with the agreed thresholds.

**Acceptance Scenarios**:

1. **Given** AWS credentials and trace ingestion are enabled, **When** a turn runs, **Then** the trace appears in the AWS observability console under the agent's service name.
2. **Given** the observability console, **When** the operator opens the generative-AI view, **Then** the agent, its sessions, and its traces are visible.
3. **Given** the dashboard, **When** a turn runs, **Then** the dashboard shows invocations, errors, latency, tool usage and guardrail outcomes.
4. **Given** an alarm threshold is crossed, **When** the alarm evaluates, **Then** it changes state and is visible in the console; notification delivery is out of scope for this version.
5. **Given** the retention configuration, **When** an operator inspects it, **Then** full spans are retained for 90 days and the 30-day trace-summary limit is documented.

---

### User Story 5 - Know what is not traced yet (Priority: P3)

A maintainer can find an explicit, current list of the layers that are not traced yet, so the next feature can extend tracing without re-discovering the gaps.

**Why this priority**: The request explicitly asked to keep a note about the remaining layers. Without it, the scope boundary is easy to forget.

**Independent Test**: Read the feature spec and the repository README and confirm both list the deferred layers and the reason each is deferred.

**Acceptance Scenarios**:

1. **Given** the feature documentation, **When** a maintainer looks for tracing coverage, **Then** every layer in the Out of Scope list below (backend, browser, evals, feedback trace correlation, user identity, real guardrail policy evaluation, prompt registry or content hash, notification delivery, long-term trace search, hosted/production content redaction) is listed as not traced yet.
2. **Given** the deferred list, **When** a maintainer plans the next tracing feature, **Then** each deferred layer has a short reason and dependency noted.

---

### Edge Cases

- **No tracer configured**: the agent must run normally and produce no spans.
- **Exporter unavailable or credentials missing**: the agent must still answer; the export failure must not reach the user.
- **Non-local environment with full-content capture enabled**: tracing configuration must refuse to start rather than export potentially personal content.
- **Model already includes the disclaimer**: it must not be duplicated, and the guardrail outcome should reflect that the model complied.
- **Model omits the disclaimer**: the code appends it, the final answer remains compliant, and the trace records the correction.
- **Tool arguments are invalid or unknown**: the tool still returns the existing error shape; the trace records the failed check.
- **Very large prompt, reply or tool result**: the agent must still answer normally. The observability service rejects spans above its size limit, so an oversized span may be lost from the trace. The framework does not cap content and the AWS export path cannot be wrapped from application code, so a size cap is **not implemented in this version**. It is a known gap: the first AWS run measures real span sizes, and a cap (for example in a collector) is future work.
- **Concurrent sessions**: compliance results from one turn must not appear in another turn's trace.
- **CLI use without a session identifier**: a local session identifier must be generated so the trace is still correlatable.
- **Evals or other automated runs**: tracing must be off by default unless explicitly enabled, so runs stay deterministic and offline. This applies to every entry point, including the CLI and the agent server.
- **Unknown tracing mode value**: treated as `off`, with a logged warning.
- **Hosted behind an HTTP server or auto-instrumentation (AWS mode)**: framework or HTTP-client spans may appear above or beside the turn span. The turn span is still the single per-turn record and carries the compliance summary.
- **Environment not stated in AWS mode**: the deployment environment must be set explicitly; if it is missing, tracing configuration refuses to start (fail closed), so an unlabelled hosted deployment is never treated as local.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST produce exactly one trace per user turn and MUST attach the session identifier to the trace.
- **FR-002**: Each trace MUST include the turn, the agent invocation, every reasoning cycle, every model call, and every tool call.
- **FR-003**: Each trace MUST include the full system prompt, the current prompt version, the user message, the final answer, and the arguments and result of each tool call.
- **FR-004**: The system MUST record a pass/fail guardrail outcome, with a rule identifier and a short reason, for every existing tool-input validation.
- **FR-005**: The system MUST record a pass/fail guardrail outcome, with a rule identifier and a short reason, for the disclaimer check on every turn.
- **FR-006**: Each turn's trace MUST include an overall compliance status, the number of checks performed, and the identifiers of any failed rules.
- **FR-007**: The system MUST capture full prompt, reply and tool content only when the deployment environment is local. In any other environment, it MUST refuse to start if full-content capture is requested, and with content capture off it MUST export metadata only (content values replaced, not exported).
- **FR-008**: The system MUST support three tracing modes: off, local console, and AWS export. The mode MUST be selectable by configuration without code changes.
- **FR-009**: In AWS export mode, the system MUST emit OpenTelemetry traces to the organization's AWS observability service and MUST be compatible with its generative-AI observability view.
- **FR-010**: Tracing MUST use 100% sampling for the POC.
- **FR-011**: The AWS setup documentation MUST specify 90-day retention for full spans and MUST state that trace summaries expire after 30 days.
- **FR-012**: Tracing MUST NOT change the reply returned to the user and MUST NOT turn a tracing failure (setup, recording or export) into a user-visible error. The deliberate startup refusal in FR-007 is a configuration-policy check, not a tracing failure, and is allowed to stop startup.
- **FR-013**: The automated test suite MUST run without AWS, network access, Ollama or a database, and MUST use an in-memory trace collector to assert span content.
- **FR-014**: The feature MUST provide an AWS operator runbook covering trace ingestion, required permissions, retention, verification, dashboard setup and alarms.
- **FR-015**: The AWS dashboard and alarms MUST cover agent errors, latency, tool errors, token usage where available, and guardrail failures, using the agreed thresholds.
- **FR-016**: Alarm notifications are console-only for this version. The documentation MUST record that a notification topic is a future item.
- **FR-017**: This feature MUST NOT change the frontend, backend or backend-to-agent request/response contracts. The feedback `trace_id` field MUST remain `null`.
- **FR-018**: The feature documentation MUST list the layers that are not traced yet, matching the Out of Scope list in this spec: backend, browser, evals, user identity, feedback trace correlation, real guardrail policy evaluation, prompt registry or content hash, notification delivery, long-term trace search, and hosted/production content redaction.

### Key Entities *(include if feature involves data)*

- **Turn trace**: One user turn's complete execution record. Carries the session identifier, prompt version, compliance status, failed rules, and check count.
- **Execution span**: A timed unit inside a turn trace. Kinds include turn, agent invocation, reasoning cycle, model call and tool call, with parent-child relationships. Agent, cycle, model and tool spans come from the agent framework.
- **Guardrail outcome**: The result of one existing check. Carries a rule identifier, a pass/fail result, a short reason, and the corrective action when one was taken.
- **Compliance summary**: The turn-level roll-up of all guardrail outcomes. Carries the overall status, failed rule identifiers and check count.
- **Tracing configuration**: The selected mode, service identity, environment, and content-capture policy. It determines whether traces leave the process and whether content is included.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of traced turns produce one complete trace containing one turn span, the agent span and at least one model span; turns that call tools also contain the corresponding tool spans.
- **SC-002**: 100% of tool calls and 100% of assistant replies in traced turns have a guardrail outcome with a rule identifier, a pass/fail result and a reason.
- **SC-003**: The user-visible reply is unchanged in 100% of existing behavior tests, and all existing automated tests continue to pass.
- **SC-004**: 0 automated tests require AWS, network access, Ollama or a database.
- **SC-005**: A developer can enable local tracing and inspect a complete turn in under 10 minutes using only the repository documentation.
- **SC-006**: When AWS access is available, the runbook's verification steps confirm trace ingestion is active, the trace is visible, the dashboard is populated, and the four alarm definitions exist.
- **SC-007**: 100% of attempts to enable full-content capture outside the local environment are refused at startup.
- **SC-008**: The retention configuration and the 30-day trace-summary limitation are documented and verifiable by an operator.

## Assumptions

- The portfolio data and users are synthetic for the POC; there is no real personal data in local traces.
- The agent continues to run locally against Ollama for this feature; AWS Bedrock AgentCore and real AWS access are not available yet.
- The existing agent framework already emits agent, cycle, model and tool spans; this feature adds the turn span, guardrail outcomes, compliance summary and export configuration.
- The agent server already receives a session identifier from the backend. The interactive command-line entry point does not, so it generates a local one.
- The existing executable guardrails are tool-input validation and the disclaimer check. Prompt-only boundary rules are recorded as policy metadata, not as pass/fail outcomes, because they are not evaluated in code.
- 100% sampling is acceptable for POC volume, with cost reviewed before any hosted deployment.
- Full-span retention of 90 days with 30-day trace summaries is acceptable.
- CloudWatch dashboard, alarm definitions and the AWS runbook are delivered as repository artifacts and applied manually; no infrastructure-as-code is introduced.
- Notification delivery is out of scope for this version because there is no AWS access and no agreed notification channel.
- No user identity is added to traces in this version; `session.id` is the only correlation identifier.
- A missing disclaimer is recorded as a failed check even though the code corrects the answer. With a small local model this may be frequent, so guardrail-failure counts (and the "any guardrail failure" alarm) are expected to be noisy until the prompt or model improves. Thresholds stay as agreed and are reviewed after the first AWS run.
- SC-006 and the AWS user story can only be verified once AWS access exists; until then they are "implemented and documented, not end-to-end verified".

## Out of Scope and Future Layers

The following layers are explicitly **not traced** in this feature. They are recorded here and in the repository README so the next tracing feature can pick them up:

- **Backend request tracing**: FastAPI request spans, the backend-to-agent HTTP call, and trace-context propagation from the backend.
- **Browser/frontend tracing**: Web-app spans and a trace context header on `POST /api/chat`.
- **Evals and CI tracing**: Exporting eval runs and comparing prompt/model versions over time.
- **Feedback trace correlation**: Returning a trace identifier from the agent, storing it with the assistant message, and populating the existing `feedback.trace_id` field.
- **User identity**: Adding `user.id` to the backend-to-agent contract and to spans.
- **Real guardrail policy evaluation**: Bedrock Guardrails or a rules engine that evaluates prompt-only boundaries (no trades, no specific advice, instruction-injection resistance).
- **Prompt registry or content hash**: Runtime prompt versioning and detection of undocumented prompt edits.
- **Notification delivery**: An SNS topic, email or chat subscription for alarms.
- **Long-term trace search**: Keeping searchable trace summaries beyond 30 days; only 90-day full-span storage is in scope.
- **Hosted/production content redaction**: A redaction policy and implementation for environments outside local.
