"""Gap registries for the data-integrity gate.

KNOWN_GAPS: type B micro-gaps (1-2 steps missing) - hard gate.
  Currently empty: all 19 micro-gaps were backfilled on 2026-08-20 via
  scripts/backfill_micro_gaps.py. New micro-gaps must be added here; entries
  are removed again once backfilled.
STRUCTURAL_EXEMPTIONS: type A structural gaps (>=5 steps) - exempt (data
  engineering scope, not backfilled by the test suite).
"""

# type B gaps: 0 (all backfilled 2026-08-20)
KNOWN_GAPS: dict[str, list[tuple[int, int]]] = {}

# type A gaps: 14 across series
STRUCTURAL_EXEMPTIONS = {
    "USDT-FUTURES/BTCUSDT/1m": [
        (1780271940000, 1782444000000),  # 2026-05-31 23:59 -> 2026-06-26 03:20  (36201 steps)
        (1782863940000, 1786955220000),  # 2026-06-30 23:59 -> 2026-08-17 08:27  (68188 steps)
        (1787117100000, 1787186220000),  # 2026-08-19 05:25 -> 2026-08-20 00:37  (1152 steps)
    ],
    "USDT-FUTURES/BTCUSDT/5m": [
        (1717372500000, 1786765500000),  # 2024-06-02 23:55 -> 2026-08-15 03:45  (231310 steps)
        (1787064900000, 1787162100000),  # 2026-08-18 14:55 -> 2026-08-19 17:55  (324 steps)
    ],
    "USDT-FUTURES/BTCUSDT/15m": [
        (1786959000000, 1787102100000),  # 2026-08-17 09:30 -> 2026-08-19 01:15  (159 steps)
    ],
    "USDT-FUTURES/BTCUSDT/1h": [
        (1577833200000, 1700467200000),  # 2019-12-31 23:00 -> 2023-11-20 08:00  (34065 steps)
        (1704063600000, 1767481200000),  # 2023-12-31 23:00 -> 2026-01-03 23:00  (17616 steps)
    ],
    "USDT-FUTURES/BTCUSDT/4h": [
        (1577822400000, 1689667200000),  # 2019-12-31 20:00 -> 2023-07-18 08:00  (7767 steps)
        (1704052800000, 1785744000000),  # 2023-12-31 20:00 -> 2026-08-03 08:00  (5673 steps)
    ],
    "USDT-FUTURES/BTCUSDT/1d": [
        (1577721600000, 1586793600000),  # 2019-12-30 16:00 -> 2020-04-13 16:00  (105 steps)
        (1769616000000, 1779379200000),  # 2026-01-28 16:00 -> 2026-05-21 16:00  (113 steps)
    ],
    "USDT-FUTURES/ETHUSDT/1h": [
        (1786726800000, 1786831200000),  # 2026-08-14 17:00 -> 2026-08-15 22:00  (29 steps)
    ],
    "USDT-FUTURES/ETHUSDT/4h": [
        (1784289600000, 1785744000000),  # 2026-07-17 12:00 -> 2026-08-03 08:00  (101 steps)
    ],
}

def is_exempt(series: str, lo_ms: int, hi_ms: int, min_steps: int = 5) -> bool:
    if min_steps >= 5:
        for s, hi in STRUCTURAL_EXEMPTIONS.get(series, []):
            if s == lo_ms and hi == hi_ms:
                return True
    return False
