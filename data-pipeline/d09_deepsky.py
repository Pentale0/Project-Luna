"""
D9 - Deep-sky objects (nebulae, clusters, galaxies, remnants, black holes,
pulsars) from OpenNGC plus a curated set of famous objects.

Writes public/data/deep-sky.json.

Coordinates are converted to the same galactic Cartesian parsec frame as the
stars (Sun at origin). Distances come from, in priority order:
  1. the curated table (literature values for famous objects), else
  2. trigonometric parallax (OpenNGC "Pax", in milliarcseconds) for stars,
     clusters and Milky Way nebulae, else
  3. the Hubble law for galaxies with a real redshift (z >= 0.0015), else
  4. unknown (distancePc = null; the frontend shows the line-of-sight
     direction only, never a made-up distance).
"""

import csv
import hashlib
import math
import urllib.request

import luna_common as luna
from deepsky_curated import CURATED

# OpenNGC type codes -> our normalised type (and a finer subtype).
TYPE_MAP = {
    "G": ("galaxy", "galaxy"),
    "GPair": ("galaxy", "galaxy pair"),
    "GTrpl": ("galaxy", "galaxy triplet"),
    "GGroup": ("galaxy", "galaxy group"),
    "OCl": ("open cluster", "open cluster"),
    "GCl": ("globular cluster", "globular cluster"),
    "PN": ("planetary nebula", "planetary nebula"),
    "Neb": ("nebula", "nebula"),
    "EmN": ("nebula", "emission nebula"),
    "RfN": ("nebula", "reflection nebula"),
    "HII": ("nebula", "H II region"),
    "Cl+N": ("nebula", "cluster with nebulosity"),
    "DrkN": ("nebula", "dark nebula"),
    "SNR": ("supernova remnant", "supernova remnant"),
    "*Ass": ("stellar association", "stellar association"),
}
# Left out: Dup (duplicate), NonEx (non-existent), Other, *, **, Nova.
SKIP = {"Dup", "NonEx", "Other", "*", "**", "Nova"}

CON_NAME = luna.CON_FULL


def ensure_download(url, path, expected_sha):
    if path.exists():
        data = path.read_bytes()
        if hashlib.sha256(data).hexdigest() == expected_sha:
            luna.status(f"cache hit {path.name} ({len(data)} bytes)")
            return data
    luna.status(f"downloading {url}")
    data = urllib.request.urlopen(url, timeout=90).read()
    got = hashlib.sha256(data).hexdigest()
    if got != expected_sha:
        raise SystemExit(f"sha256 mismatch for {url}: got {got}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return data


def parse_ra(text):
    h, m, s = text.split(":")
    return (float(h) + float(m) / 60 + float(s) / 3600) * 15.0


def parse_dec(text):
    sign = -1 if text.strip().startswith("-") else 1
    d, m, s = text.lstrip("+-").split(":")
    return sign * (float(d) + float(m) / 60 + float(s) / 3600)


def pretty_name(row):
    """Best display name: common name, else Messier, else catalog id."""
    common = row["Common names"].split(",")[0].strip()
    if common:
        return common
    if row["M"].strip():
        return f"M{row['M'].strip()}"
    name = row["Name"].strip()
    if name.startswith("NGC"):
        return f"NGC {name[3:].lstrip('0')}"
    if name.startswith("IC"):
        return f"IC {name[2:].lstrip('0')}"
    return name


def curated_lookup():
    """Map every curated name/alias (lower-cased) -> curated dict."""
    table = {}
    for obj in CURATED:
        keys = [obj["name"]] + obj.get("aliases", [])
        for k in keys:
            table[k.lower().replace(" ", "")] = obj
    return table


def match_curated(row, table):
    candidates = [row["Name"], row["Common names"].split(",")[0]]
    if row["M"].strip():
        candidates.append(f"M{row['M'].strip()}")
    if row["NGC"].strip():
        candidates.append(f"NGC{row['NGC'].strip()}")
    if row["IC"].strip():
        candidates.append(f"IC{row['IC'].strip()}")
    for c in candidates:
        c = c.strip()
        if not c:
            continue
        hit = table.get(c.lower().replace(" ", ""))
        if hit:
            return hit
    return None


def distance_for(row, kind, curated):
    if curated is not None:
        return curated["dist_pc"], "literature"
    # parallax (milliarcseconds) for Galactic objects
    pax = row["Pax"].strip()
    if pax:
        try:
            p = float(pax)
            if 0.1 <= p <= 50.0:
                return 1000.0 / p, "parallax"
        except ValueError:
            pass
    # redshift -> Hubble distance for genuinely distant galaxies
    if kind == "galaxy":
        z = row["Redshift"].strip()
        if z:
            try:
                zf = abs(float(z))
                if zf >= 0.0015:
                    mpc = zf * luna.SPEED_OF_LIGHT_KM_S / luna.HUBBLE_H0
                    return mpc * luna.PARSEC_MEGAPARSEC, "redshift"
            except ValueError:
                pass
    return None, None


def template_content(o):
    kind = o["type"]
    dist = o["distancePc"]
    where = o["constellation"] or "the sky"
    dtxt = ""
    if dist:
        ly = dist * luna.PARSEC_LIGHT_YEARS
        if ly >= 1e6:
            dtxt = f" It lies about {ly/1e6:.1f} million light-years away."
        elif ly >= 1000:
            dtxt = f" It lies about {ly/1000:.1f} thousand light-years away."
        else:
            dtxt = f" It lies about {ly:.0f} light-years away."
    size = o.get("sizeArcmin") or 0
    stxt = f" It spans roughly {size:.0f} arcminutes across the sky." if size >= 1 else ""
    phrases = {
        "galaxy": "a galaxy beyond our own",
        "open cluster": "an open star cluster, a loose family of young stars",
        "globular cluster": "a globular cluster, a dense ball of ancient stars",
        "planetary nebula": "a planetary nebula, the glowing shell of a dying star",
        "nebula": "a cloud of interstellar gas and dust",
        "supernova remnant": "the expanding debris of an exploded star",
        "stellar association": "a loose association of young stars",
        "black hole": "a black hole",
        "pulsar": "a spinning neutron star",
    }
    return (
        f"{o['name']} is {phrases.get(kind, 'a deep-sky object')} in "
        f"{where}.{dtxt}{stxt}",
        None,
    )


def build_from_row(row, curated, used_curated):
    code = row["Type"]
    if code in SKIP:
        return None
    if code not in TYPE_MAP:
        return None
    kind, subtype = TYPE_MAP[code]

    ra = parse_ra(row["RA"])
    dec = parse_dec(row["Dec"])
    dist, method = distance_for(row, kind, curated)

    # galactic direction (unit vector) and position
    ux, uy, uz = luna.radec_to_galactic_xyz(ra, dec, 1.0)
    if dist:
        x, y, z = ux * dist, uy * dist, uz * dist
    else:
        x = y = z = None

    if curated is not None:
        used_curated.add(curated["name"])
        name = curated["name"]
        blurb, fun = curated["blurb"], curated["funFact"]
        kind = curated["kind"]
    else:
        name = pretty_name(row)
        blurb = fun = None

    o = {
        "id": "ds-" + luna.slugify(row["Name"]),
        "name": name,
        "type": kind,
        "subtype": subtype,
        "ra": round(ra, 5),
        "dec": round(dec, 5),
        "dir": [round(ux, 6), round(uy, 6), round(uz, 6)],
        "x": round(x, 4) if x is not None else None,
        "y": round(y, 4) if y is not None else None,
        "z": round(z, 4) if z is not None else None,
        "distancePc": round(dist, 2) if dist else None,
        "distanceLy": round(dist * luna.PARSEC_LIGHT_YEARS, 1) if dist else None,
        "distanceMethod": method,
        "constellation": CON_NAME.get(row["Const"].strip()) or None,
        "magnitude": float(row["B-Mag"]) if row["B-Mag"].strip() else None,
        "sizeArcmin": float(row["MajAx"]) if row["MajAx"].strip() else None,
        "messier": f"M{row['M'].strip()}" if row["M"].strip() else None,
    }
    if blurb is None:
        blurb, fun = template_content(o)
    o["info"] = {"blurb": blurb, "funFact": fun}
    o["notable"] = bool(matrix_notable(row, curated))
    return o


def matrix_notable(row, curated):
    return (
        curated is not None
        or row["M"].strip() != ""
        or row["Common names"].strip() != ""
    )


def build_curated_extra(used):
    """Curated objects that didn't match an OpenNGC row (black holes, pulsars,
    Local Group galaxies, LMC/SMC)."""
    out = []
    for obj in CURATED:
        if obj["name"] in used:
            continue
        ux, uy, uz = luna.radec_to_galactic_xyz(obj["ra"], obj["dec"], 1.0)
        d = obj["dist_pc"]
        out.append({
            "id": "ds-" + luna.slugify(obj["name"]),
            "name": obj["name"],
            "type": obj["kind"],
            "subtype": obj["kind"],
            "ra": round(obj["ra"], 5),
            "dec": round(obj["dec"], 5),
            "dir": [round(ux, 6), round(uy, 6), round(uz, 6)],
            "x": round(ux * d, 4),
            "y": round(uy * d, 4),
            "z": round(uz * d, 4),
            "distancePc": round(d, 2),
            "distanceLy": round(d * luna.PARSEC_LIGHT_YEARS, 1),
            "distanceMethod": "literature",
            "constellation": None,
            "magnitude": obj["mag"] if obj["mag"] < 90 else None,
            "sizeArcmin": obj["sizeArcmin"] or None,
            "messier": None,
            "info": {"blurb": obj["blurb"], "funFact": obj["funFact"]},
            "notable": True,
        })
    return out


def main():
    ngc = ensure_download(luna.OPENNGC_NGC_URL, luna.OPENNGC_NGC,
                          luna.OPENNGC_NGC_SHA256)
    add = ensure_download(luna.OPENNGC_ADDENDUM_URL, luna.OPENNGC_ADDENDUM,
                          luna.OPENNGC_ADDENDUM_SHA256)

    table = curated_lookup()
    used = set()
    objects = []

    for raw, label in ((ngc, "NGC.csv"), (add, "addendum.csv")):
        text = raw.decode("utf-8")
        reader = csv.DictReader(text.splitlines(), delimiter=";")
        for row in reader:
            curated = match_curated(row, table)
            o = build_from_row(row, curated, used)
            if o:
                objects.append(o)

    objects.extend(build_curated_extra(used))

    # de-duplicate by id, keep curated-enriched first occurrence
    seen = {}
    for o in objects:
        seen.setdefault(o["id"], o)
    objects = list(seen.values())

    # sort by type then name for stable output
    objects.sort(key=lambda o: (o["type"], o["name"]))

    out = luna.OUT_DIR / "deep-sky.json"
    luna.write_json(out, objects)

    from collections import Counter
    counts = Counter(o["type"] for o in objects)
    withdist = sum(1 for o in objects if o["distancePc"])
    luna.status(
        f"wrote {out.relative_to(luna.PROJECT_DIR)}: {len(objects)} objects "
        f"({dict(counts)}); {withdist} with a known distance"
    )


if __name__ == "__main__":
    main()
