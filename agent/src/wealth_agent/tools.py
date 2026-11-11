"""Tool handlers with code-level validation, plus Strands `@tool` wrappers.

Handlers take a dict of arguments and always return `{ok: True, ...}` or
`{ok: False, error}`; they never raise (FR-003). All tools are read-only (FR-004).
"""

from __future__ import annotations

import math
from collections.abc import Callable
from typing import Any

from strands import tool

from wealth_agent import portfolio as pf
from wealth_agent.guardrails import GR_TOOL_INPUT, record_check

# Bounds (FR-003)
INITIAL_MAX = 1e9
MONTHLY_MAX = 1e7
RETURN_MIN, RETURN_MAX = -20.0, 20.0
YEARS_MIN, YEARS_MAX = 1, 60
TOLERANCE_MIN, TOLERANCE_MAX = 0.0, 50.0
DEFAULT_TOLERANCE = 5.0


class ToolInputError(ValueError):
    pass


def _number(args: dict, key: str, lo: float, hi: float) -> float:
    if key not in args:
        raise ToolInputError(f"missing argument: {key}")
    value = args[key]
    if isinstance(value, bool) or value is None:
        raise ToolInputError(f"{key} must be a number")
    if isinstance(value, str):
        try:
            value = float(value.strip())
        except ValueError:
            raise ToolInputError(f"{key} must be a number") from None
    if not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ToolInputError(f"{key} must be a finite number")
    if not lo <= value <= hi:
        raise ToolInputError(f"{key} must be between {lo:g} and {hi:g}")
    return float(value)


def _integer(args: dict, key: str, lo: int, hi: int) -> int:
    value = _number(args, key, lo, hi)
    if not value.is_integer():
        raise ToolInputError(f"{key} must be a whole number")
    return int(value)


def _check_args(args: Any, allowed: set[str]) -> dict:
    if not isinstance(args, dict):
        raise ToolInputError("arguments must be an object")
    unknown = set(args) - allowed
    if unknown:
        raise ToolInputError(f"unknown argument(s): {', '.join(sorted(unknown))}")
    return args


def _record_tool_outcome(name: str, result: dict) -> None:
    """GR-TOOL-INPUT (spec 010): the validation outcome, on the current tool span and turn."""
    if result.get("ok"):
        record_check(
            GR_TOOL_INPUT, "pass", "arguments accepted", "allow", name, span_attributes=True
        )
    else:
        reason = str(result.get("error", "tool returned an error"))
        record_check(GR_TOOL_INPUT, "fail", reason, "return_error", name, span_attributes=True)


def _safe(fn: Callable[[Any], dict]) -> Callable[[Any], dict]:
    tool_name = fn.__name__.removeprefix("handle_")

    def wrapper(args: Any) -> dict:
        try:
            result = {"ok": True, **fn(args)}
        except ToolInputError as exc:
            result = {"ok": False, "error": str(exc)}
        except pf.PortfolioDataError:
            result = {"ok": False, "error": "portfolio data is unavailable"}
        except Exception:  # noqa: BLE001 - tools must never raise to the agent
            result = {"ok": False, "error": "internal error"}
        _record_tool_outcome(tool_name, result)  # never raises
        return result

    wrapper.__name__ = fn.__name__
    return wrapper


@_safe
def handle_get_holdings(args: Any) -> dict:
    _check_args(args, set())
    return pf.holdings_with_values(pf.load_portfolio())


@_safe
def handle_get_allocation(args: Any) -> dict:
    _check_args(args, set())
    return pf.allocation(pf.load_portfolio())


@_safe
def handle_get_rebalancing_summary(args: Any) -> dict:
    args = _check_args(args, {"tolerance_pct"})
    tolerance = DEFAULT_TOLERANCE
    if args.get("tolerance_pct") is not None:
        tolerance = _number(args, "tolerance_pct", TOLERANCE_MIN, TOLERANCE_MAX)
    return pf.rebalancing_summary(pf.load_portfolio(), tolerance_pct=tolerance)


PROJECTION_ARGS = {"initial_amount", "monthly_contribution", "annual_return_pct", "years"}


@_safe
def handle_project_savings(args: Any) -> dict:
    args = _check_args(args, PROJECTION_ARGS)
    return pf.project_savings(
        initial_amount=_number(args, "initial_amount", 0, INITIAL_MAX),
        monthly_contribution=_number(args, "monthly_contribution", 0, MONTHLY_MAX),
        annual_return_pct=_number(args, "annual_return_pct", RETURN_MIN, RETURN_MAX),
        years=_integer(args, "years", YEARS_MIN, YEARS_MAX),
    )


# --- Strands wrappers ----------------------------------------------------------
# Typed loosely (float | str) so validation happens in the handlers above, in code.


@tool
def get_holdings() -> dict:
    """List the user's current holdings with quantity, price and market value, and the
    total portfolio value. Use for questions about what the user owns or is worth."""
    return handle_get_holdings({})


@tool
def get_allocation() -> dict:
    """Show the portfolio split by asset class (us_equity, intl_equity, bonds, cash):
    value, current percent, target percent and drift from target."""
    return handle_get_allocation({})


@tool
def get_rebalancing_summary(tolerance_pct: float | None = None) -> dict:
    """Informational summary of how much each asset class would need to increase or
    decrease to return to target allocation. Does not place any orders.

    Args:
        tolerance_pct: Allowed drift in percentage points before rebalancing is
            suggested (0-50). Defaults to 5.
    """
    return handle_get_rebalancing_summary({"tolerance_pct": tolerance_pct})


@tool
def project_savings(
    initial_amount: float,
    monthly_contribution: float,
    annual_return_pct: float,
    years: int,
) -> dict:
    """Project the future value of savings with monthly compounding.

    Args:
        initial_amount: Starting amount (0 to 1,000,000,000).
        monthly_contribution: Amount added each month (0 to 10,000,000).
        annual_return_pct: Expected annual return in percent, e.g. 6 for 6% (-20 to 20).
        years: Number of whole years (1 to 60).
    """
    return handle_project_savings(
        {
            "initial_amount": initial_amount,
            "monthly_contribution": monthly_contribution,
            "annual_return_pct": annual_return_pct,
            "years": years,
        }
    )


STRANDS_TOOLS = [get_holdings, get_allocation, get_rebalancing_summary, project_savings]
