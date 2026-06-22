# SPDX-License-Identifier: AGPL-3.0-only
"""Payload builder for the read-only panel feed ``GET /api/panel``.

A constrained external display (the ESPHome "Monolith" panel) polls this
endpoint and renders the numbers it returns; it performs no calculations of
its own. Like ``halo`` and ``umbrel_widgets``, the logic is a pure function of
plain inputs (miner rows, live poller samples, optional BTC/ambient data) so it
unit-tests without FastAPI, the DB or any transport.

This is the same consolidated single-topic blob that the (legacy, optional)
MQTT publisher shipped on ``minerwatch/panel`` — extracted here so the panel can
read it over HTTP with no broker in the middle. The JSON shape is byte-for-byte
identical to the old MQTT feed, so the firmware's parser is unchanged.
"""
from __future__ import annotations

import re
from typing import Any

from .miners.base import MinerSample


def sanitize_mac(mac: Any, miner_id: Any) -> str:
    """Return a stable identifier-safe id derived from the MAC.

    Components must match ``[a-zA-Z0-9_-]``; MAC colons are stripped. Falls
    back to ``mw<db_id>`` when no MAC is known. Used as each miner's ``id`` in
    the feed and as the key the custom display order (``db.get_miner_order``)
    refers to.
    """
    if mac:
        cleaned = re.sub(r"[^0-9a-zA-Z]", "", str(mac)).lower()
        if cleaned:
            return cleaned
    return f"mw{miner_id}"


def _num(value: Any) -> float | None:
    """Coerce to a rounded float for the compact panel feed, else None."""
    try:
        return None if value is None else round(float(value), 2)
    except (TypeError, ValueError):
        return None


PANEL_MAX_TEMPS = 8  # the rotating temperature row never shows more than this


def _temp1(value: Any) -> float | None:
    """Round an ambient reading to one decimal (panel / dashboard convention)."""
    try:
        return None if value is None else round(float(value), 1)
    except (TypeError, ValueError):
        return None


def _temps_block(temps: list[dict] | None) -> list[dict[str, Any]]:
    """Shape ambient sensors into the panel's terse, rotating ``temps`` list.

    Each input row carries the neutral ``AmbientSnapshot`` fields
    (``name`` / ``current_c`` / ``min_c`` / ``max_c``); the output uses short
    keys so the payload stays small on an ESP32: ``n`` (room name), ``c``
    (current, ``null`` when the sensor is stale), ``mn`` / ``mx`` (session
    min/max). Capped at ``PANEL_MAX_TEMPS`` — the firmware rotates one row
    through them and a wall panel never needs dozens. The caller omits the whole
    block when this is empty, so the panel hides the temperature row.
    """
    if not temps:
        return []
    out: list[dict[str, Any]] = []
    for row in temps[:PANEL_MAX_TEMPS]:
        out.append(
            {
                "n": row.get("name") or "",
                "c": _temp1(row.get("current_c")),
                "mn": _temp1(row.get("min_c")),
                "mx": _temp1(row.get("max_c")),
            }
        )
    return out


def device_block(rec: dict | None, sample: MinerSample | None, mac_id: str) -> dict[str, Any]:
    """Resolve a miner's display name + model the same way HA discovery did.

    The panel feed only reads ``name`` and ``model`` from this block; the extra
    keys are kept so the resolution logic stays identical to the historical
    behaviour (and so a future consumer could reuse the whole block).
    """
    name = None
    if rec:
        name = rec.get("name")
    if not name and sample is not None:
        name = getattr(sample, "hostname", None)
    name = name or mac_id

    model = None
    if sample is not None:
        model = sample.model or getattr(sample, "chip_model", None)
    if not model and rec:
        model = rec.get("model") or rec.get("family")

    sw = getattr(sample, "firmware_version", None) if sample is not None else None

    block: dict[str, Any] = {
        "identifiers": [f"minerwatch_{mac_id}"],
        "name": name,
        "manufacturer": "MinerWatch",
        "model": model or "miner",
        "via_device": "minerwatch_bridge",
    }
    if sw:
        block["sw_version"] = sw
    return block


def panel_feed(
    miners: list[dict],
    samples: dict[int, MinerSample],
    btc_usd: float | None = None,
    btc_at: str | None = None,
    btc_chg: float | None = None,
    temps: list[dict] | None = None,
    order: list[str] | None = None,
) -> dict[str, Any]:
    """Consolidated single blob for a constrained display (ESPHome panel).

    One compact JSON object, one entry per miner, with name/model resolved the
    same way as HA discovery. Lets the panel use a SINGLE request and adapt to
    the fleet automatically. Keys are short to keep the payload small for an
    ESP32: id, name, ip, model, hr (TH/s), pw (W), tp (chip C), vr (VR C),
    on (online bool).

    Optionally carries Bitcoin data for the panel's price screen: ``btc_usd``
    (integer USD), ``btc_chg`` (signed 24h change %, 2 decimals), and ``btc_at``
    (a preformatted date stamp like "Tue 2 Jun, 05:52" in the server's local
    time, 24h). Each is omitted when unavailable, so the panel just shows "--"
    until it arrives. Formatting the stamp server-side keeps the firmware free
    of any clock/timezone setup.

    ``temps`` is the list of ambient sensors for the panel's rotating
    temperature row — one ``AmbientSnapshot``-shaped dict each. It is emitted as
    ``temps`` with short per-row keys (see ``_temps_block``); when the list is
    empty the key is omitted entirely, so the panel hides the temperature row
    and its detail page.

    ``order`` is the user's custom display order: a list of sanitized-MAC ids
    (see ``sanitize_mac`` / ``db.get_miner_order``). The firmware draws cards in
    array order (and truncates at 16), so permuting here is all it takes to
    reorder the panel — no firmware change, no payload change. Miners named in
    ``order`` come first, in that order; everyone else (new miners, miners never
    arranged) follows in the incoming order. Stale ids of removed miners are
    skipped harmlessly. ``None`` or an empty list reproduces the default output.
    """
    if order:
        pos = {mac_id: i for i, mac_id in enumerate(order)}
        ranked: list[tuple[int, dict]] = []
        rest: list[dict] = []
        for rec in miners:
            rank = pos.get(sanitize_mac(rec.get("mac"), rec.get("id")))
            if rank is None:
                rest.append(rec)
            else:
                ranked.append((rank, rec))
        ranked.sort(key=lambda t: t[0])
        miners = [rec for _, rec in ranked] + rest

    out: list[dict[str, Any]] = []
    for rec in miners:
        mac_id = sanitize_mac(rec.get("mac"), rec.get("id"))
        sample = samples.get(int(rec["id"])) if rec.get("id") is not None else None
        dev = device_block(rec, sample, mac_id)
        ip = (
            getattr(sample, "host", None)
            or rec.get("host") or rec.get("ip") or rec.get("address") or ""
        )
        out.append(
            {
                "id": mac_id,
                "name": dev.get("name") or mac_id,
                "ip": ip,
                "model": dev.get("model") or "",
                "hr": _num(getattr(sample, "hashrate_ths", None)),
                "pw": _num(getattr(sample, "power_w", None)),
                "tp": _num(getattr(sample, "temp_chip_c", None)),
                "vr": _num(getattr(sample, "temp_vr_c", None)),
                "on": bool(sample and getattr(sample, "online", False)),
            }
        )
    blob: dict[str, Any] = {"miners": out}
    if btc_usd is not None:
        blob["btc_usd"] = round(float(btc_usd))
        if btc_chg is not None:
            blob["btc_chg"] = round(float(btc_chg), 2)
        if btc_at:
            blob["btc_at"] = btc_at
    rooms = _temps_block(temps)
    if rooms:
        blob["temps"] = rooms
    return blob
