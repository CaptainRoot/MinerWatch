# SPDX-License-Identifier: AGPL-3.0-only
"""Tests for the stored ambient (room) temperature time-series.

Covers backend/db.py: the per-cycle insert, the 1-minute and 1-hour
rollups, the tier routing shared with the per-miner metrics (so the
History "Temperature" overlay lines up with the chip/VR series), and the
tiered retention sweep reaching the ambient tables too.

Runs against a throwaway SQLite file via a patched ``db_path``, so the
real data directory is never touched. Runs under pytest, or standalone:
``python tests/test_ambient_history.py``.
"""
from __future__ import annotations

import asyncio
import pathlib
import sys
import tempfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from backend import db  # noqa: E402

_TMP = tempfile.TemporaryDirectory(prefix="mw-test-ambient-")


def _use_fresh_db(name: str) -> None:
    """Point the db module at a brand-new SQLite file (one per test)."""
    db.db_path = lambda: pathlib.Path(_TMP.name) / f"{name}.db"


def _aligned_base() -> int:
    """An hour-aligned timestamp two hours in the past, so every sample we
    insert falls inside *closed* minute/hour buckets the rollups will pick
    up (they deliberately skip the current, still-filling bucket)."""
    return ((db.now_ts() // 3600) * 3600) - 7200


async def _seed_raw(base: int, count: int = 21, step: int = 30) -> list[float]:
    """Insert ``count`` samples ``step`` seconds apart, triangular 20→24→20."""
    vals: list[float] = []
    for i in range(count):
        v = round(20.0 + abs((i % 8) - 4) * 0.5, 1)
        vals.append(v)
        await db.insert_ambient_metric(base + i * step, v)
    return vals


def test_insert_and_raw_range():
    _use_fresh_db("raw")

    async def run():
        await db.init_db()
        base = _aligned_base()
        vals = await _seed_raw(base)

        rows, tier = await db.ambient_metrics_range(base, base + 600)  # span 600s
        assert tier == "metrics"               # raw tier for short ranges
        assert len(rows) == len(vals)
        assert set(rows[0].keys()) == {"ts", "temp_c"}
        assert rows[0]["ts"] < rows[-1]["ts"]  # ascending
        assert {r["temp_c"] for r in rows} <= set(vals)

    asyncio.run(run())


def test_rollup_1m_and_1h():
    _use_fresh_db("rollup")

    async def run():
        await db.init_db()
        base = _aligned_base()
        vals = await _seed_raw(base)

        rolled_1m = await db.rollup_ambient_to_1m(now=base + 3600, lookback_seconds=3600)
        rolled_1h = await db.rollup_ambient_to_1h(now=base + 7200, lookback_seconds=7200)
        assert rolled_1m >= 1 and rolled_1h >= 1

        m1, t_1m = await db.ambient_metrics_range(base, base + 7200)        # span 2h → 1m
        h1, t_1h = await db.ambient_metrics_range(base - 100_000, base + 7200)  # big → 1h
        assert t_1m == "metrics_1m" and len(m1) >= 1
        assert t_1h == "metrics_1h" and len(h1) >= 1

        lo, hi = min(vals), max(vals)
        assert lo <= m1[0]["temp_c"] <= hi   # bucket average within envelope
        assert lo <= h1[0]["temp_c"] <= hi

    asyncio.run(run())


def test_range_tier_routing():
    _use_fresh_db("routing")

    async def run():
        await db.init_db()
        base = _aligned_base()
        # Tier is chosen purely by span (mirrors _pick_metrics_tier), so it
        # holds even with no rows present.
        _, t_raw = await db.ambient_metrics_range(base, base + 3600)
        _, t_1m = await db.ambient_metrics_range(base, base + 86_400)
        _, t_1h = await db.ambient_metrics_range(base, base + 86_401)
        assert (t_raw, t_1m, t_1h) == ("metrics", "metrics_1m", "metrics_1h")

    asyncio.run(run())


def test_cleanup_covers_ambient():
    _use_fresh_db("cleanup")

    async def run():
        await db.init_db()
        # One ancient raw sample (well past the 48h raw window) must be swept.
        old_ts = db.now_ts() - 10 * 24 * 3600
        await db.insert_ambient_metric(old_ts, 21.0)

        deleted = await db.cleanup_tiered(
            retention_raw_hours=48, retention_1m_days=30, retention_1h_days=730,
        )
        for key in ("ambient_metrics", "ambient_metrics_1m", "ambient_metrics_1h"):
            assert key in deleted
        assert deleted["ambient_metrics"] >= 1

        rows, _ = await db.ambient_metrics_range(old_ts - 60, old_ts + 60)
        assert rows == []  # pruned

    asyncio.run(run())


if __name__ == "__main__":
    failures = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"PASS {name}")
            except AssertionError as exc:
                failures += 1
                print(f"FAIL {name}: {exc}")
    sys.exit(1 if failures else 0)
