"""
Luna pipeline — Milestone D1: hand-curated mock catalog.

Builds public/data/stars.json and public/data/exoplanets.json for Person A.
Every number here is a carefully-checked approximation from standard
astrophysical references; D3 will replace all of it with real HYG data.
"""

import json
import math
from pathlib import Path

# ----------------------------------------------------------------------
# Constants
# ----------------------------------------------------------------------
PARSECS_PER_LIGHT_YEAR = 1 / 3.261563   # 1 pc = 3.261563 ly
SUN_ABSOLUTE_MAGNITUDE = 4.83           # Sun's absolute visual magnitude

# IAU rotation matrix: equatorial J2000 Cartesian -> galactic Cartesian.
# x_gal points toward the Galactic Centre, y_gal along Galactic rotation,
# z_gal toward the North Galactic Pole ("up" for Person A's galaxy plane).
GAL = [
    [-0.0548755604, -0.8734370902, -0.4838350155],
    [0.4941094279, -0.4448296300, 0.7469822445],
    [-0.8676661490, -0.1980763734, 0.4559837762],
]

CON_FULL = {
    "Aql": "Aquila", "Ari": "Aries", "Aqr": "Aquarius", "And": "Andromeda",
    "Aur": "Auriga", "Boo": "Boötes", "Car": "Carina", "Cas": "Cassiopeia", "Cen": "Centaurus",
    "Cet": "Cetus", "CMa": "Canis Major", "CMi": "Canis Minor", "Cyg": "Cygnus",
    "Dra": "Draco", "Eri": "Eridanus", "Gem": "Gemini", "Hya": "Hydra",
    "Leo": "Leo", "Lyr": "Lyra", "Oph": "Ophiuchus", "Ori": "Orion",
    "Pav": "Pavo", "Per": "Perseus", "Phe": "Phoenix", "Psc": "Pisces",
    "PsA": "Piscis Austrinus", "Sco": "Scorpius", "Sgr": "Sagittarius",
    "Tau": "Taurus", "UMa": "Ursa Major", "Vir": "Virgo",
}

# ----------------------------------------------------------------------
# Hand-curated star table (50 real stars).
# Fields: name, constellation, RA (deg, J2000), Dec (deg, J2000),
#         distance (light-years), apparent V magnitude, B-V colour index,
#         spectral type.
# Confidence: names/spectral types/constellations are solid; distances and
# positions of the bright stars are good to ~1-2%; variable and very distant
# stars (Betelgeuse, Deneb) carry larger error bars. All of it gets replaced
# by catalog data at D3.
# ----------------------------------------------------------------------
STARS_RAW = [
    # --- 30 well-known bright stars ---
    ("Sirius", "CMa", 101.2875, -16.7161, 8.60, -1.46, 0.01, "A1V"),
    ("Canopus", "Car", 95.9879, -52.6957, 310.0, 0.74, 0.15, "A9II"),
    ("Arcturus", "Boo", 213.9153, 19.1824, 36.7, -0.05, 1.23, "K0III"),
    ("Vega", "Lyr", 279.2347, 38.7837, 25.0, 0.03, 0.00, "A0V"),
    ("Capella", "Aur", 79.1723, 45.9980, 42.9, 0.08, 0.80, "G8III"),
    ("Rigel", "Ori", 78.6345, -8.2016, 860.0, 0.13, -0.03, "B8Ia"),
    ("Procyon", "CMi", 114.8255, 5.2250, 11.46, 0.34, 0.42, "F5IV-V"),
    ("Achernar", "Eri", 24.4285, -57.2368, 139.0, 0.46, -0.16, "B6Vpe"),
    ("Betelgeuse", "Ori", 88.7929, 7.4071, 640.0, 0.45, 1.85, "M1-2Iab"),
    ("Hadar", "Cen", 210.9559, -60.3730, 390.0, 0.61, -0.23, "B1III"),
    ("Altair", "Aql", 297.6959, 8.8683, 16.73, 0.76, 0.22, "A7V"),
    ("Aldebaran", "Tau", 68.9802, 16.5093, 65.3, 0.86, 1.54, "K5III"),
    ("Antares", "Sco", 247.3519, -26.4320, 550.0, 1.09, 1.83, "M1.5Iab"),
    ("Spica", "Vir", 201.2983, -11.1613, 250.0, 1.04, -0.23, "B1III-IV"),
    ("Pollux", "Gem", 116.3289, 28.0262, 33.8, 1.14, 1.00, "K0III"),
    ("Fomalhaut", "PsA", 344.4127, -29.6222, 25.13, 1.16, 0.09, "A3V"),
    ("Deneb", "Cyg", 310.3580, 45.2803, 2615.0, 1.25, 0.09, "A2Ia"),
    ("Regulus", "Leo", 152.0929, 11.9672, 79.3, 1.40, -0.11, "B7V"),
    ("Castor", "Gem", 113.6494, 31.8883, 51.0, 1.58, 0.03, "A1V"),
    ("Bellatrix", "Ori", 81.2828, 6.3497, 250.0, 1.64, -0.22, "B2III"),
    ("Alphard", "Hya", 141.8968, -8.6586, 177.0, 1.98, 1.44, "K3II"),
    ("Hamal", "Ari", 31.7933, 23.4624, 65.8, 2.00, 1.15, "K2III"),
    ("Diphda", "Cet", 10.8974, -17.9866, 96.0, 2.04, 1.17, "K0III"),
    ("Nunki", "Sgr", 283.8164, -26.2967, 228.0, 2.05, 0.22, "A2IV"),
    ("Menkalinan", "Aur", 89.8822, 44.9474, 81.0, 1.90, 0.08, "A1IV"),
    ("Alhena", "Gem", 99.4279, 16.3993, 109.0, 1.93, 0.00, "A1IV"),
    ("Mirfak", "Per", 51.0807, 49.8612, 510.0, 1.79, 0.48, "F5Ib"),
    ("Alkaid", "UMa", 206.8852, 49.3133, 103.9, 1.86, -0.19, "B3V"),
    ("Alioth", "UMa", 193.5073, 55.9598, 82.6, 1.77, -0.02, "A0p"),
    ("Dubhe", "UMa", 165.9320, 61.7510, 123.0, 1.79, 1.07, "K0III"),
    ("Polaris", "UMa", 37.9546, 89.2641, 433.0, 1.98, 0.60, "F7Ib"),
    # --- 20 famous nearby stars ---
    ("Proxima Cen", "Cen", 217.3818, -62.6761, 4.2465, 11.13, 1.82, "M5.5Ve"),
    ("Barnard's Star", "Oph", 269.4521, 4.6934, 5.963, 9.51, 1.57, "M4V"),
    ("Wolf 359", "Leo", 164.1208, 7.0147, 7.86, 13.54, 1.80, "M6Ve"),
    ("Lalande 21185", "UMa", 162.0741, 35.9699, 8.304, 7.49, 1.51, "M2V"),
    ("Ross 154", "Sgr", 270.9643, -23.8332, 9.69, 10.62, 1.56, "M3.5Ve"),
    ("Ross 248", "And", 355.5345, 44.1763, 10.30, 13.39, 1.72, "M5.5V"),
    ("61 Cygni", "Cyg", 316.7234, 38.7494, 11.40, 5.20, 1.38, "K5V"),
    ("eps Eri", "Eri", 53.2327, -9.4583, 10.475, 3.73, 0.82, "K2V"),
    ("Tau Ceti", "Cet", 26.0170, -15.9375, 11.895, 3.50, 0.72, "G8V"),
    ("Lacaille 9352", "Phe", 346.3855, -35.8531, 10.72, 7.34, 1.00, "M0.5V"),
    ("Kruger 60", "Dra", 338.1029, 57.7688, 13.07, 9.86, 1.47, "M3V"),
    ("Van Maanen's Star", "Psc", 12.2065, 5.3883, 14.07, 12.37, 0.32, "DZ8"),
    ("Ross 128", "Vir", 176.9388, 0.8037, 11.007, 11.13, 1.56, "M4V"),
    ("Groombridge 34", "And", 0.8316, 44.0235, 11.62, 8.09, 1.39, "M1.5V"),
    ("Sigma Draconis", "Dra", 293.0553, 69.6608, 18.8, 4.67, 0.83, "K0V"),
    ("70 Ophiuchi", "Oph", 274.0382, 2.5025, 16.6, 4.03, 0.86, "K0V"),
    ("Eta Cassiopeiae", "Cas", 14.2827, 57.8153, 19.4, 3.46, 0.58, "G0V"),
    ("Delta Pavonis", "Pav", 302.1825, -66.1826, 19.9, 3.55, 0.69, "G0IV"),
    ("TRAPPIST-1", "Aqr", 346.6256, -5.0434, 40.66, 18.86, None, "M8V"),
]  # 31 bright + 19 nearby = 50 stars

# ----------------------------------------------------------------------
# Hand-written fun facts (<= 25 words each). None => no fun fact (never invent).
# ----------------------------------------------------------------------
FUN_FACTS = {
    "Sirius": "Its brightness is boosted by Sirius B, a white dwarf companion that orbits every 50 years.",
    "Canopus": "Second-brightest star in the sky; several spacecraft used it as a navigation reference, including Apollo missions.",
    "Arcturus": "The brightest star of the northern hemisphere; its orange hue marks a red giant.",
    "Vega": "The zero-point of the old magnitude scale, and the first star ever photographed with a planet candidate.",
    "Capella": "Looks like one star but is two yellow giants orbiting each other every 104 days.",
    "Rigel": "A blue supergiant that outshines the Sun by a factor of roughly 100,000.",
    "Procyon": "Will become the North Star around AD 27,000, taking over from Polaris.",
    "Betelgeuse": "A red supergiant large enough to swallow Jupiter's orbit; it dims irregularly from surface eruptions.",
    "Altair": "Spins so fast (a 'day' under 9 hours) that it bulges visibly at its equator.",
    "Aldebaran": "Only appears near the Hyades cluster; it is roughly half their distance and just passing by.",
    "Antares": "Called the rival of Mars for its colour; it would reach past Mars orbit at our Sun's place.",
    "Spica": "A hot binary pair orbiting so close that a full 'year' takes only 4 days.",
    "Fomalhaut": "Ringed by a vast debris disk, once home to a disputed direct-imaging planet candidate.",
    "Deneb": "One of the most luminous stars visible, shining from thousands of light-years away.",
    "Polaris": "Not the brightest star, but it sits almost exactly above Earth's north celestial pole.",
    "Regulus": "Spins so fast it is squashed into an egg shape and completes a rotation in about 16 hours.",
    "Dubhe": "One of the two 'pointer stars' that aim the Big Dipper's handle at Polaris.",
    "Proxima Cen": "The closest known star to the Sun after the Sun itself - and it hosts a confirmed planet.",
    "Barnard's Star": "Has the largest proper motion of any star: it shifts a full Moon-width across the sky in 180 years.",
    "Wolf 359": "One of the faintest and lowest-mass stars known; a flare star that brightens unpredictably.",
    "eps Eri": "A young (under 1 billion years) Sun-like star with a dusty debris disk and a confirmed giant planet.",
    "Tau Ceti": "The nearest single Sun-like star; candidate planets around it are still debated, so Luna does not list them.",
    "Van Maanen's Star": "The nearest known solitary white dwarf: the dead core of a star that burned out long ago.",
    "Ross 128": "A quiet red dwarf hosting one of the nearest temperate rocky planets.",
    "61 Cygni": "The first star ever to have its distance measured, by Bessel in 1838 - proving stellar parallax.",
    "TRAPPIST-1": "Hosts seven Earth-sized planets, three in the habitable zone - a record for any single star.",
    "Lacaille 9352": "Catalogued by Nicolas Lacaille in the 1750s from the Cape of Good Hope.",
}

# ----------------------------------------------------------------------
# Exoplanet table — values fetched from the NASA Exoplanet Archive
# (TAP service, pscomppars table) on 2026-10-16.
# ----------------------------------------------------------------------
PLANETS_RAW = [
    dict(
        name="Proxima Cen b", host="Proxima Cen", massEarth=1.055, radiusEarth=1.02,
        periodDays=11.18465, discoveryYear=2016, method="Radial Velocity",
        blurb="An Earth-mass world orbiting the closest star to the Sun, inside its habitable zone. Found by the star's radial-velocity wobble in 2016.",
        funFact="It completes an orbit in under 12 days - its year is shorter than most human holidays.",
    ),
    dict(
        name="Ross 128 b", host="Ross 128", massEarth=1.40, radiusEarth=1.11,
        periodDays=9.8658, discoveryYear=2017, method="Radial Velocity",
        blurb="A temperate rocky planet around a quiet red dwarf 11 light-years away - one of the most promising nearby worlds for study.",
        funFact="Its star is unusually calm for a red dwarf, so the planet gets gentler radiation than most.",
    ),
    dict(
        name="eps Eri b", host="eps Eri", massEarth=317.828407, radiusEarth=13.8,
        periodDays=2680.0, discoveryYear=2000, method="Radial Velocity",
        blurb="A giant planet, at least as massive as Jupiter, orbiting a young Sun-like star every 7.3 years. One of the earliest exoplanet discoveries.",
        funFact="Announced in 2000, it was among the first exoplanets confirmed around a normal Sun-like star.",
    ),
    dict(
        name="TRAPPIST-1 b", host="TRAPPIST-1", massEarth=1.374, radiusEarth=1.116,
        periodDays=1.510826, discoveryYear=2016, method="Transit",
        blurb="The innermost of TRAPPIST-1's seven Earth-sized planets. Likely a hot, rocky world, now studied with the James Webb Space Telescope.",
        funFact="All seven TRAPPIST-1 planets could fit comfortably inside Mercury's orbit.",
    ),
    dict(
        name="TRAPPIST-1 e", host="TRAPPIST-1", massEarth=0.692, radiusEarth=0.920,
        periodDays=6.101013, discoveryYear=2017, method="Transit",
        blurb="The most Earth-like of TRAPPIST-1's planets: about Earth's size and mass, in the habitable zone where liquid water could exist.",
        funFact="It receives similar starlight to Earth, though its year lasts only about six days.",
    ),
]


# ----------------------------------------------------------------------
# Math helpers
# ----------------------------------------------------------------------
def light_years_to_parsecs(dist_ly: float) -> float:
    return dist_ly * PARSECS_PER_LIGHT_YEAR


def absolute_magnitude(apparent_mag: float, dist_ly: float) -> float:
    """Distance modulus: M = m - 5*log10(d_pc) + 5."""
    dist_pc = light_years_to_parsecs(dist_ly)
    return apparent_mag - 5.0 * math.log10(dist_pc / 10.0)


def ra_dec_to_equatorial_xyz(ra_deg: float, dec_deg: float, dist_pc: float):
    """Equatorial J2000 Cartesian, x toward vernal equinox, z at north celestial pole."""
    ra = math.radians(ra_deg)
    dec = math.radians(dec_deg)
    x = dist_pc * math.cos(dec) * math.cos(ra)
    y = dist_pc * math.cos(dec) * math.sin(ra)
    z = dist_pc * math.sin(dec)
    return x, y, z


def equatorial_to_galactic_xyz(x, y, z):
    """Rotate into galactic Cartesian (IAU definition)."""
    gx = GAL[0][0] * x + GAL[0][1] * y + GAL[0][2] * z
    gy = GAL[1][0] * x + GAL[1][1] * y + GAL[1][2] * z
    gz = GAL[2][0] * x + GAL[2][1] * y + GAL[2][2] * z
    return gx, gy, gz


def slugify(name: str) -> str:
    keep = [c.lower() if c.isalnum() else "-" for c in name]
    slug = "".join(keep)
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug.strip("-")


def spectral_description(spectral: str) -> str:
    colors = {
        "O": "blue", "B": "blue-white", "A": "white", "F": "yellow-white",
        "G": "yellow", "K": "orange", "M": "red",
    }
    if spectral.startswith("D"):
        return "a white dwarf"
    letter = spectral[0]
    color = colors.get(letter, "")
    # Check luminosity classes from rarest to most easily confused:
    # supergiant markers before III before II before IV before V.
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
    return f"a {color} {kind}{extra}" if color else f"a {kind}{extra}"


def make_blurb(name, spectral, dist_ly, abs_mag, con_abbr):
    desc = spectral_description(spectral)
    rel = "brighter" if abs_mag < SUN_ABSOLUTE_MAGNITUDE else "dimmer"
    return (
        f"{name} is {desc} (spectral class {spectral}) {dist_ly:g} light-years "
        f"from the Sun in {CON_FULL[con_abbr]} ({con_abbr}). At absolute magnitude "
        f"{abs_mag:.2f}, it appears {rel} than our Sun to the unaided eye."
    )


# ----------------------------------------------------------------------
# Build the catalog
# ----------------------------------------------------------------------
def build_stars():
    planet_hosts = {p["host"] for p in PLANETS_RAW}
    stars = []
    for i, (name, con, ra, dec, dist_ly, vmag, b_v, spectral) in enumerate(STARS_RAW, 1):
        dist_pc = light_years_to_parsecs(dist_ly)
        abs_mag = absolute_magnitude(vmag, dist_ly)
        gx, gy, gz = equatorial_to_galactic_xyz(*ra_dec_to_equatorial_xyz(ra, dec, dist_pc))
        star = {
            "id": f"mock-{slugify(name)}",
            "name": name,
            "x": round(gx, 2),
            "y": round(gy, 2),
            "z": round(gz, 2),
            "absMag": round(abs_mag, 2),
            "colorIndex": None if b_v is None else round(b_v, 2),
            "spectral": spectral,
            "distLy": round(dist_ly, 2),
            "constellation": con,
            "hasPlanets": name in planet_hosts,
            "info": {
                "blurb": make_blurb(name, spectral, dist_ly, abs_mag, con),
                "funFact": FUN_FACTS.get(name),
            },
        }
        stars.append(star)
    return stars


def build_planets(stars):
    by_name = {s["name"]: s["id"] for s in stars}
    planets = []
    for i, p in enumerate(PLANETS_RAW, 1):
        planets.append({
            "id": f"exo-{i:04d}",
            "name": p["name"],
            "hostId": by_name[p["host"]],
            "massEarth": p["massEarth"],
            "radiusEarth": p["radiusEarth"],
            "periodDays": round(p["periodDays"], 2),
            "discoveryYear": p["discoveryYear"],
            "method": p["method"],
            "info": {"blurb": p["blurb"], "funFact": p["funFact"]},
        })
    return planets


# ----------------------------------------------------------------------
# Validation (mini version of D8)
# ----------------------------------------------------------------------
def word_count(text):
    return len(text.split())


def validate(stars, planets):
    errors = []
    if len(stars) != 50:
        errors.append(f"expected 50 stars, got {len(stars)}")
    if len(planets) != 5:
        errors.append(f"expected 5 planets, got {len(planets)}")

    star_ids = [s["id"] for s in stars]
    if len(set(star_ids)) != len(star_ids):
        errors.append("duplicate star ids")

    for s in stars:
        dist_pc = light_years_to_parsecs(s["distLy"])
        r = math.sqrt(s["x"] ** 2 + s["y"] ** 2 + s["z"] ** 2)
        if abs(r - dist_pc) > 0.05:
            errors.append(f"{s['id']}: position length {r:.3f} != distance {dist_pc:.3f} pc")
        if s["info"]["blurb"] and word_count(s["info"]["blurb"]) > 60:
            errors.append(f"{s['id']}: blurb too long")
        if s["info"]["funFact"] and word_count(s["info"]["funFact"]) > 25:
            errors.append(f"{s['id']}: fun fact too long")

    for p in planets:
        if p["hostId"] not in star_ids:
            errors.append(f"{p['id']}: hostId {p['hostId']} not in stars")
        if p["radiusEarth"] is not None and not (0.1 < p["radiusEarth"] < 50):
            errors.append(f"{p['id']}: implausible radiusEarth")
        if p["info"]["blurb"] and word_count(p["info"]["blurb"]) > 60:
            errors.append(f"{p['id']}: blurb too long")
        if p["info"]["funFact"] and word_count(p["info"]["funFact"]) > 25:
            errors.append(f"{p['id']}: fun fact too long")

    return errors


def main():
    out_dir = Path(__file__).resolve().parent.parent / "luna" / "public" / "data"
    out_dir.mkdir(parents=True, exist_ok=True)

    stars = build_stars()
    planets = build_planets(stars)

    errors = validate(stars, planets)
    if errors:
        print("VALIDATION FAILED:")
        for e in errors:
            print("  -", e)
        return

    stars_path = out_dir / "stars.json"
    planets_path = out_dir / "exoplanets.json"
    stars_path.write_text(json.dumps(stars, indent=1), encoding="utf-8")
    planets_path.write_text(json.dumps(planets, indent=1), encoding="utf-8")

    n_facts = sum(1 for s in stars if s["info"]["funFact"])
    print("D1 mock catalog built OK")
    print(f"  stars.json     : {len(stars)} stars, {stars_path.stat().st_size / 1024:.1f} KB "
          f"({n_facts} with fun facts, {len(stars) - n_facts} data-driven only)")
    print(f"  exoplanets.json: {len(planets)} planets, {planets_path.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
