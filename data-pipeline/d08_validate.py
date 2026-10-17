"""
D8 - Validate the shipped JSON against the data contract.

Checks schema keys, id uniqueness, numeric ranges, geographic sanity,
host matching, blurb word limits and file sizes. Prints a report and exits
non-zero if anything fails.
"""

import json
import math

import luna_common as luna

STAR_KEYS = {"id", "name", "x", "y", "z", "absMag", "colorIndex", "spectral",
             "distLy", "constellation", "hasPlanets", "info"}
PLANET_KEYS = {"id", "name", "hostId", "massEarth", "radiusEarth", "periodDays",
               "discoveryYear", "method", "info"}
BODY_KEYS = {"id", "name", "type", "parentId", "semiMajorAxisAu",
             "distanceFromParentKm", "orbitalPeriodDays", "eccentricity",
             "radiusKm", "massEarth", "info"}
METHODS = {"Radial velocity", "Transit", "Direct imaging", "Microlensing",
           "Transit timing variations", "Astrometry", "Pulsar timing",
           "Pulsation timing variations", "Eclipse timing variations",
           "Orbital brightness modulations", "Disk kinematics"}
BODY_TYPES = {"star", "planet", "dwarf planet", "moon"}
DEEPSKY_KEYS = {"id", "name", "type", "subtype", "ra", "dec", "dir", "x", "y", "z",
                "distancePc", "distanceLy", "distanceMethod", "constellation",
                "magnitude", "sizeArcmin", "messier", "info", "notable"}
DEEPSKY_TYPES = {"galaxy", "open cluster", "globular cluster", "planetary nebula",
                 "nebula", "supernova remnant", "stellar association",
                 "black hole", "pulsar"}
DIST_METHODS = {None, "literature", "parallax", "redshift"}
FILE_BUDGET_MB = {"stars.json": 6.0, "exoplanets.json": 3.0,
                  "solar-system.json": 1.0, "deep-sky.json": 9.0}


def words(text):
    return len(str(text).split())


def load(name):
    path = luna.OUT_DIR / name
    return path, json.loads(path.read_text(encoding="utf-8"))


def check_text(info, label, errors):
    if not isinstance(info, dict) or set(info) != {"blurb", "funFact"}:
        errors.append(f"{label}: info must have exactly blurb and funFact")
        return
    blurb, fact = info["blurb"], info["funFact"]
    if not blurb or words(blurb) > 60:
        errors.append(f"{label}: blurb missing or over 60 words ({words(blurb)})")
    if fact is not None and words(fact) > 25:
        errors.append(f"{label}: funFact over 25 words ({words(fact)})")


def validate_stars(errors, report):
    path, stars = load("stars.json")
    ids = set()
    for s in stars:
        if set(s) != STAR_KEYS:
            errors.append(f"{s.get('id')}: star keys mismatch {set(s) ^ STAR_KEYS}")
            continue
        if s["id"] in ids:
            errors.append(f"{s['id']}: duplicate star id")
        ids.add(s["id"])
        if not (isinstance(s["distLy"], (int, float)) and s["distLy"] > 0):
            errors.append(f"{s['id']}: bad distLy")
        else:
            r = math.sqrt(s["x"] ** 2 + s["y"] ** 2 + s["z"] ** 2)
            expected = s["distLy"] / luna.PARSEC_LIGHT_YEARS
            if abs(r - expected) > 0.02 * expected + 0.01:
                errors.append(f"{s['id']}: position length {r:.2f} pc != distLy {expected:.2f}")
        if s["absMag"] is not None and not (-12 <= s["absMag"] <= 20):
            errors.append(f"{s['id']}: absMag {s['absMag']} out of range")
        if s["colorIndex"] is not None and not (-1 <= s["colorIndex"] <= 7):
            errors.append(f"{s['id']}: colorIndex {s['colorIndex']} out of range")
        if not isinstance(s["hasPlanets"], bool):
            errors.append(f"{s['id']}: hasPlanets not boolean")
        check_text(s["info"], s["id"], errors)
    report.append(f"stars.json       : {len(stars)} stars "
                  f"({sum(s['hasPlanets'] for s in stars)} with planets)")
    return ids


def validate_planets(errors, report, star_ids):
    path, planets = load("exoplanets.json")
    ids = set()
    for p in planets:
        if set(p) != PLANET_KEYS:
            errors.append(f"{p.get('id')}: planet keys mismatch {set(p) ^ PLANET_KEYS}")
            continue
        if p["id"] in ids:
            errors.append(f"{p['id']}: duplicate planet id")
        ids.add(p["id"])
        if p["hostId"] not in star_ids:
            errors.append(f"{p['id']}: hostId {p['hostId']} missing from stars")
        for field in ("massEarth", "radiusEarth", "periodDays"):
            v = p[field]
            if v is not None and (not isinstance(v, (int, float)) or v <= 0):
                errors.append(f"{p['id']}: bad {field}")
        if p["discoveryYear"] is not None and not (1000 <= p["discoveryYear"] <= 2100):
            errors.append(f"{p['id']}: bad discoveryYear")
        if p["method"] is not None and p["method"] not in METHODS:
            errors.append(f"{p['id']}: unknown method '{p['method']}'")
        check_text(p["info"], p["id"], errors)
    report.append(f"exoplanets.json  : {len(planets)} planets "
                  f"({len({p['hostId'] for p in planets})} host stars)")
    return ids


def validate_solar(errors, report):
    path, bodies = load("solar-system.json")
    ids = {b["id"] for b in bodies}
    types = {}
    for b in bodies:
        if set(b) != BODY_KEYS:
            errors.append(f"{b.get('id')}: body keys mismatch {set(b) ^ BODY_KEYS}")
            continue
        types[b["type"]] = types.get(b["type"], 0) + 1
        if b["type"] not in BODY_TYPES:
            errors.append(f"{b['id']}: bad type {b['type']}")
        if b["parentId"] is not None and b["parentId"] not in ids:
            errors.append(f"{b['id']}: parentId {b['parentId']} not found")
        if not (b["radiusKm"] > 0 and b["massEarth"] > 0):
            errors.append(f"{b['id']}: non-positive radius/mass")
        if b["type"] in ("planet", "dwarf planet") and b["semiMajorAxisAu"] is None:
            errors.append(f"{b['id']}: missing semiMajorAxisAu")
        if b["type"] == "moon" and b["distanceFromParentKm"] is None:
            errors.append(f"{b['id']}: missing distanceFromParentKm")
        check_text(b["info"], b["id"], errors)
    report.append(f"solar-system.json: {len(bodies)} bodies ({types})")


def validate_deepsky(errors, report):
    path, objs = load("deep-sky.json")
    ids = set()
    for o in objs:
        if set(o) != DEEPSKY_KEYS:
            errors.append(f"{o.get('id')}: deep-sky keys mismatch {set(o) ^ DEEPSKY_KEYS}")
            continue
        if o["id"] in ids:
            errors.append(f"{o['id']}: duplicate deep-sky id")
        ids.add(o["id"])
        if o["type"] not in DEEPSKY_TYPES:
            errors.append(f"{o['id']}: bad type {o['type']}")
        d = o["dir"]
        if not (isinstance(d, list) and len(d) == 3):
            errors.append(f"{o['id']}: bad dir")
        else:
            n = math.sqrt(sum(c * c for c in d))
            if abs(n - 1.0) > 0.01:
                errors.append(f"{o['id']}: dir not unit ({n:.4f})")
        if o["distanceMethod"] not in DIST_METHODS:
            errors.append(f"{o['id']}: bad distanceMethod {o['distanceMethod']}")
        if o["distancePc"] is None:
            if any(o[k] is not None for k in ("x", "y", "z", "distanceLy")):
                errors.append(f"{o['id']}: unknown distance but has position")
        else:
            if any(o[k] is None for k in ("x", "y", "z", "distanceLy")):
                errors.append(f"{o['id']}: distance but missing position")
            r = math.sqrt(o["x"] ** 2 + o["y"] ** 2 + o["z"] ** 2)
            expected = o["distancePc"]
            if abs(r - expected) > 0.02 * expected + 0.5:
                errors.append(f"{o['id']}: position length {r:.2f} != distPc {expected:.2f}")
        if not isinstance(o["notable"], bool):
            errors.append(f"{o['id']}: notable not boolean")
        check_text(o["info"], o["id"], errors)
    report.append(f"deep-sky.json    : {len(objs)} objects "
                  f"({sum(1 for o in objs if o['distancePc'])} with distance, "
                  f"{sum(o['notable'] for o in objs)} notable)")


def main():
    errors = []
    report = ["Luna data validation report", "=" * 30]

    star_ids = validate_stars(errors, report)
    validate_planets(errors, report, star_ids)
    validate_solar(errors, report)
    validate_deepsky(errors, report)

    report.append("-" * 30)
    for name, budget in FILE_BUDGET_MB.items():
        path = luna.OUT_DIR / name
        if not path.exists():
            errors.append(f"{name}: file missing")
            continue
        mb = path.stat().st_size / 1e6
        flag = "OK" if mb <= budget else "OVER BUDGET"
        report.append(f"{name:17}: {mb:.2f} MB (budget {budget} MB) {flag}")
        if mb > budget:
            errors.append(f"{name}: {mb:.2f} MB exceeds budget")

    report.append("-" * 30)
    if errors:
        report.append(f"FAILED with {len(errors)} problem(s):")
        report.extend(f"  - {e}" for e in errors[:40])
    else:
        report.append("ALL CHECKS PASSED")

    text = "\n".join(report)
    print(text)
    (luna.CACHE_DIR / "validation_report.txt").write_text(text, encoding="utf-8")
    raise SystemExit(1 if errors else 0)


if __name__ == "__main__":
    main()
