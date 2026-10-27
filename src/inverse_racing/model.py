"""Exact zero-order-hold triple-integrator dynamics (paper, Section III-B)."""
from __future__ import annotations

from dataclasses import dataclass
import numpy as np


@dataclass(frozen=True)
class Weights:
    acceleration: float = 0.2
    jerk: float = 0.5

    def __post_init__(self):
        if not np.isfinite([self.acceleration, self.jerk]).all() or min(self.acceleration, self.jerk) <= 0:
            raise ValueError("Both smoothness weights must be finite and strictly positive.")

    def array(self):
        return np.array([self.acceleration, self.jerk])


@dataclass(frozen=True)
class PredictionConfig:
    intervals: int = 30
    dt: float = 0.2
    max_speed: float = 55.0

    def __post_init__(self):
        if not isinstance(self.intervals, int) or self.intervals < 2:
            raise ValueError("intervals must be an integer >= 2")
        if not np.isfinite([self.dt, self.max_speed]).all() or min(self.dt, self.max_speed) <= 0:
            raise ValueError("dt and max_speed must be finite and positive")

    @property
    def time(self):
        return np.arange(self.intervals + 1) * self.dt


def dynamics(dt):
    """Return A, B for state [progress, speed, acceleration], input jerk."""
    if not np.isfinite(dt) or dt <= 0:
        raise ValueError("dt must be finite and positive")
    return (np.array([[1., dt, dt * dt / 2], [0., 1., dt], [0., 0., 1.]]),
            np.array([dt ** 3 / 6, dt * dt / 2, dt]))


def rollout(initial, jerk, dt):
    initial, jerk = np.asarray(initial, dtype=float), np.asarray(jerk, dtype=float)
    if initial.shape != (3,) or jerk.ndim != 1 or not np.isfinite(initial).all() or not np.isfinite(jerk).all():
        raise ValueError("Expected a finite initial state (3,) and jerk vector (N,)")
    a, b = dynamics(dt)
    states = np.empty((len(jerk) + 1, 3))
    states[0] = initial
    for k, u in enumerate(jerk):
        states[k + 1] = a @ states[k] + b * u
    return states


def sensitivities(config):
    """Exact condensed state Jacobian: G[k, state, control]."""
    a, b = dynamics(config.dt)
    g = np.zeros((config.intervals + 1, 3, config.intervals))
    for k in range(config.intervals):
        g[k + 1] = a @ g[k]
        g[k + 1, :, k] += b
    return g
