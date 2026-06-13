# SPDX-License-Identifier: AGPL-3.0-only
"""Driver for the BitForge family (BitForge Nano).

The BitForge Nano is a dual-BM1370 home miner by WantClue
(hardware: https://github.com/WantClueTechnologies/BitForge-Nano).
Its firmware, forge-os (https://github.com/WantClue/forge-os), is a
fork of esp-miner/AxeOS, so the REST surface is the Bitaxe one — same
``GET /api/system/info``, ``PATCH /api/system`` and
``POST /api/system/restart`` on port 80, plus the ``/api/ws`` log
WebSocket. We inherit from :class:`BitaxeDriver` and only adapt the
fields where the forge-os dialect diverges from stock AxeOS:

  - ``chiptemp1``/``chiptemp2`` per-ASIC die temps (EMC2101, one per
                                BM1370). The flat ``temp`` field is the
                                *average* of the two (verified on a real
                                v1.0 board), not the max that
                                ``temp_chip_c`` is meant to carry.
  - ``current``                 total board draw in mA from the INA260
                                power monitor — same scale as the stock
                                Bitaxe field, surfaced here as
                                ``current_a`` like the NerdOctaxe does.

The fan-duty field CHANGED SPELLING between firmware generations, in
both the info JSON and the PATCH payload:

  - v1.0 (factory partition):  ``fanspeed`` (lowercase, stock-AxeOS
                               style). Also: no ``/api/system/asic``
                               endpoint (hence no ``deviceModel`` — see
                               the chiptemp fingerprint in discovery),
                               and ``bestDiff`` is an SI *string*.
  - v1.5+ / git main:          ``fanSpeed`` + ``manualFanSpeed``; the
                               lowercase key is silently ignored, so
                               the fan override below sends every
                               spelling (unknown keys are dropped by
                               both PATCH handlers).

Not exposed by forge-os (any version so far): ``expectedHashrate``,
``errorPercentage``, ``hashrateMonitor``, ``networkDifficulty``,
``fanCount``, ``temp2``, ``responseTime``. The corresponding sample
fields simply stay ``None``; the Guardian's theoretical-hashrate check
falls back to ``smallCoreCount × asicCount``, which forge-os does
report. Reference: ``main/http_server/http_server.c`` in the forge-os
repo (compare the ``v1.0`` tag with ``main``).
"""
from __future__ import annotations

from typing import Any

from .bitaxe import BitaxeDriver, _opt_float, _valid_temp


class BitForgeDriver(BitaxeDriver):
    """BitForge Nano (2× BM1370, forge-os firmware) driver.

    Control endpoints are inherited from :class:`BitaxeDriver` —
    frequency, core voltage, restart and the stratum PATCH all use the
    same keys as stock AxeOS — except the fan duty, which forge-os only
    accepts as ``fanSpeed``/``manualFanSpeed`` (see override below).
    """

    family = "bitforge"
    # forge-os is forked from an older AxeOS and does NOT expose
    # /api/system/pause + /resume (verified against WantClue/forge-os).
    # Keep Standby off until it's added upstream; otherwise it inherits
    # BitaxeDriver.can_pause = True and would offer a control the firmware
    # rejects.
    can_pause = False

    def _parse(self, data: dict[str, Any]):
        # Start from the Bitaxe parser for all the shared field
        # mappings, then fix up the forge-os dialect differences.
        sample = super()._parse(data)
        # BitaxeDriver._parse() stamps "bitaxe".
        sample.family = self.family

        # ---- Per-ASIC die temps ------------------------------------
        # forge-os reports one EMC2101 die temp per BM1370 as
        # `chiptemp1`/`chiptemp2`, and the flat `temp` field is their
        # AVERAGE. The parent put that average into temp_chip_c, which
        # must instead be the hottest sensor (it feeds the overheat
        # alert and the Guardian). Recompute it as max(chiptemp1,
        # chiptemp2) and keep the firmware average in temp_avg_c. An
        # unpopulated sensor reads 0/-1; _valid_temp drops those.
        temp_s1 = _valid_temp(_opt_float(data.get("chiptemp1")))
        temp_s2 = _valid_temp(_opt_float(data.get("chiptemp2")))
        chip_temps = [t for t in (temp_s1, temp_s2) if t is not None]
        if chip_temps:
            avg = _valid_temp(_opt_float(data.get("temp")))
            sample.temp_chip_c = round(max(chip_temps), 1)
            sample.temp_chip_2_c = temp_s2
            if avg is not None and len(chip_temps) > 1:
                sample.temp_avg_c = round(avg, 1)
        # else: keep the parent's `temp` mapping (defensive — a future
        # firmware that drops chiptempN still shows a chip temp).

        # ---- Fan duty ----------------------------------------------
        # v1.5+ spells the duty `fanSpeed`; the parent read the
        # stock-AxeOS `fanspeed`, which is what v1.0 still uses — so
        # only override when the capital-S key is present. One shared
        # duty drives both fans (one per ASIC), and `fanrpm` — already
        # mapped by the parent — is fan 0's tach. The second fan's rpm
        # is not exposed by any firmware version so far.
        fan_pct = _opt_float(data.get("fanSpeed"))
        if fan_pct is not None:
            sample.fan_pct = fan_pct

        # ---- PSU draw (Amps) ---------------------------------------
        # INA260 total board current in mA. 0 is the chip's "read
        # failed" value, never a real draw on a board that just
        # answered the API — treat it as absent.
        current_ma = _opt_float(data.get("current"))
        if current_ma is not None and current_ma > 0:
            sample.current_a = round(current_ma / 1000.0, 3)

        return sample

    async def set_fan_speed(self, percent: int) -> bool:
        """Set the fan duty across both forge-os PATCH dialects.

        v1.0 reads `fanspeed` (lowercase, stock-AxeOS style); v1.5+
        reads `fanSpeed`/`manualFanSpeed` (both write the same NVS key)
        and silently ignores the lowercase one. Each handler drops the
        keys it doesn't know, so sending every spelling targets all
        firmware generations with one call.
        """
        percent = max(0, min(100, int(percent)))
        return await self._patch_system(
            {
                "autofanspeed": 0,
                "fanspeed": percent,
                "fanSpeed": percent,
                "manualFanSpeed": percent,
            }
        )
