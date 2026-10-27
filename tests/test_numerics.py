import numpy as np
import pytest
from scipy.optimize import minimize_scalar

from inverse_racing import (Track, Predictor, Weights, PredictionConfig,
                            AccelerationEnvelope, OptimizationError, Observation,
                            fit_weights, rollout)
from inverse_racing.constraints import fit_bound, estimate_envelope
from inverse_racing.track import blend_path


def test_exact_integrator_matches_constant_jerk_polynomial():
    t = np.arange(21) * .15
    x = rollout([4, 7, -2], np.full(20, 1.3), .15)
    np.testing.assert_allclose(x[:, 0], 4 + 7*t - t*t + 1.3*t**3/6, atol=1e-12)
    np.testing.assert_allclose(x[:, 1], 7 - 2*t + 1.3*t*t/2, atol=1e-12)
    np.testing.assert_allclose(x[:, 2], -2 + 1.3*t, atol=1e-12)


def test_periodic_track_and_curvature_derivative():
    track = Track()
    s = np.array([21.123, 140.456, 400.321])
    np.testing.assert_allclose(track.xy(s), track.xy(s + track.length), atol=1e-10)
    numerical = (track.curvature(s + 1e-5) - track.curvature(s - 1e-5)) / 2e-5
    np.testing.assert_allclose(track.curvature(s, derivative=True), numerical, atol=1e-8)


def test_hinge_estimator_matches_independent_convex_minimization():
    z = np.r_[np.linspace(0, 8, 150), 50.]
    fitted = fit_bound(z, 4, .05)
    f = lambda c: np.mean(np.maximum(0, z - c)) + .05 * (c - 4)**2
    reference = minimize_scalar(f, bounds=(0, 55), method="bounded", options={"xatol": 1e-10})
    assert abs(fitted - reference.x) < 1e-5
    assert fitted < 9  # a single outlier must not dominate the bound


def test_polytope_signs_symmetry_and_normalization():
    env = AccelerationEnvelope()
    a, b = env.matrices()
    np.testing.assert_allclose(np.linalg.norm(a, axis=1), 1)
    assert np.all(env.margins([0, 4.99]) >= 0)
    assert np.all(env.margins([0, -7.99]) >= 0)
    assert np.min(env.margins([0, -8.1])) < 0
    for p in env.vertices():
        assert np.min(env.margins([-p[0], p[1]])) > -1e-8
    assert np.all(b > 0)


def test_blend_preserves_observed_start_and_reference_endpoint():
    track = Track()
    p = track.xy(50) + [2, -3]
    s, xy = blend_path(track, 50, p, .3)
    np.testing.assert_allclose(xy[0], p)
    np.testing.assert_allclose(xy[-1], track.xy(50 + s[-1]))


def test_forward_corner_prediction_respects_dynamics_and_envelope():
    track = Track()
    predictor = Predictor(track)
    initial = np.array([track.length * .30, 19, 0])
    result = predictor.solve(initial, Weights(.035, .035))
    np.testing.assert_allclose(result.states, rollout(initial, result.jerk, .2), atol=1e-9)
    assert result.min_margin >= -1e-5
    assert np.min(result.states[:, 1]) >= 0
    assert np.max(result.states[:, 1]) <= 55
    # Actual corner braking, not just an unconstrained acceleration profile.
    assert np.min(result.states[:, 2]) < -.5


def test_invalid_initial_state_fails_explicitly():
    predictor = Predictor(Track())
    with pytest.raises(OptimizationError, match="Initial state"):
        predictor.solve([0, 100, 0])


def test_soft_fallback_exposes_actual_constraint_violation():
    track = Track()
    predictor = Predictor(track, envelope=AccelerationEnvelope(throttle=3.0),
                          config=PredictionConfig(intervals=15))
    result = predictor.solve([30., 15., 3.05], allow_slack=True)
    assert result.constraint_relaxation >= .04999
    assert result.min_margin < -.04999
    assert result.min_margin + result.constraint_relaxation >= -1e-5
    np.testing.assert_allclose(result.states[0], [30., 15., 3.05])


def test_inverse_recovers_weights_from_unseen_exact_rollout():
    track = Track()
    predictor = Predictor(track, config=PredictionConfig(intervals=20))
    true = Weights(.12, .20)
    initial = np.array([30., 15., 0.])
    observed = Observation(initial, predictor.solve(initial, true).states)
    fit = fit_weights(predictor, [observed], arrival=0)
    np.testing.assert_allclose(fit.weights.array(), true.array(), rtol=.035)
    new_initial = np.array([180., 18., 0.])
    np.testing.assert_allclose(predictor.solve(new_initial, fit.weights).states,
                               predictor.solve(new_initial, true).states, atol=.02)
    assert fit.final_loss < fit.initial_loss * .001


@pytest.mark.parametrize("call", [lambda: Weights(-1, 1),
    lambda: PredictionConfig(dt=0), lambda: AccelerationEnvelope(braking=-8),
    lambda: fit_bound([], 2), lambda: estimate_envelope([[np.nan, 1]])])
def test_invalid_inputs_are_rejected(call):
    with pytest.raises(ValueError):
        call()
