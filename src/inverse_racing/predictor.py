"""Constrained forward race-car trajectory optimizer (LLNLP recreation)."""
from __future__ import annotations

from dataclasses import dataclass
from time import perf_counter
import numpy as np
from scipy.optimize import minimize

from .model import PredictionConfig, Weights, rollout, sensitivities
from .constraints import AccelerationEnvelope


class OptimizationError(RuntimeError):
    """No converged, feasible trajectory was obtained; never silently replaced."""


@dataclass
class Prediction:
    states: np.ndarray
    jerk: np.ndarray
    objective: float
    iterations: int
    solve_seconds: float
    min_margin: float
    constraint_relaxation: float = 0.0


class Predictor:
    def __init__(self, track, envelope=None, config=None):
        self.track = track
        self.envelope = envelope or AccelerationEnvelope()
        self.config = config or PredictionConfig()
        self.g = sensitivities(self.config)

    def accelerations(self, states):
        return np.column_stack([-states[:, 1] ** 2 * self.track.curvature(states[:, 0]), states[:, 2]])

    def solve(self, initial, weights=None, warm_start=None, allow_slack=False):
        """Solve with hard bounds, optionally retry with one shared envelope slack.

        The shared slack is a compact alternative to the paper's per-face,
        per-node slacks. Its magnitude is always exposed in the result.
        """
        if allow_slack:
            try:
                return self.solve(initial, weights, warm_start, allow_slack=False)
            except OptimizationError:
                return self._solve(initial, weights, warm_start, soft=True)
        return self._solve(initial, weights, warm_start, soft=False)

    def _solve(self, initial, weights, warm_start, soft):
        weights = weights or Weights()
        n, vmax = self.config.intervals, self.config.max_speed
        base = rollout(initial, np.zeros(n), self.config.dt)
        if not 0 <= base[0, 1] <= vmax or (not soft and np.min(self.envelope.margins(self.accelerations(base[:1]))) < -1e-7):
            raise OptimizationError("Initial state violates the speed or acceleration envelope")
        g = self.g
        a, b = self.envelope.matrices()

        def state(u):
            return base + np.einsum("ksn,n->ks", g, u[:n])

        def objective(u):
            x = state(u)
            penalty = 100 * u[-1] + 1000 * u[-1] ** 2 if soft else 0
            return float(-(x[-1, 0] - base[-1, 0]) + weights.acceleration * np.sum(x[:-1, 2] ** 2) + weights.jerk * np.sum(u[:n] ** 2) + penalty)

        def gradient(u):
            x = state(u)
            grad = -g[-1, 0] + 2 * weights.acceleration * g[:-1, 2].T @ x[:-1, 2] + 2 * weights.jerk * u[:n]
            return np.r_[grad, 100 + 2000 * u[-1]] if soft else grad

        def constraints(u):
            x = state(u)
            margins = (b - self.accelerations(x) @ a.T + (u[-1] if soft else 0)) / b
            return np.r_[x[:, 1] / vmax, (vmax - x[:, 1]) / vmax, margins.ravel()]

        def jacobian(u):
            x = state(u)
            k = self.track.curvature(x[:, 0])
            dk = self.track.curvature(x[:, 0], derivative=True)
            lat = -x[:, 1, None] ** 2 * dk[:, None] * g[:, 0] - 2 * x[:, 1, None] * k[:, None] * g[:, 1]
            ja = -(a[None, :, 0, None] * lat[:, None, :] + a[None, :, 1, None] * g[:, None, 2, :]) / b[None, :, None]
            jac = np.vstack([g[:, 1] / vmax, -g[:, 1] / vmax, ja.reshape(-1, n)])
            if soft:
                jac = np.column_stack([jac, np.r_[np.zeros(2 * (n + 1)), np.tile(1 / b, n + 1)]])
            return jac

        if warm_start is None:
            u0 = np.zeros(n)
        else:
            u0 = np.asarray(warm_start, dtype=float)
            if u0.shape != (n,) or not np.isfinite(u0).all():
                raise ValueError("warm_start must be a finite vector of length intervals")
        if soft:
            u0 = np.r_[u0, max(0, -np.min(self.envelope.margins(self.accelerations(state(u0)))))]
        start = perf_counter()
        scale = 100.0 if soft else 1.0
        result = minimize(lambda u: objective(u) / scale, u0,
                          jac=lambda u: gradient(u) / scale, method="SLSQP",
                          bounds=[(None, None)] * n + [(0, None)] if soft else None,
                          constraints={"type": "ineq", "fun": constraints, "jac": jacobian},
                          options={"ftol": 1e-9 if soft else 1e-10, "maxiter": 400})
        elapsed = perf_counter() - start
        x = state(result.x)
        margin = float(np.min(self.envelope.margins(self.accelerations(x))))
        if not result.success or not np.isfinite(x).all() or np.min(constraints(result.x)) < -1e-6:
            raise OptimizationError(f"SLSQP failed: {result.message}; minimum acceleration margin={margin:.3g}")
        return Prediction(x, result.x[:n], objective(result.x), int(result.nit), elapsed, margin,
                          float(result.x[-1]) if soft else 0.0)
