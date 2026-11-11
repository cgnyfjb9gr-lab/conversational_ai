# Research: Agent Execution Tracing

**Feature**: `010-agent-tracing` | **Date**: 2026-11-07

This document records the platform research and the decisions that shaped [plan.md](./plan.md). All previously open questions were resolved with the user before the spec was written; there are no unresolved `[NEEDS CLARIFICATION]` items.

## Decision 1: AWS backend — CloudWatch via OTLP

**Decision**: Send OpenTelemetry traces to the CloudWatch OTLP traces endpoint (`https://xray.<region>.amazonaws.com/v1/traces`), viewed through CloudWatch Transaction Search, Application Signals and the GenAI Observability dashboard.

**Rationale**:
- The user mandated an AWS service that uses OpenTelemetry.
- CloudWatch accepts OTLP/HTTP directly, so the agent can emit standard GenAI spans without an AWS-specific SDK in the application.
- The GenAI Observability view is compatible with Strands and AgentCore, which matters for the planned AgentCore migration.
- Transaction Search stores spans in the `aws/spans` log group, where retention can be set to 90 days.

**Alternatives considered**:
- **X-Ray SDK**: AWS-specific, not OTLP-native; would not capture Strands GenAI spans as cleanly.
- **Amazon Managed Grafana + Tempo/X-Ray**: more dashboard flexibility, but adds a workspace and cost for a POC.
- **OpenSearch trace analytics**: more control, but a cluster to operate.
- **Langfuse/Phoenix/Braintrust**: excellent GenAI UX, but the user asked for an AWS service and CloudWatch keeps the POC inside the existing cloud account.

**Constraints / gotchas**:
- Transaction Search is an account-level prerequisite; until it is enabled, spans do not arrive.
- The traces endpoint supports HTTP only (not gRPC) and requires SigV4 or a bearer token.
- CloudWatch rejects spans larger than 200 KB, batches larger than 5 MB or 10,000 spans, and resources/scopes larger than 16 KB.
- Default OTel random trace IDs are silently dropped by X-Ray; an X-Ray-compatible ID generator is required.
- `opentelemetry-instrument` also auto-instruments HTTP server and client libraries, so extra framework spans (for example the AgentCore HTTP server span, or `httpx` calls to Ollama) can appear above or beside our spans. The turn span is therefore not guaranteed to be the trace root in AWS mode.

**Sources**:
- AWS CloudWatch OTLP endpoints: https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-OTLPEndpoint.html
- CloudWatch Transaction Search: https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Transaction-Search.html
- CloudWatch GenAI Observability: https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/GenAI-observability.html

## Decision 2: Export path — ADOT SDK, collectorless

**Decision**: Add `aws-opentelemetry-distro==0.22.0`, run the agent with `opentelemetry-instrument`, and use the ADOT AWS configurator for SigV4 and OTLP export.

**Rationale**:
- ADOT handles SigV4 signing through the boto3 credential chain, which raw OTel exporters do not do by default.
- It mirrors the documented "non-runtime agent" path for AgentCore Observability, so the same setup works locally with credentials and later on AgentCore Runtime.
- It avoids running and operating an OpenTelemetry Collector for the POC.

**Alternatives considered**:
- **Local OpenTelemetry Collector → CloudWatch**: clean separation and no AWS credentials in the app process, but adds a second process/config and was not selected.
- **Console-only until AgentCore**: simplest, but does not prove the mandated CloudWatch path.
- **Raw OTLP exporter + custom SigV4**: more code, more failure modes, and still needs X-Ray ID handling.

**Validation items**:
- Confirm ADOT supplies X-Ray-compatible trace IDs.
- Confirm ADOT and Strands do not double-configure the tracer provider. `TRACING_MODE=adot` deliberately skips `StrandsTelemetry`.
- Confirm `aws-opentelemetry-distro` resolves cleanly with `strands-agents[otel]`. Checked on PyPI: 0.22.0 requires Python >=3.10 and pins `opentelemetry-sdk==1.45.1` and `opentelemetry-api==1.45.1` exactly, while Strands accepts `>=1.30,<2`. The current `agent/.venv` has 1.45.2, so installing will downgrade it; T003 verifies this resolves.
- Confirm which auto-instrumented spans (HTTP server, `httpx`) appear around the turn span, and that they do not change the one-turn-per-trace expectation.

**Sources**:
- AgentCore Observability for non-runtime agents: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability-configure.html
- AWS blog, on-premises/multi-cloud agents with AgentCore Observability (ADOT + SigV4 + env vars): https://aws.amazon.com/blogs/machine-learning/monitor-on-premises-and-multi-cloud-ai-agents-with-agentcore-observability/
- CloudWatch OTLP with ADOT: https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-OTLP-UsingADOT.html

## Decision 3: Instrumentation — Strands built-in telemetry plus custom turn/guardrail spans

**Decision**: Use Strands' built-in OpenTelemetry tracing for agent, cycle, model and tool spans; add a `wealth_agent.turn` root span and guardrail events in our code.

**Rationale**:
- `strands-agents[otel]` in version 1.63.0 provides `StrandsTelemetry` and follows the GenAI semantic conventions.
- Strands emits `invoke_agent <name>`, `execute_event_loop_cycle`, `chat` and `execute_tool <tool name>` spans with `gen_ai.*` attributes, token usage, system prompt, messages, and tool arguments and results (verified against the installed 1.63.0 source).
- Hand-instrumenting model/tool spans would duplicate and risk conflicting with the SDK's own spans.
- Custom spans use the standard OpenTelemetry API and nest under the current Strands span.

**Alternatives considered**:
- **Manual OTel spans everywhere**: full control, but duplicates SDK work and will drift.
- **ADOT auto-instrumentation only**: may work, but the Strands-native path is documented and gives the GenAI semantic attributes directly; we still rely on ADOT for export in AWS mode.
- **OpenInference/OpenLLMetry instrumentation**: another layer, not needed for Strands.

**Relevant Strands span names and attributes** (verified against `strands/telemetry/tracer.py` in 1.63.0):

Strands has two content conventions, selected by `OTEL_SEMCONV_STABILITY_OPT_IN`. The legacy default emits content as span *events* (`gen_ai.system.message`, `gen_ai.user.message`, `gen_ai.assistant.message`, `gen_ai.tool.message`, `gen_ai.choice`). With `gen_ai_latest_experimental` it emits `gen_ai.system_instructions` as a span attribute and `gen_ai.input.messages` / `gen_ai.output.messages` in `gen_ai.client.inference.operation.details` events, and adds `gen_ai.tool.call.arguments` / `gen_ai.tool.call.result` attributes on tool spans. **This feature standardises on the latest convention** (it is also what the AWS GenAI view documentation sets). There is no `system_prompt` attribute and no `tool.status` attribute in either convention; the tool outcome attribute is `gen_ai.tool.status`.

- `invoke_agent <agent name>`: `gen_ai.operation.name`, `gen_ai.agent.name`, `gen_ai.request.model`, `gen_ai.agent.tools`, `gen_ai.system_instructions`, token usage, plus any `trace_attributes` passed to `Agent(...)`.
- `execute_event_loop_cycle`: cycle id and messages.
- `chat`: `gen_ai.request.model`, input/output messages, token usage.
- `execute_tool <tool name>`: `gen_ai.tool.name`, `gen_ai.tool.call.id`, `gen_ai.tool.status`, `gen_ai.tool.call.arguments`, `gen_ai.tool.call.result`, plus `trace_attributes`.
- All Strands spans are `INTERNAL` kind. Tool spans run inside `use_span`, so `trace.get_current_span()` inside a tool handler is the tool span.

**Sources**:
- Strands traces guide: https://strandsagents.com/docs/user-guide/sdk/observability-evaluation/traces
- Strands telemetry API: https://strandsagents.com/docs/api/python/strands.telemetry.config
- PyPI metadata for `strands-agents==1.63.0` confirms the `otel` extra (`opentelemetry-exporter-otlp-proto-http`, `opentelemetry-processor-baggage`).

## Decision 4: Trace boundary — one trace per user turn

**Decision**: Each `ask()` call is one trace, with `session.id` attached.

**Rationale**:
- Matches the Strands agent span lifecycle and the CloudWatch trace view.
- Keeps traces bounded and easy to search.
- Avoids long-lived, unbounded traces for a multi-turn chat.
- The backend and CLI both have a natural per-turn invocation boundary.

**Alternatives considered**:
- **One trace per session**: better for conversation-level analysis, but long-lived and awkward in trace UIs.
- **One trace per process**: too coarse; CLI and server processes serve many turns.
- **Per-turn with session baggage**: useful later for cross-layer propagation; baggage is not needed for agent-only scope.

## Decision 5: Content capture — full locally, hard-refused elsewhere

**Decision**: Capture full prompts, replies and tool content when `deployment.environment=local`; refuse full-content tracing in any other environment. Metadata-only mode strips content before export.

**Rationale**:
- The user needs full content for debugging and compliance review.
- The POC uses synthetic portfolio data.
- Tracing content is a privacy risk the moment real users or real portfolios appear; a startup refusal is safer than a warning.
- Metadata-only mode keeps traces useful (latency, tool names, outcomes) without content.

**Alternatives considered**:
- **Always capture full content**: simplest, but unsafe by default.
- **Flag plus warning**: easy to misconfigure.
- **Redaction now**: the right long-term answer, but needs a real PII policy and classifier; deferred.
- **Custom exporter/processor that strips content (original draft)**: rejected. It would have to know every content key in both conventions, content lives in span events as well as attributes, and in AWS mode the provider and exporter belong to ADOT, so a wrapper cannot be inserted.

**Mechanism (revised)**: Strands 1.63.0 has a built-in redaction policy. Adding the token `gen_ai_unredacted_attributes=` (empty allow-list) to `OTEL_SEMCONV_STABILITY_OPT_IN` makes Strands replace `gen_ai.system_instructions`, `gen_ai.input.messages`, `gen_ai.output.messages`, `gen_ai.tool.call.arguments` and `gen_ai.tool.call.result` with a fixed redaction marker at the source, in every export mode. It is read once when the first agent is built, so tracing configuration must run before `build_agent()`. Without the token everything is emitted unredacted.

## Decision 6: Guardrails — instrument the two checks that exist

**Decision**: Record `GR-TOOL-INPUT` and `GR-OUTPUT-DISCLAIMER` outcomes only. Do not add a policy engine.

**Rationale**:
- The code today has exactly two executable checks: tool argument validation in `_safe()` and the disclaimer enforcement in `ask()`.
- Prompt boundary rules (no trades, no specific advice, ignore injected instructions) are instructions, not evaluated checks. Recording them as pass/fail would be misleading.
- The user explicitly chose "instrument existing checks only".
- The schema is extensible: a future Bedrock Guardrails or rules engine can emit the same `guardrail.check` events with new rule ids.

**Semantics**:
- `GR-TOOL-INPUT`: pass when the handler returns `ok=true`; fail when it returns `ok=false`; reason is the existing error string.
- `GR-OUTPUT-DISCLAIMER`: pass when the model's raw answer already ends with the disclaimer; fail when the code appends it; action `append_disclaimer`. The final answer is always compliant.
- `compliance_status` is `fail` if any check failed. This surfaces model noncompliance without changing behavior.

## Decision 7: Prompt version — full text plus version

**Decision**: Rely on Strands' `gen_ai.system_instructions` attribute (latest convention) for the full prompt text and add `prompt.version` (from `PROMPT_VERSION`) to the turn span and, through Strands `trace_attributes`, to the agent and tool spans.

**Rationale**:
- Strands already captures the full system prompt on the agent span; duplicating it on every span wastes payload.
- `PROMPT_VERSION` is the existing git-tracked version string and is already tested.
- Full text plus a version gives reviewers both the exact instructions and a stable label.

**Alternatives considered**:
- **Version constant only**: loses the exact text after a prompt edit.
- **Content hash**: useful for detecting undocumented edits, but not required now; recorded as future work.
- **Prompt registry**: out of scope for a POC.

## Decision 8: Metrics and alarms — span-derived filters, Application Signals for p95

**Decision**: Derive counts from CloudWatch Logs metric filters over `aws/spans`; use CloudWatch Application Signals for p95 latency when available, with an average-duration filter as fallback.

**Rationale**:
- The user selected span-derived filters.
- Counts (errors, guardrail failures, tool errors) map cleanly to metric filters.
- p95 cannot be computed by a CloudWatch Logs metric filter. Application Signals derives service metrics from the same spans, so it stays within the "traces first" approach without adding an agent metrics pipeline.

**Alternatives considered**:
- **Emit OTel metrics from the agent**: clean alarms, but adds a second telemetry signal and more configuration.
- **Built-in GenAI metrics only**: covers model latency/tokens, not guardrail failures.
- **Logs Insights scheduled queries**: no native alarm integration.

**Thresholds**:
- Agent error rate > 5% over 5 minutes.
- Any guardrail failure.
- Tool error rate > 10%.
- p95 latency > 8 seconds (the backend times out at 10 seconds).

**Validation item**: confirm the exact CloudWatch Logs metric-filter JSON paths against a real span document. The `aws/spans` schema is generated by CloudWatch, not by our exporter, so this cannot be verified without AWS access.

## Decision 9: Retention — 90-day spans, 30-day summaries

**Decision**: Set the `aws/spans` log group retention to 90 days; document that X-Ray trace summaries and the service map expire after 30 days.

**Rationale**:
- Matches the user's choice.
- Full spans remain queryable in CloudWatch Logs for 90 days.
- No S3/OpenSearch export is added for the POC.

**Future**: 90-day searchable trace summaries or an S3/OpenSearch export.

## Decision 10: AgentCore-compatible routing now

**Decision**: Configure the resource attributes and log-group headers documented for non-runtime AgentCore agents so traces appear in the GenAI Observability view.

**Rationale**:
- Avoids a telemetry rewrite when the agent moves to AgentCore Runtime.
- The cost is a few environment variables and a log group, not new code.

**Documented env vars**:
- `AGENT_OBSERVABILITY_ENABLED=true`
- `OTEL_PYTHON_DISTRO=aws_distro`
- `OTEL_PYTHON_CONFIGURATOR=aws_configurator`
- `OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf`
- `OTEL_TRACES_EXPORTER=otlp`
- `OTEL_RESOURCE_ATTRIBUTES` with `service.name` and `aws.log.group.names`
- `OTEL_EXPORTER_OTLP_LOGS_HEADERS` with `x-aws-log-group`, `x-aws-log-stream`, `x-aws-metric-namespace` (from the AWS non-runtime-agent guide; not verifiable without AWS access)

**Validation item**: confirm the GenAI dashboard shows the agent and sessions when AWS access exists.

## Validation checklist for the first AWS run

- [ ] Transaction Search enabled; `aws xray get-trace-segment-destination` returns `ACTIVE`.
- [ ] `aws/spans` log group exists and retention is 90 days.
- [ ] IAM principal can call the four X-Ray actions and write to the GenAI log group.
- [ ] One traced turn appears in Transaction Search with `service.name=convai-wealth-agent`.
- [ ] Trace IDs are X-Ray-compatible (no silent drops).
- [ ] The GenAI Observability view lists the agent, its sessions and traces.
- [ ] Full content is visible in local mode and absent in metadata-only mode.
- [ ] Dashboard widgets populate.
- [ ] Four alarms exist and evaluate.
- [ ] Metric filter paths match the real `aws/spans` document.
