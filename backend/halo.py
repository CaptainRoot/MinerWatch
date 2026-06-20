# SPDX-License-Identifier: AGPL-3.0-only
"""Payload builder for the read-only fleet endpoint ``GET /api/halo``.

An external display device polls this endpoint and renders the numbers
it returns; it performs no calculations of its own, so every field is
computed here. Like ``umbrel_widgets``, the logic is a pure function of
plain inputs (miner rows, live poller samples, best-record dicts) so it
unit-tests without FastAPI or the DB. The one deliberate exception is the
``share_seq`` counter, which must remember its previous value across
calls — documented at :func:`_advance_share_seq`.
"""
from __future__ import annotations

from typing import Any, Mapping

# Lower bound of the log scale: the pool's minimum share difficulty. A
# constant is fine here — pool floors don't move much and the consumer
# only needs a sane lower bound.
DEFAULT_FLOOR_DIFF = 1000.0

# Last-resort upper bound, used only when no miner reports a live network
# difficulty AND the cached BTC lookup is also empty. Picked to be in the
# right order of magnitude; a real value from stratum replaces it the
# moment any miner reports one.
DEFAULT_NET_DIFF = 1.2e14


# ---------------------------------------------------------------------------
# share_seq — monotonic "new share" counter
# ---------------------------------------------------------------------------
# The consumer redraws whenever ``share_seq`` changes, so the value must
# be monotonic (it may never travel backwards) and should tick on every
# accepted share. We derive it from the fleet-wide sum of each miner's
# cumulative accepted-share counter. That sum normally only grows, but a
# single miner rebooting resets its counter to zero, which would make the
# naive sum jump *down* and break the "never backwards" rule.
#
# So we keep a running accumulator: add only the positive deltas of the
# raw sum, ignore the dips. A reboot therefore pauses the counter for a
# moment and it resumes the instant new shares arrive, without ever
# rewinding. The state is per-process — the same lifetime as the
# ``poller.last_results`` snapshot that feeds it (MinerWatch runs a single
# app process) — and a restart simply re-seeds the baseline, which is
# harmless because the consumer only cares that the number changed.
_seq_state: dict[str, int] = {"accum": 0, "last_raw": 0}


def _advance_share_seq(raw_accepted_sum: int) -> int:
    """Fold a fresh fleet-wide accepted-share sum into the monotonic counter."""
    delta = raw_accepted_sum - _seq_state["last_raw"]
    if delta > 0:
        _seq_state["accum"] += delta
    _seq_state["last_raw"] = raw_accepted_sum
    return _seq_state["accum"]


def reset_share_seq() -> None:
    """Reset the share_seq accumulator. Test-only helper."""
    _seq_state["accum"] = 0
    _seq_state["last_raw"] = 0


def _num(value: Any) -> float | None:
    """Best-effort float; ``None`` for missing or unparseable values."""
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def build_halo_payload(
    miners: list[Mapping[str, Any]],
    samples: Mapping[int, Any],
    best: Mapping[str, Any],
    top_records: list[Mapping[str, Any]],
    latest_share: Mapping[str, Any] | None,
    net_diff_fallback: float | None,
    floor: float = DEFAULT_FLOOR_DIFF,
) -> dict[str, Any]:
    """Build the exact JSON object the ``/api/halo`` consumer expects.

    ``miners``         enabled miner rows (``db.list_miners(only_enabled=True)``)
    ``samples``        poller live snapshot, keyed by miner id (``poller.last_results``)
    ``best``           ``db.get_fleet_best_records()`` → ``{"session":…, "alltime":…}``
    ``top_records``    ``db.get_fleet_best_records_ranked("alltime", 3)``
    ``latest_share``   fleet-wide most recent notable share, or ``None``
    ``net_diff_fallback`` cached BTC network difficulty, used only when no
                          miner reports a live one (never triggers a fetch)
    """
    total_ths = 0.0
    online_count = 0
    accepted_sum = 0
    net_live: float | None = None

    for m in miners:
        sample = samples.get(m["id"])
        if not (sample and getattr(sample, "online", False)):
            continue
        online_count += 1
        # hashrate_ths is already TH/s in the poller sample — no unit
        # conversion needed (the metrics table stores the same TH/s value).
        hr = _num(getattr(sample, "hashrate_ths", None))
        if hr is not None:
            total_ths += hr
        acc = getattr(sample, "accepted", None)
        if acc is not None:
            try:
                accepted_sum += int(acc)
            except (TypeError, ValueError):
                pass
        nd = _num(getattr(sample, "network_difficulty", None))
        if nd and (net_live is None or nd > net_live):
            net_live = nd

    net_diff = net_live or _num(net_diff_fallback) or DEFAULT_NET_DIFF

    session = best.get("session") or {}
    alltime = best.get("alltime") or {}
    best_diff = _num(session.get("value")) or 0.0
    best_alltime = _num(alltime.get("value")) or best_diff

    top = [_num(r.get("value")) or 0.0 for r in (top_records or [])][:3]
    top += [0.0] * (3 - len(top))

    if latest_share:
        last_diff = _num(latest_share.get("share_difficulty")) or best_diff
        miner_name = str(latest_share.get("name") or "—")
    else:
        last_diff = best_diff
        miner_name = str(session.get("miner_name") or "—")

    return {
        "last_diff": last_diff,
        "best_diff": best_diff,
        "best_alltime": best_alltime,
        "net_diff": net_diff,
        "floor": float(floor),
        "top": top,
        "miner": miner_name,
        "ths": round(total_ths, 3),
        "miners": online_count,
        "online": online_count > 0,
        "share_seq": _advance_share_seq(accepted_sum),
    }
