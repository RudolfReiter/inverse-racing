"""Nested inverse optimal control (a simpler alternative to paper Eq. 8)."""
from __future__ import annotations

from dataclasses import dataclass
import numpy as np
from scipy.optimize import least_squares

from .model import Weights


@dataclass
class Observation:
    initial: np.ndarray
    states: np.ndarray


@dataclass
class FitResult:
    weights: Weights
    initial_loss: float
    final_loss: float
    evaluations: int
    history: list


def fit_weights(predictor, observations, prior=None, arrival=1e-5, max_evaluations=55):
    """Fit two positive weights by repeatedly solving the forward NLP.

    Residuals use [s/3, v, a/2]; the last 20% taper to zero. An arrival penalty
    acts in log-weight space. This is NOT the paper's relaxed KKT/MPCC solver.
    Identifiability requires informative, not purely constraint-saturated data.
    """
    prior = prior or Weights()
    if not observations:
        raise ValueError("At least one observation is required")
    if not np.isfinite(arrival) or arrival < 0 or max_evaluations < 1:
        raise ValueError("arrival must be nonnegative and max_evaluations positive")
    n = predictor.config.intervals + 1
    for ob in observations:
        if np.shape(ob.states) != (n, 3) or not np.isfinite(ob.states).all():
            raise ValueError(f"Observed states must be finite with shape ({n}, 3)")
    taper = np.ones(n)
    tail = max(2, n // 5)
    taper[-tail:] = np.linspace(1, 0, tail)
    taper[0] = 0
    scaling = np.sqrt(taper)[:, None] * np.array([1 / 3, 1, 0.5])
    log_prior = np.log(prior.array())
    history = []

    def residual(log_w):
        weights = Weights(*np.exp(log_w))
        parts = [(predictor.solve(ob.initial, weights).states - ob.states) * scaling for ob in observations]
        data = np.concatenate([p.ravel() for p in parts]) / np.sqrt(len(observations) * n)
        values = np.r_[data, np.sqrt(arrival) * (log_w - log_prior)]
        loss = float(values @ values)
        if not history or loss < history[-1]["loss"]:
            history.append({"evaluation": calls[0], "loss": loss,
                            "acceleration": weights.acceleration, "jerk": weights.jerk})
        calls[0] += 1
        return values

    calls = [0]
    initial = residual(log_prior)
    result = least_squares(residual, log_prior, bounds=(np.log(0.003), np.log(3.0)),
                           diff_step=2e-3, max_nfev=max_evaluations,
                           ftol=1e-7, xtol=1e-6, gtol=1e-7)
    if not result.success:
        raise RuntimeError(f"Weight fitting failed: {result.message}")
    return FitResult(Weights(*np.exp(result.x)), float(initial @ initial),
                     float(result.fun @ result.fun), calls[0], history)
