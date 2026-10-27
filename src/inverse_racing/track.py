"""Synthetic circuit geometry and a smooth path-blending alternative."""
from __future__ import annotations

import numpy as np
from scipy.interpolate import CubicSpline


class Track:
    """Closed, approximately arc-length parameterized racing path.

    The circuit is designed for this recreation, not a reconstruction of a
    Roborace track. It is supplied as a reference path, not curvature-optimized.
    Curvature uses piecewise-linear interpolation as in the paper.
    """
    def __init__(self, points=None, width=13.0):
        if points is None:
            points = np.array([
                [-210, -95], [-100, -135], [65, -132], [195, -110],
                [255, -38], [210, 35], [105, 43], [43, 105],
                [-35, 125], [-91, 62], [-161, 78], [-232, 35],
                [-250, -30], [-210, -95],
            ], dtype=float)
        points = np.asarray(points, dtype=float)
        if points.ndim != 2 or points.shape[1] != 2 or len(points) < 5 or not np.isfinite(points).all():
            raise ValueError("Track needs at least five finite 2D points")
        if not np.allclose(points[0], points[-1]):
            points = np.vstack([points, points[0]])
        if np.any(np.linalg.norm(np.diff(points, axis=0), axis=1) < 1e-8):
            raise ValueError("Consecutive track points must be distinct")
        t = np.r_[0, np.cumsum(np.linalg.norm(np.diff(points, axis=0), axis=1))]
        spline = CubicSpline(t, points, bc_type="periodic")
        dense = spline(np.linspace(0, t[-1], 6001))
        arc = np.r_[0, np.cumsum(np.linalg.norm(np.diff(dense, axis=0), axis=1))]
        self.length, self.width = float(arc[-1]), float(width)
        if not np.isfinite(width) or width <= 0:
            raise ValueError("Track width must be finite and positive")
        self._xy = CubicSpline(arc, dense, bc_type="periodic")
        self._s = np.linspace(0, self.length, 1401)
        d, dd = self._xy(self._s, 1), self._xy(self._s, 2)
        self._k = (d[:, 0] * dd[:, 1] - d[:, 1] * dd[:, 0]) / np.linalg.norm(d, axis=1) ** 3
        self._k[-1] = self._k[0]

    def xy(self, s):
        return self._xy(np.mod(s, self.length))

    def tangent(self, s):
        d = self._xy(np.mod(s, self.length), 1)
        return d / np.linalg.norm(d, axis=-1, keepdims=True)

    def curvature(self, s, derivative=False):
        s = np.mod(s, self.length)
        if derivative:
            i = np.clip(np.searchsorted(self._s, s, side="right") - 1, 0, len(self._s) - 2)
            return (self._k[i + 1] - self._k[i]) / (self._s[i + 1] - self._s[i])
        return np.interp(s, self._s, self._k)

    def sample(self, count=500):
        s = np.linspace(0, self.length, count + 1)
        xy, tangent = self.xy(s), self.tangent(s)
        normal = np.stack([-tangent[:, 1], tangent[:, 0]], axis=1)
        return {"s": s, "xy": xy, "left": xy + normal * self.width / 2,
                "right": xy - normal * self.width / 2, "curvature": self.curvature(s)}


def blend_path(track, start_s, position, heading, distance=80.0, count=120):
    """C2 quintic blend of an observed tangent ray into the reference path.

    This is a documented alternative to the paper's printed linear blend;
    it avoids a position/tangent discontinuity at either end. The returned
    parameter is reference-path distance, not the blended curve's arc length.
    """
    position = np.asarray(position, dtype=float)
    if position.shape != (2,) or not np.isfinite(position).all() or not np.isfinite(heading):
        raise ValueError("position and heading must be finite")
    if not np.isfinite(distance) or distance <= 0 or count < 2:
        raise ValueError("distance must be positive and count >= 2")
    s = np.linspace(0, distance, count)
    u = s / distance
    w = 10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5
    ray = position + s[:, None] * np.array([np.cos(heading), np.sin(heading)])
    return s, (1 - w[:, None]) * ray + w[:, None] * track.xy(start_s + s)
