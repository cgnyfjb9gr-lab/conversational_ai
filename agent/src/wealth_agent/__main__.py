"""Interactive CLI: `python -m wealth_agent` (requires a local Ollama server)."""

from __future__ import annotations

import sys

from wealth_agent.agent import ask, build_agent
from wealth_agent.model import build_model
from wealth_agent.prompts import PROMPT_VERSION
from wealth_agent.telemetry import TracingConfigError, configure_tracing, new_local_session_id


def main() -> int:
    try:
        configure_tracing()  # TRACING_MODE; off unless set. Must run before the agent is built.
    except TracingConfigError as exc:
        print(f"error> tracing configuration refused: {exc}", file=sys.stderr)
        return 2
    session_id = new_local_session_id()
    agent = build_agent(build_model(), quiet=True)
    print(f"Wealth agent (demo data, prompt {PROMPT_VERSION}). Type 'exit' to quit.")
    while True:
        try:
            text = input("\nyou> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return 0
        if text.lower() in {"exit", "quit"}:
            return 0
        if not text:
            continue
        try:
            print(f"\nagent> {ask(agent, text, session_id=session_id)}")
        except Exception as exc:  # noqa: BLE001 - keep the REPL alive, show a short reason
            print(
                f"\nerror> model call failed ({type(exc).__name__}). Is Ollama running?",
                file=sys.stderr,
            )


if __name__ == "__main__":
    sys.exit(main())
