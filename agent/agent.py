"""AgentCore entrypoint. Serves POST /invocations on :8080 for the backend.

Request {prompt, session_id} -> response {reply, intent}. Answers come from the local
wealth agent (Strands + Ollama, see specs/005-wealth-agent). Conversation history is kept
in-process per session_id and lost on restart.
"""

import sys
from pathlib import Path

from bedrock_agentcore.runtime import BedrockAgentCoreApp

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from wealth_agent.agent import ask, build_agent  # noqa: E402
from wealth_agent.model import build_model  # noqa: E402
from wealth_agent.telemetry import configure_tracing  # noqa: E402

# TRACING_MODE (off unless set). A TracingConfigError stops startup on purpose: unsafe content
# capture must never run. Must happen before the first agent is built.
configure_tracing()

app = BedrockAgentCoreApp()
_sessions = {}


def _agent_for(session_id):
    if session_id not in _sessions:
        _sessions[session_id] = build_agent(build_model(), quiet=True)
    return _sessions[session_id]


@app.entrypoint
def invoke(payload):
    prompt = payload.get("prompt", "")
    session_id = payload.get("session_id") or "default"
    # TODO: intent classification
    return {"reply": ask(_agent_for(session_id), prompt, session_id=session_id), "intent": None}


if __name__ == "__main__":
    app.run()
