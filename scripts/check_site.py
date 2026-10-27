"""Validate static references and experiment parity; no browser required."""
from html.parser import HTMLParser
import json
from pathlib import Path
from urllib.parse import urlparse, unquote
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"

class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids, self.refs, self.headings = set(), [], []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if "id" in attrs:
            assert attrs["id"] not in self.ids, f"Duplicate id: {attrs['id']}"
            self.ids.add(attrs["id"])
        for key in ("src", "href"):
            if key in attrs:
                self.refs.append(attrs[key])
        if tag == "img":
            assert "alt" in attrs, "Images require alternative text"

page = Page()
page.feed((DOCS / "index.html").read_text())
for ref in page.refs:
    url = urlparse(ref)
    if url.scheme or url.netloc:
        continue
    if url.path:
        assert (DOCS / unquote(url.path)).is_file(), f"Missing local resource: {ref}"
    elif url.fragment:
        assert url.fragment in page.ids, f"Missing anchor: {ref}"
data = json.loads((DOCS / "data/experiment.json").read_text())
script = (DOCS / "data/experiment.js").read_text()
assert script.startswith("window.RACING_EXPERIMENT=") and script.endswith(";\n")
assert json.loads(script[len("window.RACING_EXPERIMENT="):-2]) == data
summary = json.loads((DOCS / "data/summary.json").read_text())
assert summary["metrics"] == data["metrics"]
with zipfile.ZipFile(DOCS / "assets/inverse-racing-source.zip") as bundle:
    assert bundle.testzip() is None
    assert "inverse-racing/pyproject.toml" in bundle.namelist()
    assert not any(".venv/" in name or "/.git/" in name for name in bundle.namelist())
print(f"Static checks passed: {len(page.ids)} unique IDs, {len(page.refs)} references, matching JSON/JS/summary, valid source ZIP")
