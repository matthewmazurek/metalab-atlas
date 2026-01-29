"""
Aggregation engine: Compute grouped statistics for plot data.

Handles replicate aggregation, error bars, and multiple grouping dimensions.
"""

from __future__ import annotations

import math
from collections import defaultdict
from typing import Any

from atlas.models import (
    AggFn,
    AggregateRequest,
    AggregateResponse,
    DataPoint,
    ErrorBarType,
    RunResponse,
    Series,
)


def get_field_value(run: RunResponse, field_path: str) -> Any:
    """Get a value from a run using dot-notation field path."""
    parts = field_path.split(".", 1)
    if len(parts) != 2:
        return None

    namespace, key = parts

    if namespace == "record":
        return getattr(run.record, key, None)
    elif namespace == "params":
        return run.params.get(key)
    elif namespace == "metrics":
        return run.metrics.get(key)
    elif namespace == "derived":
        return run.derived_metrics.get(key)

    return None


def compute_aggregate(
    runs: list[RunResponse],
    request: AggregateRequest,
) -> AggregateResponse:
    """
    Compute aggregated plot data from runs.

    Groups runs by group_by fields, then aggregates Y values
    for each unique X value within each group.
    """
    # Filter runs that have both X and Y values
    valid_runs = []
    for run in runs:
        x_val = get_field_value(run, request.x_field)
        y_val = get_field_value(run, request.y_field)
        if x_val is not None and y_val is not None:
            try:
                # Ensure Y is numeric
                float(y_val)
                valid_runs.append(run)
            except (TypeError, ValueError):
                continue

    if not valid_runs:
        return AggregateResponse(
            series=[],
            x_field=request.x_field,
            y_field=request.y_field,
            agg_fn=request.agg_fn,
            total_runs=0,
        )

    # Group runs
    groups: dict[str, list[RunResponse]] = defaultdict(list)
    for run in valid_runs:
        if request.group_by:
            group_key = _make_group_key(run, request.group_by)
        else:
            group_key = "all"
        groups[group_key].append(run)

    # Aggregate each group
    series_list = []
    for group_name, group_runs in sorted(groups.items()):
        points = _aggregate_group(
            group_runs,
            request.x_field,
            request.y_field,
            request.replicate_field,
            request.reduce_replicates,
            request.agg_fn,
            request.error_bars,
        )
        if points:
            series_list.append(Series(name=group_name, points=points))

    return AggregateResponse(
        series=series_list,
        x_field=request.x_field,
        y_field=request.y_field,
        agg_fn=request.agg_fn,
        total_runs=len(valid_runs),
    )


def _make_group_key(run: RunResponse, group_by: list[str]) -> str:
    """Create a group key from multiple fields."""
    parts = []
    for field in group_by:
        val = get_field_value(run, field)
        parts.append(str(val) if val is not None else "")
    return " | ".join(parts) if len(parts) > 1 else parts[0]


def _aggregate_group(
    runs: list[RunResponse],
    x_field: str,
    y_field: str,
    replicate_field: str,
    reduce_replicates: bool,
    agg_fn: AggFn,
    error_bars: ErrorBarType,
) -> list[DataPoint]:
    """Aggregate Y values for each X value within a group."""
    # Collect Y values for each X
    x_to_ys: dict[Any, list[tuple[float, str]]] = defaultdict(list)

    for run in runs:
        x_val = get_field_value(run, x_field)
        y_val = get_field_value(run, y_field)

        if x_val is not None and y_val is not None:
            try:
                y_float = float(y_val)
                x_to_ys[x_val].append((y_float, run.record.run_id))
            except (TypeError, ValueError):
                continue

    # Build data points
    points = []
    for x_val, y_runs in sorted(x_to_ys.items(), key=lambda kv: _sort_key(kv[0])):
        y_values = [yr[0] for yr in y_runs]
        run_ids = [yr[1] for yr in y_runs]

        if reduce_replicates and len(y_values) > 1:
            # Aggregate
            y_agg = _compute_agg(y_values, agg_fn)
            y_low, y_high = _compute_error_bounds(y_values, y_agg, error_bars)
            y_min, y_q1, y_median, y_q3, y_max = _compute_quartiles(y_values)

            points.append(
                DataPoint(
                    x=x_val,
                    y=y_agg,
                    y_low=y_low,
                    y_high=y_high,
                    n=len(y_values),
                    run_ids=run_ids,
                    y_min=y_min,
                    y_q1=y_q1,
                    y_median=y_median,
                    y_q3=y_q3,
                    y_max=y_max,
                )
            )
        else:
            # Return individual points
            for y_val, run_id in y_runs:
                points.append(
                    DataPoint(
                        x=x_val,
                        y=y_val,
                        y_low=None,
                        y_high=None,
                        n=1,
                        run_ids=[run_id],
                        y_min=y_val,
                        y_q1=y_val,
                        y_median=y_val,
                        y_q3=y_val,
                        y_max=y_val,
                    )
                )

    return points


def _sort_key(x: Any) -> tuple:
    """Create a sort key that handles mixed types."""
    if isinstance(x, (int, float)):
        return (0, x)
    return (1, str(x))


def _compute_agg(values: list[float], agg_fn: AggFn) -> float:
    """Compute aggregation function over values."""
    if not values:
        return 0.0

    if agg_fn == AggFn.MEAN:
        return sum(values) / len(values)
    elif agg_fn == AggFn.MEDIAN:
        sorted_vals = sorted(values)
        n = len(sorted_vals)
        if n % 2 == 1:
            return sorted_vals[n // 2]
        else:
            return (sorted_vals[n // 2 - 1] + sorted_vals[n // 2]) / 2
    elif agg_fn == AggFn.MIN:
        return min(values)
    elif agg_fn == AggFn.MAX:
        return max(values)
    elif agg_fn == AggFn.COUNT:
        return float(len(values))
    elif agg_fn == AggFn.SUM:
        return sum(values)

    return sum(values) / len(values)  # Default to mean


def _compute_error_bounds(
    values: list[float],
    center: float,
    error_bars: ErrorBarType,
) -> tuple[float | None, float | None]:
    """Compute error bounds around the center value."""
    if error_bars == ErrorBarType.NONE or len(values) < 2:
        return None, None

    n = len(values)
    mean = sum(values) / n
    variance = sum((x - mean) ** 2 for x in values) / (n - 1)
    std = math.sqrt(variance) if variance > 0 else 0

    if error_bars == ErrorBarType.STD:
        return center - std, center + std
    elif error_bars == ErrorBarType.SEM:
        sem = std / math.sqrt(n)
        return center - sem, center + sem
    elif error_bars == ErrorBarType.CI95:
        # Approximate 95% CI using t-distribution (1.96 for large n)
        t_value = 1.96 if n > 30 else _t_value_95(n - 1)
        margin = t_value * std / math.sqrt(n)
        return center - margin, center + margin

    return None, None


def _compute_quartiles(
    values: list[float],
) -> tuple[float, float, float, float, float]:
    """Compute quartiles (min, q1, median, q3, max) for distribution visualization."""
    sorted_vals = sorted(values)
    n = len(sorted_vals)

    if n == 0:
        return (0.0, 0.0, 0.0, 0.0, 0.0)

    if n == 1:
        v = sorted_vals[0]
        return (v, v, v, v, v)

    y_min = sorted_vals[0]
    y_max = sorted_vals[-1]

    # Median
    if n % 2 == 1:
        y_median = sorted_vals[n // 2]
    else:
        y_median = (sorted_vals[n // 2 - 1] + sorted_vals[n // 2]) / 2

    # Q1 (25th percentile) - median of lower half
    lower_half = sorted_vals[: n // 2]
    if len(lower_half) == 0:
        y_q1 = y_min
    elif len(lower_half) % 2 == 1:
        y_q1 = lower_half[len(lower_half) // 2]
    else:
        y_q1 = (
            lower_half[len(lower_half) // 2 - 1] + lower_half[len(lower_half) // 2]
        ) / 2

    # Q3 (75th percentile) - median of upper half
    upper_half = sorted_vals[(n + 1) // 2 :]
    if len(upper_half) == 0:
        y_q3 = y_max
    elif len(upper_half) % 2 == 1:
        y_q3 = upper_half[len(upper_half) // 2]
    else:
        y_q3 = (
            upper_half[len(upper_half) // 2 - 1] + upper_half[len(upper_half) // 2]
        ) / 2

    return (y_min, y_q1, y_median, y_q3, y_max)


def _t_value_95(df: int) -> float:
    """Approximate t-value for 95% CI given degrees of freedom."""
    # Simplified lookup for small df
    t_table = {
        1: 12.71,
        2: 4.30,
        3: 3.18,
        4: 2.78,
        5: 2.57,
        6: 2.45,
        7: 2.36,
        8: 2.31,
        9: 2.26,
        10: 2.23,
        15: 2.13,
        20: 2.09,
        25: 2.06,
        30: 2.04,
    }
    if df in t_table:
        return t_table[df]
    # Interpolate or use large-sample approximation
    if df > 30:
        return 1.96
    # Find closest
    for k in sorted(t_table.keys()):
        if k >= df:
            return t_table[k]
    return 1.96
