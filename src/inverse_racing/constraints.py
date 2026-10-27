"""Eight-face acceleration polytope and robust constraint estimation."""
from __future__ import annotations

from dataclasses import dataclass
import numpy as np


@dataclass(frozen=True)
class AccelerationEnvelope:
    lateral: float = 10.0
    throttle: float = 5.0
    braking: float = 8.0
    diagonal_throttle: float | None = None
    diagonal_braking: float | None = None

    def __post_init__(self):
        values = [self.lateral, self.throttle, self.braking]
        values += [x for x in (self.diagonal_throttle, self.diagonal_braking) if x is not None]
        if not np.isfinite(values).all() or min(values) <= 0:
            raise ValueError("Acceleration bounds must be finite, positive magnitudes")

    def matrices(self):
        """A @ [a_lat, a_lon] <= b, with outward unit normals.

        Normalization and signed longitudinal faces are explicit: this resolves
        ambiguities in the typeset Eq. (3). Braking is a positive magnitude.
        """
        l, t, b = self.lateral, self.throttle, self.braking
        nt, nb = np.hypot(l, t), np.hypot(l, b)
        a = np.array([[1, 0], [-1, 0], [0, 1], [0, -1],
                      [t / nt, l / nt], [-t / nt, l / nt],
                      [b / nb, -l / nb], [-b / nb, -l / nb]])
        qt = self.diagonal_throttle if self.diagonal_throttle is not None else 1.25 * l * t / nt
        qb = self.diagonal_braking if self.diagonal_braking is not None else 1.25 * l * b / nb
        return a, np.array([l, l, t, b, qt, qt, qb, qb])

    def margins(self, acceleration):
        a, b = self.matrices()
        return b - np.asarray(acceleration) @ a.T

    def vertices(self):
        a, b = self.matrices()
        points = []
        for i in range(8):
            for j in range(i):
                m = a[[i, j]]
                if abs(np.linalg.det(m)) > 1e-9:
                    p = np.linalg.solve(m, b[[i, j]])
                    if np.min(b - a @ p) >= -1e-8:
                        points.append(p)
        points = np.unique(np.round(points, 10), axis=0)
        return points[np.argsort(np.arctan2(points[:, 1], points[:, 0]))]


def fit_bound(projections, prior, omega=0.05):
    """Minimize mean(max(0, z-c)) + omega*(c-prior)^2 (Eq. 4).

    Eliminating QP slacks yields this scalar convex hinge objective. Bisection
    on the monotone right derivative solves it, including at sample kinks.
    """
    z = np.asarray(projections, dtype=float)
    if z.ndim != 1 or not len(z) or not np.isfinite(z).all():
        raise ValueError("Expected nonempty, finite one-dimensional projections")
    if not np.isfinite([prior, omega]).all() or min(prior, omega) <= 0:
        raise ValueError("prior and omega must be finite and positive")
    lo, hi = float(prior), float(max(prior, np.max(z)))
    for _ in range(64):
        mid = (lo + hi) / 2
        slope = 2 * omega * (mid - prior) - np.mean(z > mid)
        if slope < 0:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def estimate_envelope(samples, prior=None, omega=0.05, shrink=0.98):
    """Fit symmetric axis faces first, then two symmetric diagonal pairs."""
    samples = np.asarray(samples, dtype=float)
    if samples.ndim != 2 or samples.shape[1] != 2 or not len(samples) or not np.isfinite(samples).all():
        raise ValueError("samples must have shape (N, 2), ordered lateral/longitudinal")
    if not np.isfinite(shrink) or not 0 < shrink <= 1:
        raise ValueError("shrink must be in (0, 1]")
    prior = prior or AccelerationEnvelope()
    l = fit_bound(np.abs(samples[:, 0]), prior.lateral * shrink, omega)
    t = fit_bound(samples[:, 1], prior.throttle * shrink, omega)
    b = fit_bound(-samples[:, 1], prior.braking * shrink, omega)
    provisional = AccelerationEnvelope(l, t, b)
    a, _ = provisional.matrices()
    upper = np.max(samples @ a[4:6].T, axis=1)
    lower = np.max(samples @ a[6:8].T, axis=1)
    qt = fit_bound(upper, l * t / np.hypot(l, t), omega)
    qb = fit_bound(lower, l * b / np.hypot(l, b), omega)
    return AccelerationEnvelope(l, t, b, qt, qb)
