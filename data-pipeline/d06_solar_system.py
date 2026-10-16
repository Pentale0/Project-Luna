"""
D6 - Solar System.

Builds public/data/solar-system.json: the Sun, 8 planets, 5 dwarf planets and
14 major moons, with orbital data and popup content.

Values: NASA Planetary Fact Sheet (NSSDCA, metric, updated 18 March 2025) for
the Sun, planets, Moon and Pluto; NASA/JPL and IAU values for dwarf planets
and the remaining moons. Masses are converted to Earth masses
(= 5.9722e24 kg). See DATA_SOURCES.md.
"""

import luna_common as luna

# id, name, type, parent, semiMajorAxisAu, distanceFromParentKm, periodDays,
# eccentricity, radiusKm, massEarth, blurb, funFact
BODIES = [
    ("sol-sun", "Sun", "star", None, None, None, None, None, 695700.0, 332946.0,
     "The Sun is a G2V yellow dwarf at the centre of the Solar System, holding 99.86% of its mass. Its core fuses hydrogen into helium, releasing the light and heat that sustain Earth.",
     "Light from the Sun takes about 8 minutes 20 seconds to reach Earth."),

    ("sol-mercury", "Mercury", "planet", "sol-sun", 0.387, None, 87.97, 0.206, 2439.5, 0.0553,
     "Mercury is the smallest planet and the closest to the Sun, a cratered, airless world that swings between scorching days and freezing nights.",
     "One Mercury day, sunrise to sunrise, lasts about 176 Earth days."),
    ("sol-venus", "Venus", "planet", "sol-sun", 0.723, None, 224.70, 0.007, 6052.0, 0.8150,
     "Venus is Earth's near-twin in size, wrapped in a crushing carbon-dioxide atmosphere and clouds of sulphuric acid. A runaway greenhouse keeps its surface near 464 C.",
     "Venus spins backwards, and its day is longer than its year."),
    ("sol-earth", "Earth", "planet", "sol-sun", 1.000, None, 365.26, 0.017, 6371.0, 1.0000,
     "Earth is the third planet and the only world known to host life, with liquid water covering about 71% of its surface and a protective magnetic field.",
     "Earth is the densest planet in the Solar System."),
    ("sol-mars", "Mars", "planet", "sol-sun", 1.524, None, 686.98, 0.094, 3396.0, 0.1075,
     "Mars is a cold desert world with rusty soil, the tallest volcano in the Solar System and a canyon system that dwarfs any on Earth.",
     "Olympus Mons rises about two and a half times the height of Mount Everest."),
    ("sol-jupiter", "Jupiter", "planet", "sol-sun", 5.204, None, 4332.59, 0.049, 71492.0, 317.9,
     "Jupiter is the largest planet, a gas giant more massive than all the other planets combined. Its Great Red Spot is a storm wider than Earth.",
     "Jupiter spins faster than any other planet; its day lasts under 10 hours."),
    ("sol-saturn", "Saturn", "planet", "sol-sun", 9.573, None, 10759.2, 0.052, 60268.0, 95.14,
     "Saturn is a gas giant famous for its dazzling rings of ice and rock. It is the least dense planet, with an average density less than that of water.",
     "Its glorious rings are enormous but only tens of metres thick in places."),
    ("sol-uranus", "Uranus", "planet", "sol-sun", 19.165, None, 30688.5, 0.047, 25559.0, 14.54,
     "Uranus is an ice giant that orbits tipped on its side, probably after a giant impact, so it rolls around the Sun. Methane gives it a pale blue-green colour.",
     "Its extreme tilt gives each pole about 42 years of continuous sunlight."),
    ("sol-neptune", "Neptune", "planet", "sol-sun", 30.180, None, 60195.0, 0.010, 24764.0, 17.08,
     "Neptune is the farthest planet, a windy ice giant where supersonic storms rage. It was the first planet found by mathematical prediction rather than by chance.",
     "Its winds are the fastest in the Solar System, exceeding 2,000 km/h."),

    ("sol-pluto", "Pluto", "dwarf planet", "sol-sun", 39.482, None, 90560.0, 0.244, 1188.3, 0.002177,
     "Pluto is a small icy dwarf planet in the Kuiper Belt with five known moons. New Horizons revealed nitrogen-ice plains and mountains of water ice.",
     "Pluto is smaller than Earth's Moon."),
    ("sol-ceres", "Ceres", "dwarf planet", "sol-sun", 2.770, None, 1681.6, 0.076, 469.7, 0.0001571,
     "Ceres is the largest object in the asteroid belt and the only dwarf planet in the inner Solar System, with bright salt deposits and possible water ice.",
     "It contains roughly a quarter of the asteroid belt's total mass."),
    ("sol-eris", "Eris", "dwarf planet", "sol-sun", 67.78, None, 203830.0, 0.436, 1163.0, 0.002757,
     "Eris is a dwarf planet far beyond Neptune and slightly more massive than Pluto; its discovery led astronomers to redefine what a planet is.",
     "Its 2005 discovery prompted the new definition of a planet."),
    ("sol-haumea", "Haumea", "dwarf planet", "sol-sun", 43.13, None, 103410.0, 0.195, 816.0, 0.000671,
     "Haumea is a fast-spinning dwarf planet stretched into an oval by its rapid rotation, and it has a ring and two small moons.",
     "A day on Haumea lasts under four hours, among the fastest known."),
    ("sol-makemake", "Makemake", "dwarf planet", "sol-sun", 45.79, None, 112897.0, 0.159, 715.0, 0.000519,
     "Makemake is a bright dwarf planet in the Kuiper Belt, reddish like Pluto and coated in frozen methane.",
     "Discovered just after Easter 2005, it was named for the creator god of Easter Island."),

    ("sol-moon", "Moon", "moon", "sol-earth", None, 384400.0, 27.322, 0.055, 1737.4, 0.01230,
     "The Moon is Earth's only natural satellite, stabilising our planet's axial tilt and driving the ocean tides.",
     "It is slowly drifting away from Earth by about 3.8 cm per year."),
    ("sol-phobos", "Phobos", "moon", "sol-mars", None, 9376.0, 0.3189, 0.015, 11.27, 0.000000001785,
     "Phobos is the larger, inner moon of Mars, a dark, cratered body spiralling slowly inward toward the planet.",
     "It rises in the west and sets in the east, twice every Martian day."),
    ("sol-deimos", "Deimos", "moon", "sol-mars", None, 23463.0, 1.263, 0.0003, 6.20, 0.000000000413,
     "Deimos is the smaller, outer moon of Mars, a lumpy grey body only about 12 km across.",
     "It is so small that from Mars it would look like a bright star."),
    ("sol-io", "Io", "moon", "sol-jupiter", None, 421700.0, 1.769, 0.004, 1821.6, 0.01496,
     "Io is the most volcanically active world in the Solar System, squeezed by Jupiter's tides into constant eruptions of sulphur.",
     "Hundreds of active volcanoes paint Io in vivid yellow and red."),
    ("sol-europa", "Europa", "moon", "sol-jupiter", None, 671100.0, 3.551, 0.009, 1560.8, 0.008039,
     "Europa is an icy moon of Jupiter with a possible global ocean beneath its frozen shell, one of the best places to search for life.",
     "Its ice crust may hide twice as much water as all of Earth's oceans."),
    ("sol-ganymede", "Ganymede", "moon", "sol-jupiter", None, 1070400.0, 7.155, 0.001, 2634.1, 0.02482,
     "Ganymede is the largest moon in the Solar System, bigger than Mercury, and the only moon known to generate its own magnetic field.",
     "It is larger than the planet Mercury."),
    ("sol-callisto", "Callisto", "moon", "sol-jupiter", None, 1882700.0, 16.689, 0.007, 2410.3, 0.01802,
     "Callisto is an ancient, heavily cratered moon of Jupiter whose surface has barely changed in billions of years.",
     "It has the oldest, most cratered surface known in the Solar System."),
    ("sol-titan", "Titan", "moon", "sol-saturn", None, 1221870.0, 15.945, 0.029, 2574.7, 0.02252,
     "Titan is Saturn's largest moon, the only moon with a thick atmosphere, and the only other world with rivers and seas on its surface.",
     "Its rivers and seas are made of liquid methane, not water."),
    ("sol-enceladus", "Enceladus", "moon", "sol-saturn", None, 237948.0, 1.370, 0.005, 252.1, 0.00001809,
     "Enceladus is a small, bright moon of Saturn that vents plumes of water vapour and ice from a hidden subsurface ocean.",
     "Its icy plumes feed one of Saturn's faint outer rings."),
    ("sol-rhea", "Rhea", "moon", "sol-saturn", None, 527108.0, 4.518, 0.001, 763.8, 0.0003861,
     "Rhea is Saturn's second-largest moon, an icy, cratered world that may even have a thin ring of its own.",
     "It may be the only moon known to have its own ring system."),
    ("sol-titania", "Titania", "moon", "sol-uranus", None, 435910.0, 8.706, 0.001, 788.4, 0.0005692,
     "Titania is the largest moon of Uranus, an icy world scarred by enormous canyons formed as it expanded and cracked.",
     "Its canyons stretch for more than a thousand kilometres."),
    ("sol-oberon", "Oberon", "moon", "sol-uranus", None, 583520.0, 13.463, 0.001, 761.4, 0.0005150,
     "Oberon is the outermost large moon of Uranus, an ancient icy body with dark deposits scattered across its cratered face.",
     "It is the second-largest moon of Uranus and unusually dark."),
    ("sol-triton", "Triton", "moon", "sol-neptune", None, 354759.0, 5.877, 0.000016, 1353.4, 0.003582,
     "Triton is Neptune's largest moon and orbits backwards, suggesting it was captured from the Kuiper Belt. Ice geysers erupt from its surface.",
     "It is one of the few geologically active moons known."),
    ("sol-charon", "Charon", "moon", "sol-pluto", None, 19591.0, 6.387, 0.0002, 606.0, 0.0002656,
     "Charon is Pluto's largest moon, so large that the two orbit a point in space between them, making them almost a double dwarf planet.",
     "Pluto and Charon are sometimes described as a double planet."),
]


def build():
    bodies = []
    for (bid, name, btype, parent, a_au, dist_km, period, ecc, radius, mass,
         blurb, fun_fact) in BODIES:
        bodies.append({
            "id": bid,
            "name": name,
            "type": btype,
            "parentId": parent,
            "semiMajorAxisAu": a_au,
            "distanceFromParentKm": dist_km,
            "orbitalPeriodDays": period,
            "eccentricity": ecc,
            "radiusKm": radius,
            "massEarth": mass,
            "info": {"blurb": blurb, "funFact": fun_fact},
        })
    return bodies


def main():
    bodies = build()
    out = luna.OUT_DIR / "solar-system.json"
    luna.write_json(out, bodies)
    counts = {}
    for body in bodies:
        counts[body["type"]] = counts.get(body["type"], 0) + 1
    luna.status(f"wrote {out.relative_to(luna.PROJECT_DIR)}: {len(bodies)} bodies "
                f"({counts})")


if __name__ == "__main__":
    main()
