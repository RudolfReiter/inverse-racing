"""Optional SVG→PNG/GIF export; needs system PyGObject, librsvg, Cairo and Pillow.

Generate frames with: node scripts/render_scene.mjs artifacts/scenes --animate.
These optional rendering packages are not needed to run the scientific code.
"""
from pathlib import Path
import io
import gi
import cairo
from PIL import Image

gi.require_version("Rsvg", "2.0")
from gi.repository import Rsvg

ROOT = Path(__file__).resolve().parents[1]
frames = []
for source in sorted((ROOT / "artifacts/scenes").glob("frame-*.svg")):
    handle = Rsvg.Handle.new_from_file(str(source))
    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, 800, 480)
    rect = Rsvg.Rectangle()
    rect.x, rect.y, rect.width, rect.height = 0, 0, 800, 480
    handle.render_document(cairo.Context(surface), rect)
    buffer = io.BytesIO()
    surface.write_to_png(buffer)
    frame = Image.open(buffer).convert("RGB")
    frames.append(frame)
if not frames:
    raise SystemExit("No scene frames found. Run the SVG exporter first.")
destination = ROOT / "docs/assets"
frames[-1].save(destination / "driving-scene.png")
frames[0].save(destination / "driving-preview.gif", save_all=True, append_images=frames[1:], duration=[100] * (len(frames)-1) + [1400], loop=0, optimize=False)
print(f"Saved scene PNG and {len(frames)}-frame GIF")
