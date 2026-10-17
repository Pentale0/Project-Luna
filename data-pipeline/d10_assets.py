"""
D10 - Download real image assets for the frontend.

Two kinds of assets land in `luna/public/`:

  1. `textures/` - equirectangular surface maps for the Solar System bodies
     (and the Sun), from Solar System Scope (CC BY 4.0, based on NASA imagery).
     Used both on the 3D spheres and to render realistic planet portraits.

  2. `images/deepsky/` - a real photograph for every "notable" deep-sky object,
     looked up through the Wikipedia REST API (images come from Wikimedia
     Commons; licences vary per file and are recorded in the manifest).

Everything is cached: re-running only downloads what is missing. A manifest at
`luna/public/data/deepsky-images.json` maps each object id to its file + credit.

Run standalone:  python data-pipeline/d10_assets.py
"""

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import luna_common as luna

PUBLIC = luna.PROJECT_DIR / "luna" / "public"
TEX_DIR = PUBLIC / "textures"
IMG_DIR = PUBLIC / "images" / "deepsky"
MANIFEST = luna.OUT_DIR / "deepsky-images.json"

SSS = "https://www.solarsystemscope.com/textures/download/"
PLANET_TEXTURES = {
    "sun.jpg": "2k_sun.jpg",
    "mercury.jpg": "2k_mercury.jpg",
    "venus.jpg": "2k_venus_atmosphere.jpg",
    "venus-surface.jpg": "2k_venus_surface.jpg",
    "earth.jpg": "2k_earth_daymap.jpg",
    "earth-night.jpg": "2k_earth_nightmap.jpg",
    "earth-clouds.jpg": "2k_earth_clouds.jpg",
    "mars.jpg": "2k_mars.jpg",
    "jupiter.jpg": "2k_jupiter.jpg",
    "saturn.jpg": "2k_saturn.jpg",
    "saturn-ring.png": "2k_saturn_ring_alpha.png",
    "uranus.jpg": "2k_uranus.jpg",
    "neptune.jpg": "2k_neptune.jpg",
    "moon.jpg": "2k_moon.jpg",
    "milkyway.jpg": "2k_stars_milky_way.jpg",
}

UA = "Luna-galaxy-map/1.0 (educational; contact: anasbenmaouia123@gmail.com)"


def fetch(url, timeout=40):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def download_to(url, path, label):
    if path.exists() and path.stat().st_size > 0:
        return True
    try:
        data = fetch(url)
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as exc:
        luna.status(f"  ! {label}: {exc}")
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    luna.status(f"  + {label} ({len(data) // 1024} KB)")
    return True


def wiki_thumb(title, width=560):
    """Return (image_url, credit) for a Wikipedia page's lead image, or None."""
    url = (
        "https://en.wikipedia.org/api/rest_v1/page/summary/"
        + urllib.parse.quote(title.replace(" ", "_"))
        + "?redirect=true"
    )
    try:
        payload = json.loads(fetch(url, timeout=25))
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError):
        return None
    thumb = payload.get("thumbnail") or payload.get("originalimage")
    if not thumb or not thumb.get("source"):
        return None
    src = thumb["source"]
    # Ask Commons for a slightly larger render when it gave us a /thumb/ URL.
    if "/thumb/" in src:
        head, tail = src.rsplit("/", 1)
        if tail.endswith(".jpg") or tail.endswith(".jpeg") or tail.endswith(".png"):
            ext = tail.rsplit(".", 1)[1]
            src = f"{head}/{width}px-{title.replace(' ', '_')}.{ext}"
    return src


def candidate_titles(obj):
    """Ordered guesses for the Wikipedia page of a deep-sky object."""
    titles = []
    name = (obj.get("name") or "").strip()
    if name:
        titles.append(name)
    messier = obj.get("messier")
    if messier:
        num = messier.lstrip("M0") or messier.lstrip("M")
        titles.append(f"Messier {int(num)}")
    oid = obj["id"].replace("ds-", "")
    for prefix, pretty in (("ngc", "NGC"), ("ic", "IC")):
        if oid.startswith(prefix):
            num = oid[len(prefix):].split("-")[0]
            if num.isdigit():
                titles.append(f"{pretty} {int(num)}")
    # de-dupe, keep order
    seen = set()
    out = []
    for t in titles:
        if t and t not in seen:
            seen.add(t)
            out.append(t)
    return out


def slug(name):
    return (
        name.lower()
        .replace(" ", "_")
        .replace("'", "")
        .replace("*", "star")
    )


def main():
    luna.status("D10 assets: Solar System textures")
    TEX_DIR.mkdir(parents=True, exist_ok=True)
    for local, remote in PLANET_TEXTURES.items():
        download_to(SSS + remote, TEX_DIR / local, local)

    # A copy of the Milky Way panorama for the app background, if present.
    luna.status("D10 assets: deep-sky photographs")
    deck_path = luna.OUT_DIR / "deep-sky.json"
    if not deck_path.exists():
        luna.status("  ! deep-sky.json missing - run d09 first")
        return
    objects = json.loads(deck_path.read_text(encoding="utf-8"))
    notable = [o for o in objects if o.get("notable")]
    IMG_DIR.mkdir(parents=True, exist_ok=True)

    manifest = {}
    if MANIFEST.exists():
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))

    got = 0
    for i, obj in enumerate(notable, 1):
        oid = obj["id"]
        entry = manifest.get(oid)
        dest = IMG_DIR / f"{oid}.jpg"
        if entry and dest.exists():
            got += 1
            continue
        for title in candidate_titles(obj):
            src = wiki_thumb(title)
            if not src:
                continue
            try:
                data = fetch(src, timeout=40)
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError):
                continue
            if len(data) < 1500:  # placeholder / error page
                continue
            dest.write_bytes(data)
            manifest[oid] = {
                "file": f"/images/deepsky/{oid}.jpg",
                "credit": "Wikimedia Commons / Wikipedia",
                "title": title,
                "source": src,
            }
            got += 1
            luna.status(f"  + {oid}  ({obj['name']!r} <- {title})")
            break
        time.sleep(0.12)  # be polite to the API
        if i % 25 == 0:
            luna.status(f"    ... {i}/{len(notable)} processed")

    luna.write_json(MANIFEST, manifest)
    luna.status(
        f"D10 assets done: {got}/{len(notable)} deep-sky photos, "
        f"{sum(1 for f in TEX_DIR.glob('*'))} textures, "
        f"manifest {MANIFEST.relative_to(luna.PROJECT_DIR)}"
    )


if __name__ == "__main__":
    main()
