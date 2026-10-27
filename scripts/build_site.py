"""Package the complete source download and copy the static site into dist/."""
from pathlib import Path
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SKIP_DIRS = {".git", ".venv", ".pytest_cache", "__pycache__", ".openai", "artifacts", "dist", "build", "node_modules", ".site-workflow"}
archive = ROOT / "docs/assets/inverse-racing-source.zip"
archive.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
    for path in sorted(ROOT.rglob("*")):
        relative = path.relative_to(ROOT)
        if not path.is_file() or any(p in SKIP_DIRS or p.endswith(".egg-info") for p in relative.parts):
            continue
        if path == archive or path.suffix in {".pyc", ".zip"} or path.name.endswith(".tar.gz"):
            continue
        # Stable timestamps make source archives reproducible across rebuilds.
        info = zipfile.ZipInfo(str(Path("inverse-racing") / relative), date_time=(2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        bundle.writestr(info, path.read_bytes())
shutil.copytree(ROOT / "docs", ROOT / "dist", dirs_exist_ok=True)
print(f"Source: {archive} ({archive.stat().st_size / 1024 / 1024:.2f} MB)")
print(f"Static site: {ROOT / 'dist'}")
