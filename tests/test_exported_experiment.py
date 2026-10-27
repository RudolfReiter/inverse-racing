"""Guard the connection between scientific outputs and the visual replay."""
import json
from pathlib import Path
import numpy as np
import pytest

from inverse_racing import Track, rollout
from inverse_racing.experiment import metrics


@pytest.fixture(scope="module")
def experiment():
    return json.loads((Path(__file__).resolve().parents[1] / "docs/data/experiment.json").read_text())


def test_recorded_car_motion_obeys_exact_dynamics(experiment):
    dt = experiment["config"]["dt"]
    for scenario in experiment["scenarios"]:
        actual = np.array(scenario["race"]["states"])
        controls = np.diff(actual[:, 2]) / dt
        np.testing.assert_allclose(rollout(actual[0], controls, dt), actual, atol=3e-5)


def test_all_forecasts_recompute_to_the_published_metrics(experiment):
    track = Track()
    for scenario in experiment["scenarios"]:
        for forecast in scenario["race"]["forecasts"]:
            target = np.array(forecast["actual"]["states"])
            for method in ("learned", "default", "constant_velocity"):
                result = metrics(track, target, np.array(forecast[method]["states"]))
                for key, value in result.items():
                    assert value == pytest.approx(forecast["metrics"][method][key], abs=2e-6)
            pred = forecast["learned"]
            np.testing.assert_allclose(rollout(pred["states"][0], pred["jerk"], experiment["config"]["dt"]), pred["states"], atol=3e-6)
            assert pred["min_margin"] + pred["constraint_relaxation"] >= -1e-5


def test_aggregate_metrics_and_svg_geometry_match_export(experiment):
    for method in ("learned", "default", "constant_velocity"):
        mean = np.mean([s["metrics"][method]["ade_m"] for s in experiment["scenarios"]])
        assert mean == pytest.approx(experiment["metrics"][method]["ade_m"])
    track = Track()
    np.testing.assert_allclose(track.xy(experiment["track"]["s"]), experiment["track"]["xy"], atol=1e-6)
    assert sum(len(s["race"]["forecasts"]) for s in experiment["scenarios"]) == 57
