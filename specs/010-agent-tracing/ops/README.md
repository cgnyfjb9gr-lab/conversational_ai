# AWS operator artifacts (applied manually, no infrastructure-as-code)

Written without AWS access, so none of this is verified end to end. The first AWS run checks it
against `../quickstart.md` Part 2 and the validation checklist in `../research.md`.

| File | Purpose |
|---|---|
| `iam-policy.json` | Permissions for the principal that runs the agent |
| `dashboard.json` | CloudWatch dashboard body (`aws cloudwatch put-dashboard`) |
| `metric-filters.md` | Metric filters, Logs Insights queries, the p95 limitation |
| `alarms.json` | The four alarm definitions (console only; no notification actions) |

Replace `<region>` and `<account-id>` before applying.

**Least privilege**: the policy covers sending traces and writing the agent's own log group only.
The one-time setup (enabling Transaction Search, setting retention on `aws/spans`, creating metric
filters, the dashboard and alarms) needs broader rights and should be done by an operator, not by the
agent's runtime role. `xray:*` actions do not support resource scoping, hence `"Resource": "*"`.
