# Reproduction notes

This is a **recreated implementation, not the original repository** for [Reiter et al., ECC 2022](https://arxiv.org/abs/2204.01494). The goal is a compact, inspectable car example and a visual explanation. Original software and recorded race data were not used.

## Mathematical core

Let the state be path progress, speed, and longitudinal acceleration, `x = [s, v, a]`. The control `u` is jerk. For a constant jerk on an interval of length `dt`, this implementation uses exact dynamics:

```text
s_next = s + dt*v + dt²/2*a + dt³/6*u
v_next = v + dt*a + dt²/2*u
a_next = a + dt*u
```

The condensed forward problem optimizes the jerk sequence. States are eliminated exactly using the affine dynamics. Its objective is

```text
J = -s_N + sum(k=0,...,N-1) [w_a * a_k² + w_j * u_k²].
```

A constant position offset is subtracted in code for numerical conditioning. There is no `dt` factor in the running cost; fitted weights depend on discretization. The default horizon is 30 intervals of 0.2 s (six seconds), with `0 <= v <= 55 m/s`.

Lateral acceleration follows the paper’s sign convention, `a_lat = -v² * kappa(s)`. Eight unit-normal halfspaces bound `[a_lat, a_lon]`. Throttle and braking magnitudes are positive and use distinct faces; left/right lateral faces and diagonal pairs are symmetric. The printed sign/normalization ambiguities in the paper’s Eq. (3) are resolved explicitly by outward unit normals in `AccelerationEnvelope.matrices()`.

The curve is a synthetic periodic spline, resampled by approximate arc length. Its curvature is interpolated piecewise linearly. Analytic gradients account for both the speed and path-position dependence of lateral acceleration.

## Robust envelope estimation

For projected acceleration samples `z_i`, each scalar bound solves

```text
min_c mean(max(0, z_i - c)) + omega * (c - prior)².
```

Eliminating the nonnegative slacks gives this convex one-dimensional problem. Bisection on its monotone right derivative handles both stationary intervals and sample kinks. Axis faces are estimated first, followed by symmetric diagonal faces with normalized directions.

The demonstration uses 600 idealized samples drawn inside a known envelope, Gaussian sensor noise, and six injected outliers. It starts from nominal axis limits equal to the simulator’s limits, shrinks them by 2%, and uses `omega=0.012`. This is a controlled calibration illustration; it is not constraint identification from previously unknown real telemetry.

## Inverse step and deviations

`fit_weights()` repeatedly solves the forward problem inside nonlinear least squares, optimizing log weights to ensure positivity. The residual scales are `[s/3, v, a/2]`; the last 20% of each window taper to zero. A small arrival penalty acts on log weights relative to the default prior.

This **does not implement the paper’s relaxed KKT/MPCC reformulation**. It is a smaller nested alternative, suitable for two parameters and this synthetic example. It uses SciPy SLSQP for the inner NLP and SciPy nonlinear least squares for the outer fit. Different local optima and fitted parameters are possible. Identifiability also fails when every observed action is constraint-saturated or when the driving behavior does not excite both costs.

The initial solve has hard acceleration constraints. With `allow_slack=True`, an `OptimizationError` triggers a second solve with one shared nonnegative acceleration slack `epsilon`:

```text
A * acceleration <= b + epsilon
additional objective = 100 * epsilon + 1000 * epsilon²
```

Speed bounds remain hard. Sharing one slack is a simplification of separate slacks for every node and face. The raw minimum acceleration margin and slack are exported for each forecast. Failed optimization is never silently replaced with a fabricated successful prediction.

The standalone `blend_path()` helper uses a quintic blend from an observed position/tangent into the reference path. Its parameter is reference distance, not exact arc length of the blended curve. The car example already follows the reference path and does not use this helper in its forward solves. Minimum-curvature racing-line optimization and off-path dynamics are not implemented.

## Car experiment protocol

1. Generate an independent synthetic acceleration calibration set and estimate the polytope.
2. Generate three noisy open-loop training windows per driver with a separate ground-truth predictor. Each window has 31 states, six seconds of motion, and a known initial state.
3. Fit weights using only these training observations and the estimated envelope.
4. Evaluate three separate matched-horizon windows to isolate preference recovery. These diagnostics are in `summary.json`.
5. Simulate an independent 24-second car drive for each profile. The ground-truth opponent replans every 0.2 s and executes only the first control of each plan.
6. At 19 origins per drive, predict six seconds from the observed state. Compare learned weights, default weights `[w_a=0.2, w_j=0.5]`, and constant velocity against the subsequent simulated motion.

The car’s repeated replanning creates a horizon mismatch: a six-second open-loop prediction cannot exactly match a driver that continues optimizing beyond its original horizon. All predictors share a curved reference path. Constant velocity is therefore a path-following baseline, not a straight Cartesian extrapolation. It is unconstrained by the acceleration envelope.

ADE is the mean Euclidean position error at the 30 future nodes; FDE is the error at the final node. Speed RMSE also excludes the identical initial state. Scenario-level metrics average over 19 forecasts; overall metrics average equally across the three scenarios.

Forecast windows overlap and are correlated. The simulation, path, cost family, and nominal bounds favor the assumed predictor. No real-world generalization, statistical significance, collision avoidance, game-theoretic behavior, embedded runtime, or equivalence to the paper’s published benchmark is established.

## Rendering and provenance

`experiment.json` is the primary output. `experiment.js` contains the same JSON in a script assignment for direct `file://` use. The page interpolates recorded car motion; forecast lines, endpoint markers, charts, weights, and errors come from the Python outputs. It never adjusts the experiment to fit a visual claim.

The scene renderer uses Canvas 2D with a three-dimensional projection. Track edges, reference positions, cars, curbs, garages, stands, and vegetation are code-generated. Car scale is deliberately enlarged; speed-pillar height is illustrative. The horizon buttons crop an existing six-second trajectory. They do not trigger fresh optimization.

`scripts/render_scene.mjs` exports the same renderer’s drawing commands as SVG for standalone illustrations. This validates scene output, not HTML layout or browser interactions. Full browser verification requires a browser-capable environment.

Solver timings are machine-dependent diagnostics. Scientific metrics should be close when rerunning the pinned environment, but wall-clock timings and small solver differences are expected. The committed provenance records the actual Python, NumPy, and SciPy versions used.
