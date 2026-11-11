"""A scripted Strands model for tests: no Ollama, no network."""

import json
from collections.abc import AsyncGenerator
from typing import Any

from strands.models.model import Model

_USAGE = {
    "metadata": {
        "usage": {"inputTokens": 3, "outputTokens": 2, "totalTokens": 5},
        "metrics": {"latencyMs": 1},
    }
}


def text(answer: str) -> tuple:
    return ("text", answer)


def tool_call(name: str, arguments: dict) -> tuple:
    return ("tool", name, arguments)


class ScriptedModel(Model):
    """Replays one scripted step per model call (a tool call, then a text answer, ...)."""

    def __init__(self, *steps: tuple):
        self.steps = list(steps)
        self.calls = 0

    def update_config(self, **model_config: Any) -> None:
        pass

    def get_config(self) -> Any:
        return {"model_id": "scripted-stub"}

    async def structured_output(
        self, *args: Any, **kwargs: Any
    ) -> AsyncGenerator[dict[str, Any], None]:
        raise NotImplementedError
        yield {}  # pragma: no cover

    async def stream(
        self, messages, tool_specs=None, system_prompt=None, **kwargs
    ) -> AsyncGenerator[dict, None]:
        step = self.steps[min(self.calls, len(self.steps) - 1)]
        self.calls += 1
        if step[0] == "text":
            yield {"messageStart": {"role": "assistant"}}
            yield {"contentBlockStart": {"start": {}}}
            yield {"contentBlockDelta": {"delta": {"text": step[1]}}}
            yield {"contentBlockStop": {}}
            yield {"messageStop": {"stopReason": "end_turn"}}
        else:
            yield {"messageStart": {"role": "assistant"}}
            tool_use = {"name": step[1], "toolUseId": f"tool-{self.calls}"}
            yield {"contentBlockStart": {"start": {"toolUse": tool_use}}}
            yield {"contentBlockDelta": {"delta": {"toolUse": {"input": json.dumps(step[2])}}}}
            yield {"contentBlockStop": {}}
            yield {"messageStop": {"stopReason": "tool_use"}}
        yield _USAGE
