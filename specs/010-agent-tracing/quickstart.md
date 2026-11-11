# Quickstart: Agent Execution Tracing

**Feature**: `010-agent-tracing` | **Date**: 2026-11-07

This guide validates the feature locally without AWS access, then gives the manual AWS runbook for when credentials exist. Detailed span/attribute names are in [contracts/trace-schema.md](./contracts/trace-schema.md); the entity model is in [data-model.md](./data-model.md).

## Part 1 — Local validation (no AWS)

### Prerequisites

- Python 3.10+ (the repository currently uses 3.11/3.12 locally).
- The agent dependencies installed from `agent/`.
- Ollama running locally, with the `llama3.2` model pulled, for real turns.
- No AWS credentials, network access to AWS, database or Docker required.

### Setup

```bash
cd agent
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
```

### 1. Run the tests first (tracing off)

```bash
cd agent
pytest
```

Expected: all existing tests pass, plus the new tracing tests. No AWS, network, Ollama or database is used. The tracing tests use an in-memory span exporter.

### 2. Run the agent with console tracing

Bash / macOS / Linux:

```bash
cd agent
TRACING_MODE=console PYTHONPATH=src python -m wealth_agent
```

PowerShell:

```powershell
cd agent
$env:TRACING_MODE = "console"
$env:PYTHONPATH = "src"
python -m wealth_agent
```

Ask a question that triggers a tool, for example:

```text
project $10,000 growing at 6% for 20 years with $500 a month
```

Expected in the console output:

- One `wealth_agent.turn` root span with `session.id`, `prompt.version`, and the `compliance_*` attributes.
- A child `invoke_agent <name>` span with `gen_ai.system_instructions` (the full prompt) and `prompt.version`.
- One or more `execute_event_loop_cycle` spans.
- One or more `chat` spans with `gen_ai.input.messages` / `gen_ai.output.messages` and token usage where reported.
- An `execute_tool project_savings` span with `tool_ok=true`, `guardrail_rule_id=GR-TOOL-INPUT`, `guardrail_result=pass`.
- A `guardrail.check` event for `GR-OUTPUT-DISCLAIMER` on the root span.

Ask a greeting such as `hi`:

- The trace still has the turn and model spans.
- No tool span is present.
- The disclaimer check still runs.

### 3. Validate a guardrail failure

Two easy checks:

1. **Tool input failure**: ask for a projection with an out-of-range value, or run the tool handler directly with invalid arguments in a test. Expected: `GR-TOOL-INPUT` result `fail`, reason from the existing validation message, `guardrail_action=return_error`.
2. **Disclaimer correction**: use a stub agent whose raw answer omits the disclaimer. The final answer still gets the disclaimer, and the trace records `GR-OUTPUT-DISCLAIMER` result `fail` with `guardrail_action=append_disclaimer`.

### 4. Validate metadata-only and refusal modes

Metadata-only (non-local environment, content disabled):

```bash
TRACING_MODE=console DEPLOYMENT_ENVIRONMENT=staging TRACING_CAPTURE_CONTENT=false PYTHONPATH=src python -m wealth_agent
```

Expected: spans are still produced, but `gen_ai.system_instructions`, `gen_ai.input.messages`, `gen_ai.output.messages`, `gen_ai.tool.call.arguments` and `gen_ai.tool.call.result` show Strands' redaction marker instead of content (also check span events, not only attributes).

Refusal (non-local environment, content requested):

```bash
TRACING_MODE=console DEPLOYMENT_ENVIRONMENT=staging TRACING_CAPTURE_CONTENT=true PYTHONPATH=src python -m wealth_agent
```

Expected: startup fails with `TracingConfigError` naming the environment/content combination. No traces are exported.

### 5. Validate resilience

- Run with an invalid `TRACING_MODE`: the agent logs a warning and runs with tracing off, never failing the user's turn. (A content/environment policy violation is different: it deliberately stops startup.)
- Simulate an exporter failure in a unit test: the reply is unchanged and the failure is logged.
- Confirm the existing mock/fallback behavior in the backend is untouched (backend tests).

### 6. Validate no-op tracing

Run the tests without setting `TRACING_MODE`:

```bash
cd agent
pytest
```

Expected: no console span output, no network calls, all tests pass.

## Part 2 — AWS runbook (manual, when access exists)

This part is **not executed** in this feature because there is no AWS access. It is the acceptance checklist for the first account with credentials.

### Prerequisites

- An AWS account and a region.
- A principal (user or role) that can enable CloudWatch Transaction Search and create the log group/dashboard/alarms.
- AWS credentials available to the ADOT/boto3 credential chain (environment variables, profile, SSO, or instance role).

### Step 1 — Enable Transaction Search

1. Open the CloudWatch console.
2. Go to **Settings** → **X-Ray traces** → **Transaction Search**.
3. Enable it.
4. Ingest **100% of spans as structured logs**.
5. Index **1%** of spans as trace summaries (the free tier; increase only for debugging).
6. Wait 2–10 minutes for the `aws/spans` log group to be provisioned.

Verify:

```bash
aws xray get-trace-segment-destination --region <region>
```

Expected: `"Destination": "CloudWatchLogs"` and `"Status": "ACTIVE"`.

### Step 2 — Set retention

1. CloudWatch → Logs → Log groups → `aws/spans`.
2. Actions → Edit retention → **90 days**.

Remember: X-Ray trace summaries and the service map still expire after **30 days**. Only the full spans in `aws/spans` are kept for 90 days.

### Step 3 — Apply permissions

Use [ops/iam-policy.json](./ops/iam-policy.json) as the starting point. It covers:

- `xray:PutTraceSegments`
- `xray:PutTelemetryRecords`
- `xray:GetSamplingRules`
- `xray:GetSamplingTargets`
- CloudWatch Logs actions needed for the GenAI log group

Attach it to the principal that runs the agent. Prefer a role with short-term credentials over long-lived access keys.

### Step 4 — Configure the AWS run

```bash
export TRACING_MODE=adot
export AWS_REGION=<region>
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

cd agent
PYTHONPATH=src opentelemetry-instrument python -m wealth_agent
```

Note: `deployment.environment` stays `local` for the POC because full content is enabled. In `adot` mode the environment must be set explicitly (the app refuses to start otherwise), and `DEPLOYMENT_ENVIRONMENT`, if also set, must match `OTEL_RESOURCE_ATTRIBUTES`. A hosted environment must set `TRACING_CAPTURE_CONTENT=false` (or a future redaction policy).

### Step 5 — Verify the trace

1. CloudWatch → **Transaction Search** → `/aws/spans/default`.
2. Filter by `service.name = convai-wealth-agent`.
3. Open the newest trace.
4. Confirm:
   - `wealth_agent.turn` is present once per turn (it may sit below an auto-instrumented HTTP server span).
   - `invoke_agent`, `execute_event_loop_cycle`, `chat` and `execute_tool` spans are present.
   - Note the size of the largest span (the 200 KB limit is a known gap).
   - The prompt, reply and tool content are visible in local mode.
   - `guardrail.check` events are present.
   - The trace id is X-Ray-compatible (not silently dropped).
5. Open **GenAI Observability** → **Bedrock AgentCore agents** and confirm the agent, sessions and traces are visible.

If the GenAI view is empty but Transaction Search has spans, re-check `OTEL_RESOURCE_ATTRIBUTES` (`aws.log.group.names`) and the log-group headers.

### Step 6 — Dashboard

Import [ops/dashboard.json](./ops/dashboard.json) or create the widgets manually. Expected widgets:

- Invocations per minute.
- Agent error rate.
- Tool error rate.
- p50/p95 latency.
- Token usage where the model reports it.
- Guardrail pass/fail counts.

### Step 7 — Alarm definitions

Create the four alarms from [ops/alarms.json](./ops/alarms.json) (after the metric filters in Step 8 exist; apply one entry at a time, for example `jq -c '.Alarms[0]' ops/alarms.json > /tmp/a.json && aws cloudwatch put-metric-alarm --cli-input-json file:///tmp/a.json`):

| Alarm | Threshold | Window |
|---|---|---|
| Agent error rate | > 5% | 5 minutes |
| Any guardrail failure | > 0 | 5 minutes |
| Tool error rate | > 10% | 5 minutes |
| p95 latency | > 8 seconds | 5 minutes |

**p95 caveat**: CloudWatch Logs metric filters cannot compute p95. Use CloudWatch Application Signals if enabled; otherwise use an average-duration metric filter and mark the alarm as a POC approximation.

Notifications are **console-only** for this version. Add an SNS topic and subscription later; this is recorded as future work.

### Step 8 — Validate metric filters

CloudWatch generates the `aws/spans` document. Confirm the filter paths in [ops/metric-filters.md](./ops/metric-filters.md) against a real span document before relying on alarms. Adjust the paths if the field layout differs.

## Troubleshooting

| Symptom | Check |
|---|---|
| No spans locally | `TRACING_MODE=console`; entrypoint calls `configure_tracing`; no `TRACING_MODE=off`. |
| No spans in AWS | Transaction Search active; credentials; endpoint region; ADOT run command. |
| 403 / signature errors | SigV4 via ADOT; credential chain; clock skew; region. |
| Spans missing silently | X-Ray trace id format; ADOT provider; confirm `TRACING_MODE=adot` skips `StrandsTelemetry`. |
| 400 / 413 on export | Span size > 200 KB (no cap is built; see plan risks); check batch size. |
| GenAI view empty | `aws.log.group.names`; `OTEL_EXPORTER_OTLP_LOGS_HEADERS`; log group exists. |
| p95 alarm never evaluates | Application Signals not enabled; use the average-duration fallback. |
| Tests try to reach AWS | A test configured an OTLP exporter; tests must use `off` or an in-memory exporter. |

## Acceptance checklist

- [ ] All agent tests pass with no AWS/network/Ollama/database.
- [ ] One local turn produces one complete trace with root, agent, cycle, model and tool spans.
- [ ] Prompt text and `prompt.version` are present.
- [ ] Full content is present in local mode.
- [ ] Metadata-only mode redacts content (attributes and events).
- [ ] Tracing is off by default for the CLI, the agent server, evals and tests.
- [ ] Non-local full-content mode is refused at startup.
- [ ] Tool validation produces `GR-TOOL-INPUT` pass/fail with a reason.
- [ ] Disclaimer produces `GR-OUTPUT-DISCLAIMER` pass/fail with an action.
- [ ] Root span has the compliance summary.
- [ ] Concurrent turns do not mix compliance results.
- [ ] Existing replies and backend fallbacks are unchanged.
- [ ] AWS runbook steps are documented; the AWS-only items remain unchecked until credentials exist.
- [ ] README lists the deferred tracing layers.
