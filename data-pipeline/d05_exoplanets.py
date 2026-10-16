"""
D5 - Exoplanets.

Downloads every confirmed planet from the NASA Exoplanet Archive (TAP,
pscomppars table), matches each host to an HYG star, exports
public/data/exoplanets.json and sets hasPlanets on public/data/stars.json.

Host matching order (first hit wins):
  1. Hipparcos number (hip_name)
  2. Henry Draper number (hd_name)
  3. normalised proper name
  4. sky position within 15 arc-seconds
Planets whose host is absent from HYG are counted and reported (not shipped).
"""

import json
import urllib.parse
import urllib.request

import numpy as np
import pandas as pd

import luna_build
import luna_common as luna

PLANET_COLUMNS = ("pl_name,hostname,hd_name,hip_name,pl_bmasse,pl_rade,"
                  "pl_orbper,disc_year,discoverymethod,ra,dec,sy_dist")
CONE_ARCSEC = 15.0


def download():
    if luna.EXO_RAW.exists():
        luna.status(f"using cached {luna.EXO_RAW.name} ({len(pd.read_csv(luna.EXO_RAW))} rows)")
        return
    query = f"select {PLANET_COLUMNS} from pscomppars"
    url = luna.EXO_TAP + "?" + urllib.parse.urlencode({"query": query, "format": "csv"})
    luna.status("querying NASA Exoplanet Archive ...")
    urllib.request.urlretrieve(url, luna.EXO_RAW)
    luna.status(f"saved {len(pd.read_csv(luna.EXO_RAW))} planets to cache")


def _norm(name):
    return luna.slugify(str(name)) if name else None


def _num(value):
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return None
    text = str(value).strip()
    if not text or text.lower() == "nan":
        return None
    parts = [p for p in text.replace("-", " ").split() if p.isdigit()]
    return int(parts[-1]) if parts else None


def match_hosts(exo, clean):
    """Return exo with a matched hyg id column, plus counts per method."""
    hip_map, hd_map, name_map = {}, {}, {}
    for row in clean.to_dict("records"):
        if pd.notna(row.get("hip")):
            hip_map[int(row["hip"])] = int(row["id"])
        if pd.notna(row.get("hd")):
            hd_map[int(row["hd"])] = int(row["id"])
        proper = row.get("proper")
        if isinstance(proper, str) and proper.strip():
            name_map[_norm(proper)] = int(row["id"])

    # unit vectors for cone search
    clean = clean.copy()
    ra = np.radians(clean["ra_deg"].to_numpy())
    dec = np.radians(clean["dec"].to_numpy())
    cx, cy, cz = np.cos(dec) * np.cos(ra), np.cos(dec) * np.sin(ra), np.sin(dec)
    ids = clean["id"].to_numpy()
    cos_limit = np.cos(np.radians(CONE_ARCSEC / 3600.0))

    matched, methods = [], []
    for row in exo.to_dict("records"):
        hit, how = None, None
        h = _num(row.get("hip_name"))
        if h is not None and h in hip_map:
            hit, how = hip_map[h], "hip"
        if hit is None:
            d = _num(row.get("hd_name"))
            if d is not None and d in hd_map:
                hit, how = hd_map[d], "hd"
        if hit is None:
            key = _norm(row.get("hostname"))
            if key in name_map:
                hit, how = name_map[key], "name"
        if hit is None and pd.notna(row.get("ra")) and pd.notna(row.get("dec")):
            ra2 = np.radians(float(row["ra"]))
            dec2 = np.radians(float(row["dec"]))
            tx = np.cos(dec2) * np.cos(ra2)
            ty = np.cos(dec2) * np.sin(ra2)
            tz = np.sin(dec2)
            dots = cx * tx + cy * ty + cz * tz
            best = int(np.argmax(dots))
            if dots[best] >= cos_limit:
                hit, how = int(ids[best]), "position"
        matched.append(hit)
        methods.append(how)

    exo = exo.assign(host_hyg=matched, match_method=methods)
    return exo


def main():
    download()
    exo = pd.read_csv(luna.EXO_RAW)
    clean = pd.read_csv(luna.HYG_CLEAN)

    exo = match_hosts(exo, clean)
    matched = exo[exo["host_hyg"].notna()].copy()
    matched["host_hyg"] = matched["host_hyg"].astype(int)
    luna.status(f"matched {len(matched)} of {len(exo)} planets to HYG hosts")
    luna.status("match methods: " +
                ", ".join(f"{k}={v}" for k, v in matched["match_method"].value_counts().items()))

    out = luna.OUT_DIR / "stars.json"
    stars = json.loads(out.read_text(encoding="utf-8"))
    by_id = {s["id"]: s for s in stars}

    # name + distance per matched host
    info_rows = clean.set_index("id")
    host_stats = {}
    planets = []
    added_hosts = 0
    for hyg_id, group in matched.groupby("host_hyg"):
        star = by_id.get(f"hyg-{hyg_id}")
        if star is None:
            row = info_rows.loc[hyg_id].to_dict()
            row["id"] = hyg_id
            star = luna_build.build_star(row, has_planets=True)
            stars.append(star)
            by_id[star["id"]] = star
            added_hosts += 1
        star["hasPlanets"] = True
        for row in group.to_dict("records"):
            planets.append(luna_build.build_planet(
                row, host_id=star["id"], host_name=star["name"], host_dist_ly=star["distLy"]))

    planets.sort(key=lambda p: p["id"])
    stars.sort(key=lambda s: int(s["id"].split("-")[1]))

    luna.write_json(luna.OUT_DIR / "exoplanets.json", planets)
    luna.write_json(out, stars)

    unmatched = exo[exo["host_hyg"].isna()]
    report = [
        f"planets in archive      : {len(exo)}",
        f"planets shipped         : {len(planets)}",
        f"unique host stars       : {matched['host_hyg'].nunique()}",
        f"host stars added to map : {added_hosts}",
        f"planets not shipped (host outside HYG): {len(unmatched)}",
        f"stars.json now          : {len(stars)} stars",
    ]
    (luna.CACHE_DIR / "exoplanet_report.txt").write_text("\n".join(report), encoding="utf-8")
    print("\n".join(report))
    luna.status(f"wrote {out.relative_to(luna.PROJECT_DIR)} and exoplanets.json")


if __name__ == "__main__":
    main()
