"""Deterministic synthetic race-car evaluation and browser replay export."""
from __future__ import annotations

import argparse
from dataclasses import asdict
import json
from pathlib import Path
import platform
from time import perf_counter
import numpy as np
import scipy

from .constraints import AccelerationEnvelope, estimate_envelope
from .inverse import Observation, fit_weights
from .model import PredictionConfig, Weights, rollout
from .predictor import Predictor
from .track import Track


PROFILES = [
    ("smooth", "Smooth operator", "Patient acceleration. A measured approach to every corner.", Weights(.32, .65)),
    ("balanced", "Balanced racer", "A little more intent. Progress and composure in equal measure.", Weights(.12, .20)),
    ("attack", "Attack mode", "Late braking. Fast exits. A stronger preference for progress.", Weights(.035, .035)),
]


def metrics(track, actual, predicted):
    error = np.linalg.norm(track.xy(actual[:, 0]) - track.xy(predicted[:, 0]), axis=1)
    return {"ade_m": float(np.mean(error[1:])), "fde_m": float(error[-1]),
            "speed_rmse_mps": float(np.sqrt(np.mean((actual[1:, 1] - predicted[1:, 1]) ** 2)))}


def calibration_samples(envelope, rng, count=600):
    """Idealized independent acceleration calibration, not recorded telemetry."""
    samples = []
    while len(samples) < count:
        p = np.array([rng.uniform(-envelope.lateral, envelope.lateral),
                      rng.uniform(-envelope.braking, envelope.throttle)])
        if np.min(envelope.margins(p)) >= 0:
            samples.append(p)
    samples = np.asarray(samples) + rng.normal(0, .06, (count, 2))
    # Deliberate gross outliers test the robust hinge estimator.
    samples[:6] += rng.normal(0, 5.0, (6, 2))
    return samples


def initial_state(track, fraction, speed=19.0):
    s = track.length * fraction
    return np.array([s, min(speed, np.sqrt(6.5 / max(abs(track.curvature(s)), 1e-6))), 0.])


def constant_velocity(initial, config):
    x = np.tile(initial, (config.intervals + 1, 1))
    x[:, 0] = initial[0] + config.time * initial[1]
    x[:, 2] = 0
    return x


def pack_prediction(track, prediction):
    return {"states": prediction.states, "xy": track.xy(prediction.states[:, 0]),
            "jerk": prediction.jerk, "solve_ms": prediction.solve_seconds * 1000,
            "min_margin": prediction.min_margin, "iterations": prediction.iterations,
            "constraint_relaxation": prediction.constraint_relaxation}


def json_value(value):
    if isinstance(value, np.ndarray):
        return np.round(value, 7).tolist()
    if isinstance(value, np.generic):
        return value.item()
    raise TypeError(type(value).__name__)


def run_experiment(seed=7, quick=False):
    rng = np.random.default_rng(seed)
    config, track = PredictionConfig(), Track()
    true_envelope = AccelerationEnvelope()
    calibration = calibration_samples(true_envelope, rng)
    estimated_envelope = estimate_envelope(calibration, true_envelope, omega=.012, shrink=.98)
    truth = Predictor(track, true_envelope, config)
    learner = Predictor(track, estimated_envelope, config)
    default = Weights()
    scenarios = []
    start = perf_counter()
    for key, name, description, true_weights in PROFILES:
        print(f"[{key}] Generating training observations and fitting preferences…", flush=True)
        training = []
        # Train only on independent open-loop windows, never on replay futures.
        for fraction in (.02, .15, .42):
            initial = initial_state(track, fraction)
            clean = truth.solve(initial, true_weights).states
            noisy = clean + rng.normal(size=clean.shape) * np.array([.08, .04, .03])
            noisy[0] = initial
            training.append(Observation(initial, noisy))
        fit = fit_weights(learner, training, default)
        # Separate matched-horizon holdout isolates parameter recovery.
        matched = []
        for fraction in (.28, .56, .84):
            initial = initial_state(track, fraction, speed=18)
            actual = truth.solve(initial, true_weights).states
            predicted = learner.solve(initial, fit.weights).states
            matched.append(metrics(track, actual, predicted))
        print(f"[{key}] Evaluating a receding-horizon car on an unseen drive…", flush=True)
        # The opponent replans every dt. Predictions remain open-loop, creating
        # a deliberate horizon mismatch, like the paper's structural uncertainty.
        steps = 60 if quick else 120
        actual = [initial_state(track, .285, speed=20)]
        warm = None
        for _ in range(steps):
            plan = truth.solve(actual[-1], true_weights, warm_start=warm)
            actual.append(plan.states[1])
            warm = np.r_[plan.jerk[1:], plan.jerk[-1]]
        actual = np.array(actual)
        forecasts, by_method, solve_times = [], {k: [] for k in ("learned", "default", "constant_velocity")}, []
        for origin in range(0, steps - config.intervals + 1, 5):
            predicted = learner.solve(actual[origin], fit.weights, allow_slack=True)
            prior_plan = learner.solve(actual[origin], default, allow_slack=True)
            cv = constant_velocity(actual[origin], config)
            target = actual[origin:origin + config.intervals + 1]
            record = {"origin": origin, "time": origin * config.dt,
                      "learned": pack_prediction(track, predicted),
                      "default": pack_prediction(track, prior_plan),
                      "constant_velocity": {"states": cv, "xy": track.xy(cv[:, 0])},
                      "actual": {"states": target, "xy": track.xy(target[:, 0])}, "metrics": {}}
            for method, values in [("learned", predicted.states), ("default", prior_plan.states), ("constant_velocity", cv)]:
                m = metrics(track, target, values)
                by_method[method].append(m)
                record["metrics"][method] = m
            solve_times.append(predicted.solve_seconds * 1000)
            forecasts.append(record)
        aggregate = {method: {metric: float(np.mean([r[metric] for r in rows])) for metric in rows[0]}
                     for method, rows in by_method.items()}
        scenarios.append({"id": key, "name": name, "description": description,
                          "true_weights": asdict(true_weights), "learned_weights": asdict(fit.weights),
                          "fit": {"initial_loss": fit.initial_loss, "final_loss": fit.final_loss,
                                  "evaluations": fit.evaluations, "history": fit.history},
                          "matched_horizon": {metric: float(np.mean([r[metric] for r in matched])) for metric in matched[0]},
                          "metrics": aggregate, "solve_ms_median": float(np.median(solve_times)),
                          "relaxed_forecasts": sum(f["learned"]["constraint_relaxation"] > 1e-6 for f in forecasts),
                          "max_relaxation_mps2": max(f["learned"]["constraint_relaxation"] for f in forecasts),
                          "race": {"time": np.arange(steps + 1) * config.dt, "states": actual,
                                   "xy": track.xy(actual[:, 0]), "forecasts": forecasts}})
        print(f"[{key}] Learned weights: {fit.weights}; receding-horizon ADE: {aggregate['learned']['ade_m']:.3f} m", flush=True)
    aggregate = {method: {metric: float(np.mean([s["metrics"][method][metric] for s in scenarios]))
                         for metric in ("ade_m", "fde_m", "speed_rmse_mps")}
                 for method in ("learned", "default", "constant_velocity")}
    return {"schema_version": 1,
            "provenance": {"notice": "Recreated implementation, not the original repository. Synthetic data only.",
                           "paper": "https://arxiv.org/abs/2204.01494", "seed": seed,
                           "python": platform.python_version(), "numpy": np.__version__, "scipy": scipy.__version__,
                           "evaluation": "Independent noisy open-loop training; held-out receding-horizon car simulation. Forecast windows overlap.",
                           "constraint_calibration": "600 independent idealized acceleration samples, with noise and six injected outliers.",
                           "solver": "SciPy SLSQP + nested nonlinear least squares", "wall_seconds": perf_counter() - start},
            "config": asdict(config), "default_weights": asdict(default),
            "track": {**track.sample(), "length": track.length, "width": track.width},
            "calibration": {"samples": calibration, "true_vertices": true_envelope.vertices(),
                            "estimated_vertices": estimated_envelope.vertices(),
                            "true": asdict(true_envelope), "estimated": asdict(estimated_envelope)},
            "metrics": aggregate, "scenarios": scenarios}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("docs/data/experiment.json"))
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--quick", action="store_true", help="Run 12-second instead of 24-second held-out drives")
    args = parser.parse_args()
    data = run_experiment(args.seed, args.quick)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, default=json_value, separators=(",", ":"), allow_nan=False) + "\n")
    # Also emit a script for offline file:// use, without fetch/CORS requirements.
    args.output.with_suffix(".js").write_text("window.RACING_EXPERIMENT=" + json.dumps(data, default=json_value, separators=(",", ":"), allow_nan=False) + ";\n")
    summary = {"provenance": data["provenance"], "metrics": data["metrics"],
               "profiles": [{k: s[k] for k in ("id", "true_weights", "learned_weights", "matched_horizon", "metrics", "solve_ms_median")} for s in data["scenarios"]]}
    args.output.with_name("summary.json").write_text(json.dumps(summary, indent=2, allow_nan=False) + "\n")
    print(json.dumps(data["metrics"], indent=2))
    print(f"Saved {args.output}")


if __name__ == "__main__":
    main()
