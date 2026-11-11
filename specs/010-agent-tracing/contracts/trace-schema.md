# Contract: Trace Schema and Telemetry Configuration

**Feature**: `010-agent-tracing` | **Version**: 1.1.0 | **Date**: 2026-11-07

This is the interface contract for traces emitted by the wealth agent. It is consumed by CloudWatch, by tests, and by any future backend/browser tracing layer. Changes to span names, required attributes, rule ids or configuration variables are contract changes and require a spec update.

## 1. Resource attributes

Every span carries:

| Attribute | Required | Value |
|---|---|---|
| `service.name` | yes | `convai-wealth-agent` |
| `service.version` | yes | Agent package version, or `0.1.0` when metadata is unavailable |
| `deployment.environment` | yes | `local`, `staging`, `prod`, etc. Defaults to `local` |
| `telemetry.sdk.name` | yes | Supplied by the OpenTelemetry SDK |
| `telemetry.sdk.language` | yes | `python` |
| `telemetry.sdk.version` | yes | Supplied by the OpenTelemetry SDK |
| `aws.log.group.names` | AWS mode | `/aws/bedrock-agentcore/runtimes/convai-wealth-agent` |

## 2. Span hierarchy

```text
wealth_agent.turn                         (exactly one per turn)
└── invoke_agent <agent name>             (Strands)
    └── execute_event_loop_cycle          (Strands; zero or more)
        ├── chat                          (Strands model call; one or more)
        └── execute_tool <tool name>      (Strands tool call; zero or more)
```

`wealth_agent.turn` is the trace root unless auto-instrumentation (`opentelemetry-instrument` in AWS mode) adds a parent such as an HTTP server span. Extra framework spans (HTTP client calls to the model server) may also appear; they are not part of this contract.

Span names for the Strands spans are produced by Strands 1.63.0 and verified against its source; they are contract-relevant for dashboards and filters, so a Strands upgrade requires re-checking them.

### 2.1 `wealth_agent.turn`

| Attribute | Required | Type | Notes |
|---|---|---|---|
| `session.id` | no | string | Omitted when the caller has no session; the CLI always supplies `local-<uuid4>`. The agent server passes the request's `session_id` (the existing `"default"` fallback applies when absent) |
| `prompt.version` | yes | string | `PROMPT_VERSION` |
| `compliance_status` | yes | `pass` \| `fail` | Roll-up |
| `compliance_failed_rules` | yes | string | Sorted comma-separated rule ids; empty string when none |
| `compliance_check_count` | yes | integer | Number of checks |

Events on this span:

- `guardrail.check` for `GR-OUTPUT-DISCLAIMER`.

### 2.2 `invoke_agent <agent name>` (Strands)

Strands supplies the span and its GenAI attributes. This feature passes `trace_attributes` to the Strands `Agent`, which adds `prompt.version` (required) and `session.id` (when known) to this span and to the tool spans.

Content attributes when full capture is enabled:

- `gen_ai.system_instructions` (full system prompt)
- `gen_ai.input.messages` / `gen_ai.output.messages` (user message and final answer, in the `gen_ai.client.inference.operation.details` event)

### 2.3 `execute_event_loop_cycle` (Strands)

Strands supplies the cycle attributes. No custom attributes are added.

### 2.4 `chat` (Strands)

Strands supplies the model attributes, including `gen_ai.request.model`, `gen_ai.input.messages`, `gen_ai.output.messages` and token usage where the model reports it.

### 2.5 `execute_tool <tool name>` (Strands)

| Attribute | Required | Type | Notes |
|---|---|---|---|
| `gen_ai.tool.name` | yes | string | Supplied by Strands |
| `gen_ai.tool.call.id` | no | string | Supplied by Strands |
| `gen_ai.tool.status` | no | string | Supplied by Strands |
| `gen_ai.tool.call.arguments` | content | string | Supplied by Strands; redacted in metadata-only mode |
| `gen_ai.tool.call.result` | content | string | Supplied by Strands; redacted in metadata-only mode |
| `prompt.version` | yes | string | Via `trace_attributes` |
| `session.id` | no | string | Via `trace_attributes` |
| `tool_ok` | yes | boolean | Mirrors the handler's `ok` value |
| `guardrail_rule_id` | yes | string | Always `GR-TOOL-INPUT` |
| `guardrail_result` | yes | `pass` \| `fail` | Outcome |
| `guardrail_reason` | yes | string | Short reason |
| `guardrail_action` | yes | `allow` \| `return_error` | Action taken |

Event on this span:

- `guardrail.check` with the same `guardrail_*` attributes.

## 3. Guardrail event contract

Event name: `guardrail.check`

| Attribute | Required | Values |
|---|---|---|
| `guardrail_rule_id` | yes | `GR-TOOL-INPUT` \| `GR-OUTPUT-DISCLAIMER` |
| `guardrail_result` | yes | `pass` \| `fail` |
| `guardrail_reason` | yes | Short string. For tool failures it is the existing validation message, which may name an argument but never includes argument values |
| `guardrail_action` | yes | `allow` \| `return_error` \| `append_disclaimer` |
| `gen_ai.tool.name` | for tool checks | Tool name |

Rules:

- `GR-TOOL-INPUT`: `ok=true` → `pass`/`allow`; `ok=false` → `fail`/`return_error`.
- `GR-OUTPUT-DISCLAIMER`: raw answer already ends with the disclaimer → `pass`/`allow`; code appended it → `fail`/`append_disclaimer`.
- A guardrail failure does not set span status `ERROR` and does not change the reply or tool result.

## 4. Compliance summary contract

Written on the root span before it ends:

- `compliance_status`: `fail` if any check in the turn failed; otherwise `pass`.
- `compliance_failed_rules`: sorted, comma-separated failed rule ids; empty string when none.
- `compliance_check_count`: number of checks in this turn only.

The summary must be computed from the turn's own collector. Concurrent turns must not share state.

## 5. Content contract

This contract requires `OTEL_SEMCONV_STABILITY_OPT_IN` to include `gen_ai_latest_experimental`. `configure_tracing` sets it for `off`/`console`; in `adot` mode it is part of the required environment and is validated.

Content attributes:

- `gen_ai.system_instructions`
- `gen_ai.input.messages`
- `gen_ai.output.messages`
- `gen_ai.tool.call.arguments`
- `gen_ai.tool.call.result`

### Full-content mode

Allowed only when the effective `deployment.environment` is `local` and `TRACING_CAPTURE_CONTENT` is unset or `true`.

### Metadata-only mode

Used when the environment is not local and `TRACING_CAPTURE_CONTENT` is unset or `false`. `OTEL_SEMCONV_STABILITY_OPT_IN` carries the token `gen_ai_unredacted_attributes=`; Strands then replaces the content attributes above with its redaction marker before export. No custom exporter is involved.

### Refusal mode

If the environment is not local and `TRACING_CAPTURE_CONTENT=true`, `configure_tracing` raises `TracingConfigError` at startup. The agent does not start with unsafe content capture. The same error is raised if the environment is ambiguous: `adot` mode with no environment set, or `OTEL_RESOURCE_ATTRIBUTES` and `DEPLOYMENT_ENVIRONMENT` set to different values.

### Size limit

No size cap is applied in this version (known gap). CloudWatch rejects spans above 200 KB; see the plan's risk table.

## 6. Configuration contract

| Variable | Values | Default | Meaning |
|---|---|---|---|
| `TRACING_MODE` | `off`, `console`, `adot` | `off` everywhere (library, tests, CLI, agent server); unknown value → `off` with a warning | Export path |
| `TRACING_CAPTURE_CONTENT` | `true`, `false` | `true` when the environment is `local`, otherwise `false` | Content capture |
| `DEPLOYMENT_ENVIRONMENT` | string | `local` in `console` mode; **required** in `adot` mode | Resource `deployment.environment` (must match `OTEL_RESOURCE_ATTRIBUTES` if both are set) |
| `OTEL_SERVICE_NAME` | string | `convai-wealth-agent` | Resource `service.name` |
| `OTEL_RESOURCE_ATTRIBUTES` | comma-separated | see runbook | Additional resource attributes; includes `deployment.environment` and, in AWS mode, `aws.log.group.names` |
| `OTEL_TRACES_SAMPLER` | string | `parentbased_always_on` | 100% sampling for the POC |
| `AWS_REGION` | string | unset | Region for the CloudWatch endpoint and ADOT credentials |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | URL | unset | `https://xray.<region>.amazonaws.com/v1/traces` in AWS mode |

### Mode behavior

| Mode | Provider | Export |
|---|---|---|
| `off` | none | none; spans are no-ops |
| `console` | `StrandsTelemetry` | console exporter; no AWS credentials required |
| `adot` | supplied by `opentelemetry-instrument` | ADOT/OTLP with SigV4 to CloudWatch; `StrandsTelemetry` is skipped |

### Precedence

1. An explicit `configure_tracing(mode=...)` argument.
2. `TRACING_MODE` environment variable.
3. `off`.

## 7. AWS export contract

Required environment for the ADOT runbook:

```text
TRACING_MODE=adot
AGENT_OBSERVABILITY_ENABLED=true
OTEL_PYTHON_DISTRO=aws_distro
OTEL_PYTHON_CONFIGURATOR=aws_configurator
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_TRACES_EXPORTER=otlp
OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental
OTEL_SERVICE_NAME=convai-wealth-agent
OTEL_RESOURCE_ATTRIBUTES=service.name=convai-wealth-agent,deployment.environment=local,aws.log.group.names=/aws/bedrock-agentcore/runtimes/convai-wealth-agent
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://xray.<region>.amazonaws.com/v1/traces
OTEL_EXPORTER_OTLP_LOGS_HEADERS=x-aws-log-group=/aws/bedrock-agentcore/runtimes/convai-wealth-agent,x-aws-log-stream=runtime-logs,x-aws-metric-namespace=bedrock-agentcore
```

Requirements:

- CloudWatch Transaction Search must be enabled before the first trace.
- The principal needs `xray:PutTraceSegments`, `xray:PutTelemetryRecords`, `xray:GetSamplingRules`, `xray:GetSamplingTargets` and the CloudWatch Logs permissions for the GenAI log group.
- Trace ids must be X-Ray-compatible. ADOT is expected to supply the correct generator; this is a validation item.
- The endpoints are HTTP/protobuf only.

## 8. Compatibility and versioning

- Adding a new guardrail rule id is additive and does not change existing ids.
- Adding a new span attribute is additive.
- Renaming or removing a span name, attribute or rule id requires a spec update.
- The backend-to-agent contract is unchanged: the agent still returns `{reply, intent}`. `feedback.trace_id` stays `null` in this version.
- A future backend/browser tracing layer may propagate a W3C `traceparent` header. This contract does not require or emit it yet.
