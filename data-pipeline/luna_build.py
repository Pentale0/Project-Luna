"""
Shared builders that turn cleaned catalog rows into contract-shaped objects.
Used by d04_subset.py (stars) and d05_exoplanets.py (planets + host stars).
"""

import math

import d07_content as content
import luna_common as luna


def resolve_name(row):
    """Pick the friendliest available name for a HYG row."""
    proper = row.get("proper")
    if isinstance(proper, str) and proper.strip():
        return proper.strip()
    bayer = row.get("bayer")
    flam = row.get("flam")
    con = row.get("con")
    has_flam = flam is not None and not (isinstance(flam, float) and math.isnan(flam))
    has_bayer = isinstance(bayer, str) and bayer.strip()
    if has_flam or has_bayer:
        parts = []
        if has_flam:
            parts.append(str(int(flam)))
        if has_bayer:
            parts.append(bayer.strip())
        if isinstance(con, str) and con.strip():
            parts.append(con.strip())
        return " ".join(parts)
    gl = row.get("gl")
    if isinstance(gl, str) and gl.strip():
        return gl.strip() if gl.strip().lower().startswith("gl") else f"Gliese {gl.strip()}"
    hd = row.get("hd")
    if hd is not None and not (isinstance(hd, float) and math.isnan(hd)):
        return f"HD {int(hd)}"
    hip = row.get("hip")
    if hip is not None and not (isinstance(hip, float) and math.isnan(hip)):
        return f"HIP {int(hip)}"
    return f"HYG {int(row['id'])}"


def _clean_float(value):
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    return float(value)


def build_star(row, has_planets=False):
    """row: dict from cache/hyg_clean.csv -> contract star object."""
    dist_pc = float(row["dist_pc"])
    dist_ly = luna.light_years_from_parsecs(dist_pc)
    name = resolve_name(row)

    abs_mag = _clean_float(row.get("absmag"))
    if abs_mag is None:
        abs_mag = luna.absolute_magnitude(_clean_float(row.get("mag")), dist_pc)

    color = _clean_float(row.get("ci"))
    spectral = row.get("spect")
    spectral = spectral.strip() if isinstance(spectral, str) and spectral.strip() else None
    con = row.get("con")
    con = con.strip() if isinstance(con, str) and con.strip() else None

    blurb, fun_fact = content.star_content(name, spectral, round(dist_ly, 2),
                                           round(abs_mag, 2) if abs_mag is not None else None, con)
    vx = _clean_float(row.get("vx")) or 0.0
    vy = _clean_float(row.get("vy")) or 0.0
    vz = _clean_float(row.get("vz")) or 0.0
    return {
        "id": f"hyg-{int(row['id'])}",
        "name": name,
        "x": round(float(row["x"]), 3),
        "y": round(float(row["y"]), 3),
        "z": round(float(row["z"]), 3),
        "vx": round(vx, 7),
        "vy": round(vy, 7),
        "vz": round(vz, 7),
        "absMag": round(abs_mag, 2) if abs_mag is not None else None,
        "colorIndex": round(color, 2) if color is not None else None,
        "spectral": spectral,
        "distLy": round(dist_ly, 2),
        "constellation": con,
        "hasPlanets": has_planets,
        "info": {"blurb": blurb, "funFact": fun_fact},
    }


def subset_mask(row):
    """D4 subset rule: all stars within 30 pc, OR naked-eye stars (mag <= 6.5),
    OR any star with a proper name."""
    dist_pc = float(row["dist_pc"])
    mag = _clean_float(row.get("mag"))
    proper = row.get("proper")
    named = isinstance(proper, str) and proper.strip() != ""
    return dist_pc <= 30.0 or (mag is not None and mag <= 6.5) or named


METHOD_LABELS = {
    "radial velocity": "Radial velocity",
    "transit": "Transit",
    "imaging": "Direct imaging",
    "microlensing": "Microlensing",
    "transit timing variations": "Transit timing variations",
    "astrometry": "Astrometry",
    "pulsar timing": "Pulsar timing",
    "pulsation timing variations": "Pulsation timing variations",
    "eclipse timing variations": "Eclipse timing variations",
    "orbital brightness modulations": "Orbital brightness modulations",
    "disk kinematics": "Disk kinematics",
}


def label_method(raw):
    if not isinstance(raw, str):
        return None
    key = raw.strip().lower()
    if key in METHOD_LABELS:
        return METHOD_LABELS[key]
    return raw.strip().capitalize()


def build_planet(row, host_id, host_name, host_dist_ly):
    mass = _clean_float(row.get("pl_bmasse"))
    radius = _clean_float(row.get("pl_rade"))
    period = _clean_float(row.get("pl_orbper"))
    year = row.get("disc_year")
    year = int(year) if year is not None and not (isinstance(year, float) and math.isnan(year)) else None
    method = label_method(row.get("discoverymethod"))

    blurb, fun_fact = content.planet_content(
        name=row["pl_name"], host=host_name, mass_earth=mass, radius_earth=radius,
        period_days=period, method=method,
        for_famous=(year if year is not None else None),
    )
    return {
        "id": f"exo-{luna.slugify(row['pl_name'])}",
        "name": row["pl_name"],
        "hostId": host_id,
        "massEarth": _round_measure(mass),
        "radiusEarth": _round_measure(radius),
        "periodDays": round(period, 4) if period is not None else None,
        "discoveryYear": year,
        "method": method,
        "info": {"blurb": blurb, "funFact": fun_fact},
    }


def _round_measure(value):
    if value is None:
        return None
    if value >= 100:
        return round(value)
    if value >= 10:
        return round(value, 1)
    return round(value, 3)
