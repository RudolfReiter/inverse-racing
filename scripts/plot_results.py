"""Create scientific figures and refresh the README table from actual results."""
import json
from pathlib import Path
import re
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[1]
data = json.loads((ROOT / "docs/data/experiment.json").read_text())
out = ROOT / "docs/assets"
out.mkdir(parents=True, exist_ok=True)
colors = {"learned": "#ff8452", "actual": "#b4d8a4", "default": "#b5b3db", "constant_velocity": "#7a8970"}
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 9, "figure.facecolor": "#151b14",
                     "axes.facecolor": "#151b14", "axes.edgecolor": "#405237", "axes.labelcolor": "#a4b897",
                     "text.color": "#e8ecdf", "xtick.color": "#9fb28f", "ytick.color": "#9fb28f",
                     "grid.color": "#405237", "grid.alpha": .45, "svg.fonttype": "none",
                     "svg.hashsalt": "inverse-racing"})
fig, axes = plt.subplots(2, 2, figsize=(13, 7.4), layout="constrained")
fig.suptitle("INVERSE RACING  /  THE SYNTHETIC CAR EXPERIMENT", fontsize=15, x=.055, ha="left", fontweight="medium")
ax = axes[0, 0]
x = np.arange(3)
for i, (key, label) in enumerate([("learned", "Learned"), ("default", "Default weights"), ("constant_velocity", "Constant velocity")]):
    y = [s["metrics"][key]["ade_m"] for s in data["scenarios"]]
    bars = ax.bar(x + (i - 1) * .23, y, .20, color=colors[key], label=label)
    ax.bar_label(bars, fmt="%.2f", fontsize=7, padding=3, color="#d7e2cb")
ax.set_xticks(x, ["Smooth", "Balanced", "Attack"])
ax.set_ylabel("Mean position error · m")
ax.set_title("57 held-out forecasts · lower is better", loc="left", pad=15)
ax.legend(frameon=False, fontsize=7, loc="upper left")
ax.set_ylim(0, max(s["metrics"]["constant_velocity"]["ade_m"] for s in data["scenarios"]) * 1.30)

ax = axes[0, 1]
f = data["scenarios"][1]["race"]["forecasts"][5]
t = np.arange(data["config"]["intervals"] + 1) * data["config"]["dt"]
for key, label in [("actual", "Actual future"), ("learned", "Learned prediction"), ("default", "Default weights"), ("constant_velocity", "Constant velocity")]:
    ax.plot(t, np.array(f[key]["states"])[:, 1], color=colors[key], linewidth=1.7,
            linestyle="--" if key in ("actual", "constant_velocity") else "-", label=label)
ax.set_xlabel("Prediction horizon · s")
ax.set_ylabel("Speed · m/s")
ax.set_title("Balanced driver · forecast at t = 5 s", loc="left", pad=15)
ax.legend(frameon=False, fontsize=7)

ax = axes[1, 0]
samples = np.array(data["calibration"]["samples"])
ax.scatter(samples[6:, 0], samples[6:, 1], s=5, color="#899e79", alpha=.5, label="Calibration samples")
ax.scatter(samples[:6, 0], samples[:6, 1], s=14, color="#d6a07a", label="Injected outliers")
for key, color, label in [("true_vertices", colors["actual"], "True envelope"), ("estimated_vertices", colors["learned"], "Estimated")]:
    p = np.array(data["calibration"][key]); p = np.vstack([p, p[0]])
    ax.plot(p[:, 0], p[:, 1], color=color, linewidth=1.5, linestyle="--" if key == "true_vertices" else "-", label=label)
ax.set_xlabel("Lateral acceleration · m/s²")
ax.set_ylabel("Longitudinal acceleration · m/s²")
ax.set_title("Eight-face acceleration envelope", loc="left", pad=15)
ax.legend(frameon=False, fontsize=7, loc="lower left")

ax = axes[1, 1]
for i, key in enumerate(["acceleration", "jerk"]):
    for j, (source, color, name) in enumerate([("true_weights", colors["actual"], "True"), ("learned_weights", colors["learned"], "Fitted")]):
        y = [s[source][key] for s in data["scenarios"]]
        ax.bar(x * 2.3 + i * .8 + j * .3, y, width=.26, color=color, label=name if i == 0 else None, alpha=.90)
ax.set_xticks(x * 2.3 + .55, ["Smooth\naccel. / jerk", "Balanced\naccel. / jerk", "Attack\naccel. / jerk"])
ax.set_title("Preferences recovered from noisy observations", loc="left", pad=15)
ax.set_ylabel("Cost weight")
ax.legend(frameon=False, fontsize=7)
for ax in axes.flat:
    ax.spines[["top", "right"]].set_visible(False)
    ax.grid(axis="y", linewidth=.5)
    ax.set_axisbelow(True)
fig.savefig(out / "evaluation.svg", metadata={"Date": None})
svg = out / "evaluation.svg"
svg.write_text("\n".join(line.rstrip() for line in svg.read_text().splitlines()) + "\n")
fig.savefig(out / "evaluation.png", dpi=170)
plt.close(fig)

readme = ROOT / "README.md"
text = readme.read_text()
for method, label in [("learned", "**Learned preferences**"), ("default", "Default weights"), ("constant_velocity", "Constant velocity")]:
    values = [s["metrics"][method]["ade_m"] for s in data["scenarios"]] + [data["metrics"][method]["ade_m"]]
    row = "| " + label + " | " + " | ".join((f"**{v:.3f} m**" if method == "learned" else f"{v:.3f} m") for v in values) + " |"
    text = re.sub(r"^\| " + re.escape(label) + r" \|.*$", lambda _: row, text, flags=re.M)
readme.write_text(text)
print("Wrote evaluation.svg, evaluation.png, and the README results table")
