"""
Shared constants and helpers for the Luna data pipeline.

Everything here is imported by the numbered stage scripts (d02_..., d03_...).
"""

import json
import math
import re
from pathlib import Path

# ---------------------------------------------------------------- paths
PIPELINE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = PIPELINE_DIR.parent
CACHE_DIR = PIPELINE_DIR / "cache"
OUT_DIR = PROJECT_DIR / "luna" / "public" / "data"

HYG_GZ = CACHE_DIR / "hyg_v44.csv.gz"
HYG_CLEAN = CACHE_DIR / "hyg_clean.csv"
EXO_RAW = CACHE_DIR / "exoplanets_raw.csv"

# HYG v4.4 (Codeberg, Git-LFS). sha256 is the LFS object id, so a re-download
# can be verified byte-for-byte.
HYG_URL = "https://codeberg.org/astronexus/hyg/media/branch/main/data/hyg/CURRENT/hyg_v44.csv.gz"
HYG_SHA256 = "00b349893b9a53106dd488d8371e8d2fa586043e500bb3cdb8bff3931682197d"
HYG_VERSION = "HYG v4.4 (2026)"

EXO_TAP = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync"

# ---------------------------------------------------------------- units
PARSEC_LIGHT_YEARS = 3.261563           # 1 pc = 3.261563 ly
SUN_ABSOLUTE_MAGNITUDE = 4.83
AU_KM = 149_597_870.7
EARTH_MASS_KG = 5.9722e24
EARTH_RADIUS_KM = 6371.0
JUPITER_EARTH_MASSES = 317.828

# A missing distance in HYG is encoded as 100000 parsecs.
HYG_DIST_SENTINEL = 100000.0

# ---------------------------------------------- equatorial -> galactic
# IAU J2000 rotation matrix. x_gal -> Galactic Centre, z_gal -> NGP ("up").
GAL_MATRIX = (
    (-0.0548755604, -0.8734370902, -0.4838350155),
    (0.4941094279, -0.4448296300, 0.7469822445),
    (-0.8676661490, -0.1980763734, 0.4559837762),
)

CON_FULL = {
    "And": "Andromeda", "Aqr": "Aquarius", "Aql": "Aquila", "Ari": "Aries",
    "Aur": "Auriga", "Boo": "Boötes", "Car": "Carina", "Cas": "Cassiopeia",
    "Cen": "Centaurus", "Cet": "Cetus", "CMa": "Canis Major",
    "CMi": "Canis Minor", "Cyg": "Cygnus", "Dra": "Draco", "Eri": "Eridanus",
    "Gem": "Gemini", "Gru": "Grus", "Her": "Hercules", "Hya": "Hydra",
    "Leo": "Leo", "Lep": "Lepus", "Lyr": "Lyra", "Oph": "Ophiuchus",
    "Ori": "Orion", "Pav": "Pavo", "Peg": "Pegasus", "Per": "Perseus",
    "Phe": "Phoenix", "Psc": "Pisces", "PsA": "Piscis Austrinus",
    "Sco": "Scorpius", "Sgr": "Sagittarius", "Tau": "Taurus", "TrA": "Triangulum Australe",
    "UMa": "Ursa Major", "UMi": "Ursa Minor", "Vir": "Virgo", "Vol": "Volans",
}


def con_name(abbr):
    if not abbr:
        return None
    return CON_FULL.get(abbr, abbr)


# ---------------------------------------------------------------- math
def light_years_from_parsecs(dist_pc):
    return dist_pc * PARSEC_LIGHT_YEARS


def absolute_magnitude(apparent_mag, dist_pc):
    """Distance modulus M = m - 5*log10(d_pc/10)."""
    if apparent_mag is None or dist_pc is None or dist_pc <= 0:
        return None
    return apparent_mag - 5.0 * math.log10(dist_pc / 10.0)


def radec_to_galactic_xyz(ra_deg, dec_deg, dist_pc):
    """RA (deg), Dec (deg), distance (pc) -> galactic Cartesian parsecs."""
    ra = math.radians(ra_deg)
    dec = math.radians(dec_deg)
    x_eq = dist_pc * math.cos(dec) * math.cos(ra)
    y_eq = dist_pc * math.cos(dec) * math.sin(ra)
    z_eq = dist_pc * math.sin(dec)
    (a, b, c), (d, e, f), (g, h, i) = GAL_MATRIX
    gx = a * x_eq + b * y_eq + c * z_eq
    gy = d * x_eq + e * y_eq + f * z_eq
    gz = g * x_eq + h * y_eq + i * z_eq
    return gx, gy, gz


# ---------------------------------------------------------------- text
def slugify(text):
    text = text.lower().replace("'", "").replace(".", "")
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


def spectral_description(spectral):
    """Turn a spectral type into a short human phrase."""
    if not spectral:
        return "a star"
    colors = {
        "O": "blue", "B": "blue-white", "A": "white", "F": "yellow-white",
        "G": "yellow", "K": "orange", "M": "red", "L": "deep-red",
        "T": "infrared", "W": "very hot", "C": "carbon-rich", "S": "red",
    }
    if spectral.startswith("D"):
        return "a white dwarf"
    color = colors.get(spectral[0], "")
    if "Ia" in spectral or "Ib" in spectral:
        kind = "supergiant"
    elif "III" in spectral:
        kind = "giant"
    elif "II" in spectral:
        kind = "bright giant"
    elif "IV" in spectral:
        kind = "subgiant"
    elif "V" in spectral:
        kind = "main-sequence star"
    else:
        kind = "star"
    extra = " with emission lines" if "e" in spectral[1:] else ""
    return (f"a {color} {kind}{extra}" if color else f"a {kind}{extra}")


def status(message):
    print(f"[luna] {message}")


def write_json(path, payload, compact=True):
    path.parent.mkdir(parents=True, exist_ok=True)
    if compact:
        text = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    else:
        text = json.dumps(payload, indent=1, ensure_ascii=False)
    path.write_text(text, encoding="utf-8")
    return path
