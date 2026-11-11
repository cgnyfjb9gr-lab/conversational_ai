"""Tests for tool argument validation and handler shapes (FR-003, FR-004)."""

import pytest

from wealth_agent.tools import (
    STRANDS_TOOLS,
    handle_get_allocation,
    handle_get_holdings,
    handle_get_rebalancing_summary,
    handle_project_savings,
)

GOOD_PROJECTION = {
    "initial_amount": 10000,
    "monthly_contribution": 500,
    "annual_return_pct": 6,
    "years": 20,
}


def test_holdings_handler_ok():
    out = handle_get_holdings({})
    assert out["ok"] is True
    assert out["total_value"] == 70000.0
    assert out["currency"] == "USD"


def test_allocation_handler_ok():
    out = handle_get_allocation({})
    assert out["ok"] is True
    assert len(out["by_asset_class"]) == 4


def test_rebalancing_default_tolerance():
    out = handle_get_rebalancing_summary({})
    assert out["ok"] is True
    assert out["within_tolerance"] is False


def test_projection_handler_ok():
    out = handle_project_savings(GOOD_PROJECTION)
    assert out["ok"] is True
    assert out["total_contributed"] == 130000.0


def test_numeric_strings_are_accepted():
    # Small local models often send numbers as strings.
    args = {k: str(v) for k, v in GOOD_PROJECTION.items()}
    assert handle_project_savings(args)["ok"] is True


@pytest.mark.parametrize(
    "override",
    [
        {"annual_return_pct": 25},
        {"annual_return_pct": -21},
        {"years": 0},
        {"years": 61},
        {"years": 2.5},
        {"initial_amount": -1},
        {"initial_amount": 2e9},
        {"monthly_contribution": 2e7},
        {"monthly_contribution": "lots"},
        {"initial_amount": True},
        {"years": None},
        {"annual_return_pct": float("nan")},
    ],
)
def test_projection_rejects_invalid(override):
    out = handle_project_savings({**GOOD_PROJECTION, **override})
    assert out["ok"] is False
    assert isinstance(out["error"], str) and out["error"]


def test_projection_missing_argument():
    args = dict(GOOD_PROJECTION)
    args.pop("years")
    assert handle_project_savings(args)["ok"] is False


@pytest.mark.parametrize(
    "handler, args",
    [
        (handle_get_holdings, {"account": "other"}),
        (handle_get_allocation, {"x": 1}),
        (handle_get_rebalancing_summary, {"execute": True}),
        (handle_project_savings, {**GOOD_PROJECTION, "transfer_to": "123"}),
    ],
)
def test_unknown_arguments_rejected(handler, args):
    out = handler(args)
    assert out["ok"] is False
    assert "unknown" in out["error"].lower()


@pytest.mark.parametrize("tolerance", [-1, 51, "abc"])
def test_rebalancing_rejects_bad_tolerance(tolerance):
    assert handle_get_rebalancing_summary({"tolerance_pct": tolerance})["ok"] is False


@pytest.mark.parametrize(
    "handler",
    [
        handle_get_holdings,
        handle_get_allocation,
        handle_get_rebalancing_summary,
        handle_project_savings,
    ],
)
@pytest.mark.parametrize("args", [None, "not a dict", [1, 2]])
def test_handlers_never_raise(handler, args):
    out = handler(args)
    assert out["ok"] is False


# --- FR-004: no side-effect tools ---------------------------------------------

FORBIDDEN = ("trade", "order", "buy", "sell", "transfer", "withdraw", "deposit", "execute")


def tool_spec(t):
    return t.tool_spec


def test_registered_tools_are_exactly_the_read_only_set():
    names = sorted(tool_spec(t)["name"] for t in STRANDS_TOOLS)
    assert names == ["get_allocation", "get_holdings", "get_rebalancing_summary", "project_savings"]


def test_no_tool_name_implies_side_effects():
    for t in STRANDS_TOOLS:
        name = tool_spec(t)["name"].lower()
        assert not any(word in name for word in FORBIDDEN), name


def test_strands_wrappers_return_handler_output():
    by_name = {tool_spec(t)["name"]: t for t in STRANDS_TOOLS}
    out = by_name["project_savings"](**GOOD_PROJECTION)
    assert out["ok"] is True


# --- Tracing (spec 010) --------------------------------------------------------------------------

from wealth_agent.guardrails import GR_TOOL_INPUT, bind_guardrails  # noqa: E402


def test_tool_guardrail_pass():
    with bind_guardrails() as turn:
        handle_get_holdings({})
    (check,) = turn.checks
    assert (check.rule_id, check.result, check.action) == (GR_TOOL_INPUT, "pass", "allow")
    assert check.tool_name == "get_holdings"


def test_tool_guardrail_fail_keeps_the_existing_error():
    with bind_guardrails() as turn:
        result = handle_project_savings(
            {"initial_amount": 1, "monthly_contribution": 1, "annual_return_pct": 5, "years": 0}
        )
    (check,) = turn.checks
    assert result["ok"] is False
    assert (check.result, check.action) == ("fail", "return_error")
    assert check.reason == result["error"]
    assert check.tool_name == "project_savings"


def test_handlers_outside_a_turn_are_unaffected():
    assert handle_get_holdings({})["ok"] is True
    assert handle_project_savings({})["ok"] is False
