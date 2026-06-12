# SPDX-License-Identifier: AGPL-3.0-only
"""Tests for family-aware labels in the HA discovery configs.

Avalon (canaan) has no VR sensor — the driver feeds the air outlet
temperature (OTemp) into ``temp_vr_c`` as a thermal proxy. The discovery
must relabel that one sensor's friendly name for canaan miners while
keeping the entity itself identical (unique_id, topic, value_template),
and leave every other family untouched. Runs under pytest, or
standalone: ``python tests/test_mqtt_discovery_labels.py``.
"""
from __future__ import annotations

import pathlib
import sys
from dataclasses import dataclass

# Make the repo root importable whether invoked via pytest or directly.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from backend.mqtt import discovery_configs  # noqa: E402


@dataclass
class _Cfg:
    base_topic: str = "minerwatch"
    discovery_prefix: str = "homeassistant"
    allow_controls: bool = False


def _vr_sensor(rec: dict) -> dict:
    items = discovery_configs(_Cfg(), rec, None, "aabbccddeeff")
    for topic, payload in items:
        if topic.endswith("/temp_vr/config"):
            return payload
    raise AssertionError("temp_vr discovery config not found")


def test_canaan_vr_sensor_is_relabelled_only() -> None:
    base = _vr_sensor({"name": "Bitaxe", "family": "bitaxe"})
    canaan = _vr_sensor({"name": "Nano 3S", "family": "canaan"})

    assert base["name"] == "VR temp"
    assert canaan["name"] == "Air outlet temp"

    # Everything else must be identical: same entity, same data path.
    for key in ("unique_id", "state_topic", "value_template", "device_class", "unit_of_measurement"):
        assert canaan[key] == base[key], key
    assert canaan["value_template"] == "{{ value_json.temp_vr_c }}"


def test_other_sensors_untouched_for_canaan() -> None:
    items = discovery_configs(_Cfg(), {"name": "Nano 3S", "family": "canaan"}, None, "aabbccddeeff")
    names = {topic.rsplit("/", 2)[-2]: payload["name"] for topic, payload in items}
    assert names["temp_chip"] == "Chip temp"
    assert names["hashrate"] == "Hashrate"


def test_family_case_and_missing_rec_are_safe() -> None:
    assert _vr_sensor({"name": "Q", "family": "Canaan"})["name"] == "Air outlet temp"
    # No record (sample-only discovery) must not crash and keeps the default.
    items = discovery_configs(_Cfg(), None, None, "aabbccddeeff")
    for topic, payload in items:
        if topic.endswith("/temp_vr/config"):
            assert payload["name"] == "VR temp"


if __name__ == "__main__":
    test_canaan_vr_sensor_is_relabelled_only()
    test_other_sensors_untouched_for_canaan()
    test_family_case_and_missing_rec_are_safe()
    print("ok — discovery label tests passed")
