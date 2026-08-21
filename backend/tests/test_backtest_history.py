"""Offline tests for BacktestHistoryStore persistence.

Run:
    python tests/test_backtest_history.py     # from backend/ with PYTHONPATH=src
    pytest
"""

from __future__ import annotations

from market_data.backtest_history import (
    MAX_RUNS,
    MAX_SERIES_POINTS,
    BacktestHistoryStore,
    downsample,
)

SERIES_REF = {"category": "USDT-FUTURES", "symbol": "BTCUSDT", "timeframe": "1h"}


def _result(n_lanes: int = 10) -> dict:
    return {
        "total_return": 0.05,
        "max_drawdown": -0.02,
        "win_rate": 0.6,
        "trades": 3,
        "bars": n_lanes,
        "test_bars": n_lanes,
        "trade_list": [
            {
                "side": "long",
                "entry_time": 1700000000000,
                "entry_price": 100.0,
                "exit_time": 1700000300000,
                "exit_price": 105.0,
                "bars": 2,
                "gross_return": 0.05,
                "net_return": 0.048,
            },
            {
                "side": "short",
                "entry_time": 1700000300000,
                "entry_price": 105.0,
                "exit_time": 1700000600000,
                "exit_price": 100.0,
                "bars": 1,
                "gross_return": 0.047,
                "net_return": 0.045,
            },
        ],
        "series": {
            "open_time": list(range(1700000000000, 1700000000000 + n_lanes * 300000, 300000)),
            "equity": [1.0 + 0.01 * i for i in range(n_lanes)],
            "drawdown": [0.0] * n_lanes,
            "signal": [1.0, -1.0, 0.0] * (n_lanes // 3 + 1),
            "proba": [0.6] * n_lanes,
        },
        "data_meta": {"n_train": 100, "n_test": n_lanes, "start": 0, "end": 1},
    }


def test_downsample_short_kept() -> None:
    assert downsample(list(range(10)), 500) == list(range(10))


def test_downsample_long_thinned() -> None:
    values = list(range(1000))
    out = downsample(values, MAX_SERIES_POINTS)
    assert len(out) == MAX_SERIES_POINTS
    # indices are increasing and span the original range.
    assert out[0] == 0 and out[-1] == 999
    assert all(b > a for a, b in zip(out, out[1:]))


def test_save_and_get_roundtrip(tmp_path) -> None:  # noqa: ANN001
    store = BacktestHistoryStore(tmp_path / "history.json")
    saved = store.save(SERIES_REF, {"thresh": 0.6}, [{"id": "rsi_14"}], _result(10))
    assert saved["id"] and saved["category"] == "USDT-FUTURES"
    assert "trade_list" not in saved and "series" not in saved  # meta only

    entry = store.get(saved["id"])
    assert entry is not None
    assert len(entry["trade_list"]) == 2
    assert len(entry["series"]["equity"]) == 10  # short series kept as-is
    assert entry["metrics"]["total_return"] == 0.05


def test_list_newest_first_and_delete(tmp_path) -> None:  # noqa: ANN001
    store = BacktestHistoryStore(tmp_path / "history.json")
    first = store.save(SERIES_REF, None, None, _result(5))
    second = store.save(SERIES_REF, None, None, _result(5))
    runs = store.list()
    assert [r["id"] for r in runs] == [second["id"], first["id"]]
    assert all("trade_list" not in r and "series" not in r for r in runs)

    assert store.delete(first["id"]) is True
    assert store.get(first["id"]) is None
    assert store.delete(first["id"]) is False  # idempotent / missing
    assert store.get(second["id"]) is not None


def test_max_runs_evicts_oldest(tmp_path) -> None:  # noqa: ANN001
    store = BacktestHistoryStore(tmp_path / "history.json")
    ids = [store.save(SERIES_REF, None, None, _result(5))["id"] for _ in range(MAX_RUNS + 3)]
    runs = store.list()
    assert len(runs) == MAX_RUNS
    # newest MAX_RUNS survive; the first 3 are evicted.
    assert all(r["id"] not in ids[:3] for r in runs)
    assert runs[0]["id"] == ids[-1]


def test_malformed_write_rejected(tmp_path) -> None:  # noqa: ANN001
    store = BacktestHistoryStore(tmp_path / "history.json")
    result = _result(5)
    result["trade_list"] = [{"side": "diagonal"}]
    try:
        store.save(SERIES_REF, None, None, result)
    except ValueError:
        pass
    else:  # pragma: no cover
        raise AssertionError("expected ValueError for malformed trade")


def test_long_series_downsampled_on_save(tmp_path) -> None:  # noqa: ANN001
    store = BacktestHistoryStore(tmp_path / "history.json")
    entry = store.save(SERIES_REF, None, None, _result(2000))
    detail = store.get(entry["id"])
    assert len(detail["series"]["equity"]) == MAX_SERIES_POINTS
    assert len(detail["trade_list"]) == 2  # trades kept in full


def test_load_handles_corrupt_file(tmp_path) -> None:  # noqa: ANN001
    path = tmp_path / "history.json"
    path.write_text("{ not json", encoding="utf-8")
    store = BacktestHistoryStore(path)
    assert store.list() == []
    assert store.get("x") is None


def test_save_stats_and_model_metrics(tmp_path) -> None:  # noqa: ANN001
    store = BacktestHistoryStore(tmp_path / "history.json")
    result = _result(10)
    result["stats"] = {"sharpe_ratio": 1.42, "sortino_ratio": 1.1,
                       "calmar_ratio": 0.9, "profit_factor": 2.1}
    result["model_metrics"] = {"roc_auc": 0.72, "log_loss": 0.61}
    saved = store.save(SERIES_REF, {"model": "hgb"}, None, result)
    # List metadata excludes heavy per-run fields.
    assert "stats" not in saved and "model_metrics" not in saved

    detail = store.get(saved["id"])
    assert detail["stats"] == result["stats"]
    assert detail["model_metrics"] == result["model_metrics"]


def test_legacy_record_missing_stats_tolerated(tmp_path) -> None:  # noqa: ANN001
    store = BacktestHistoryStore(tmp_path / "history.json")
    saved = store.save(SERIES_REF, None, None, _result(10))
    detail = store.get(saved["id"])
    # Records written without stats/model_metrics fall back to empty dicts.
    assert detail["stats"] == {}
    assert detail["model_metrics"] == {}


def test_new_fields_persisted_and_meta_omits(tmp_path) -> None:  # noqa: ANN001
    store = BacktestHistoryStore(tmp_path / "history.json")
    result = _result(10)
    result["feature_weights"] = {
        "kind": "coef",
        "features": ["log_ret", "macd_hist"],
        "values": [0.5, -0.2],
    }
    result["roc_curve"] = {"fpr": [0.0, 0.5, 1.0], "tpr": [0.0, 0.6, 1.0]}
    result["series"]["benchmark"] = [1.0, 1.02, 1.04, 1.06, 1.08, 1.1, 1.12, 1.14, 1.16, 1.18]
    saved = store.save(SERIES_REF, {"model": "lr"}, None, result)
    assert "feature_weights" not in saved and "roc_curve" not in saved

    detail = store.get(saved["id"])
    assert detail["feature_weights"] == result["feature_weights"]
    assert detail["roc_curve"] == result["roc_curve"]
    assert detail["series"]["benchmark"] == result["series"]["benchmark"]


def test_old_record_without_new_fields_tolerated(tmp_path) -> None:  # noqa: ANN001
    store = BacktestHistoryStore(tmp_path / "history.json")
    saved = store.save(SERIES_REF, None, None, _result(10))
    detail = store.get(saved["id"])
    assert detail.get("feature_weights") is None
    assert detail.get("roc_curve") is None
    assert detail["series"].get("benchmark", []) == []  # missing lane defaults empty


def _run_all() -> None:
    import inspect
    import pathlib
    import tempfile

    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            params = len(inspect.signature(fn).parameters)
            if params == 1:
                with tempfile.TemporaryDirectory() as td:
                    fn(pathlib.Path(td))
            else:
                fn()
            print(f"PASS {name}")
    print("All backtest history tests passed.")


if __name__ == "__main__":
    _run_all()
