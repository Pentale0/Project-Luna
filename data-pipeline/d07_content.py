"""
D7 - Popup content.

Hand-written blurbs/fun facts for famous objects, plus template generators
that build a factual, data-driven blurb for every other object.

Rules (from the data contract):
  * blurb <= 60 words, fun fact <= 25 words
  * never invent lore: unknown -> None
"""

from luna_common import con_name, spectral_description, SUN_ABSOLUTE_MAGNITUDE

# ----------------------------------------------------------------------
# Famous stars, keyed by the name the pipeline will emit (HYG proper name,
# IAU where available). Aliases resolve alternate spellings.
# ----------------------------------------------------------------------
FAMOUS_STARS = {
    "Sirius": (
        "Sirius is the brightest star in Earth's night sky - a white A-type main-sequence star just 8.6 light-years away in Canis Major. It is orbited by Sirius B, a faint white dwarf.",
        "Its brightness is boosted by Sirius B, a white dwarf that orbits every 50 years.",
    ),
    "Canopus": (
        "Canopus is a bright giant in Carina and the second-brightest star in the night sky, about 310 light-years away. Its steadiness made it a favourite navigation star.",
        "Several spacecraft, including the Apollo missions, used Canopus as a navigation reference.",
    ),
    "Arcturus": (
        "Arcturus is an orange giant in Boötes, around 37 light-years away, and the brightest star of the northern celestial hemisphere with an absolute magnitude near zero.",
        "It is racing through the galaxy on an unusual orbit, likely from an older stellar population.",
    ),
    "Vega": (
        "Vega is a white A-type star in Lyra, 25 light-years away, and the historical zero-point of the magnitude scale. It spins so fast that its poles are much hotter than its equator.",
        "Vega once served as the zero-point for the magnitude scale and is slowly becoming the North Star.",
    ),
    "Capella": (
        "Capella in Auriga looks like a single bright star but is really two yellow giant stars orbiting each other, about 43 light-years from the Sun.",
        "Its two giant stars orbit each other every 104 days; a distant red pair also joins the system.",
    ),
    "Rigel": (
        "Rigel is a blue supergiant in Orion, roughly 860 light-years away, and one of the most luminous stars visible to the eye - far brighter than the Sun.",
        "It shines with roughly one hundred thousand times the Sun's power.",
    ),
    "Procyon": (
        "Procyon is a yellowish subgiant in Canis Minor, 11.5 light-years away, and the eighth-brightest star in the sky. Like Sirius it has a white-dwarf companion.",
        "Procyon will drift nearer and eventually become the brightest star in the sky.",
    ),
    "Achernar": (
        "Achernar is a hot blue star at the end of the river Eridanus, about 139 light-years away, and one of the flattest stars known because it rotates extremely fast.",
        "It spins so quickly that its equatorial diameter is over a third larger than its polar one.",
    ),
    "Betelgeuse": (
        "Betelgeuse is a red supergiant in Orion's shoulder, several hundred light-years away. It is enormous but unstable, dimming and brightening irregularly.",
        "It is large enough to swallow Jupiter's orbit and will one day explode as a supernova.",
    ),
    "Hadar": (
        "Hadar, or Beta Centauri, is a hot blue giant pairing in Centaurus about 390 light-years away, and the tenth-brightest star in the night sky.",
        "Together with Alpha Centauri it forms the 'Southern Pointers' toward the Southern Cross.",
    ),
    "Altair": (
        "Altair is a bright white star in Aquila, only 16.7 light-years away. It rotates so rapidly that it is visibly flattened, wider across its equator than pole to pole.",
        "A day on Altair lasts under nine hours, squashing the star into an oval.",
    ),
    "Aldebaran": (
        "Aldebaran is an orange giant in Taurus, about 65 light-years away, marking the eye of the bull. It only appears to sit among the Hyades cluster, which is twice as far.",
        "It is not a member of the nearby Hyades cluster; it simply lies in the same direction.",
    ),
    "Antares": (
        "Antares is a red supergiant in Scorpius, roughly 550 light-years away. Its name means 'rival of Mars', from its fiery colour.",
        "Placed at the Sun, Antares would extend beyond the orbit of Mars.",
    ),
    "Spica": (
        "Spica is a hot blue star in Virgo, about 250 light-years away, and actually a close pair of stars whirling around each other in just four days.",
        "Its two stars orbit so closely that they distort each other into egg shapes.",
    ),
    "Pollux": (
        "Pollux is an orange giant in Gemini, about 34 light-years away, and the closest giant star to the Sun. It is orbited by a confirmed giant planet.",
        "It is the nearest giant star to Earth and hosts a known planet.",
    ),
    "Fomalhaut": (
        "Fomalhaut is a young white star in Piscis Austrinus, 25 light-years away, famous for a bright debris ring imaged by Hubble and Webb.",
        "Its dusty ring and sharp inner edge hint at unseen planets shepherding the debris.",
    ),
    "Deneb": (
        "Deneb is a blue-white supergiant in Cygnus, perhaps 2,600 light-years away, and one of the most luminous stars visible to the naked eye.",
        "Despite its enormous power, it is among the most distant stars you can see unaided.",
    ),
    "Regulus": (
        "Regulus is a hot blue star in Leo, 79 light-years away, lying almost exactly on the ecliptic so the Moon and planets regularly pass near it.",
        "It spins so fast it is squashed into an egg shape, rotating in about 16 hours.",
    ),
    "Castor": (
        "Castor, in Gemini, looks like one star but is a remarkable system of six stars bound together, about 51 light-years away.",
        "A small telescope splits it into two, but each is itself a close binary.",
    ),
    "Bellatrix": (
        "Bellatrix is a hot blue giant in Orion, about 250 light-years away, marking the hunter's left shoulder and shining far brighter than the Sun.",
        "Its name means 'female warrior' in Latin.",
    ),
    "Alphard": (
        "Alphard is an orange giant in Hydra, about 177 light-years away, the brightest star of the water snake and historically called the 'solitary one'.",
        "It stands alone in a sparse part of Hydra, far from other bright stars.",
    ),
    "Hamal": (
        "Hamal is an orange giant in Aries, about 66 light-years away, and the brightest star of the ram.",
        "It was the point in the sky that defined the First Point of Aries in ancient astronomy.",
    ),
    "Diphda": (
        "Diphda, or Beta Ceti, is a bright orange giant in Cetus about 96 light-years away, the brightest star of the sea monster.",
        "Its name means 'the frog' in Arabic, from its position near the celestial ocean.",
    ),
    "Nunki": (
        "Nunki is a blue-white star in Sagittarius about 228 light-years away, marking the star at the top of the Archer's bow.",
        "It lies close to the direction of the Galactic Centre, though far nearer to us.",
    ),
    "Menkalinan": (
        "Menkalinan is a white subgiant in Auriga, about 81 light-years away, and one of the brightest eclipsing binary systems in the sky.",
        "Every two days, its two stars eclipse each other and the pair visibly fades.",
    ),
    "Alhena": (
        "Alhena is a white subgiant in Gemini, about 109 light-years away, marking the foot of Pollux and the third-brightest star of the twins.",
        "Its name comes from an Arabic phrase meaning 'the brand on the neck of the camel'.",
    ),
    "Mirfak": (
        "Mirfak is a yellow-white supergiant in Perseus, around 510 light-years away, the brightest member of the sprawling Alpha Persei cluster.",
        "It sits inside a loose moving group of young stars that share its motion.",
    ),
    "Alkaid": (
        "Alkaid is a hot blue star at the end of the Big Dipper's handle, about 104 light-years away, the youngest of the Dipper's seven stars.",
        "It is not part of the Big Dipper's common motion; it just happens to lie along the same line of sight.",
    ),
    "Alioth": (
        "Alioth is the brightest star of the Big Dipper, a peculiar A-type star about 83 light-years away with a strong magnetic field.",
        "It is the nearest star to Earth with a measurable, ordered magnetic field.",
    ),
    "Dubhe": (
        "Dubhe is an orange giant in Ursa Major, about 123 light-years away, and one of the two 'pointer' stars of the Big Dipper.",
        "The pointers Dubhe and Merak aim straight at Polaris, the North Star.",
    ),
    "Polaris": (
        "Polaris is a yellow supergiant in Ursa Minor, about 433 light-years away, sitting almost exactly above Earth's north celestial pole.",
        "Its height above the pole will keep shifting; other stars take turns being the North Star.",
    ),
    "Proxima Centauri": (
        "Proxima Centauri is a faint red dwarf in Centaurus and the closest star to the Sun at 4.25 light-years. It hosts Proxima b, a planet in its habitable zone.",
        "It is the nearest star to the Sun, yet far too faint to see without a telescope.",
    ),
    "Rigil Kentaurus": (
        "Rigil Kentaurus, or Alpha Centauri A, is a yellow star like the Sun, 4.4 light-years away in Centaurus. With Toliman it forms the closest bright binary.",
        "Alpha Centauri is the closest star system visible to the unaided eye.",
    ),
    "Toliman": (
        "Toliman, or Alpha Centauri B, is an orange main-sequence star 4.4 light-years away, the secondary of the closest bright star system.",
        "It orbits Alpha Centauri A once every 79 years in a wide, looping path.",
    ),
    "Barnard's Star": (
        "Barnard's Star is a small red dwarf in Ophiuchus just 6 light-years away, notable for the fastest apparent motion of any star across the sky.",
        "It shifts a full Moon-width across the sky in only about 180 years.",
    ),
    "Wolf 359": (
        "Wolf 359 is an extremely faint red dwarf in Leo, 7.9 light-years away, one of the lowest-mass stars known. It occasionally flares in brightness.",
        "It is so dim that a modest telescope is needed despite being one of our nearest neighbours.",
    ),
    "Lalande 21185": (
        "Lalande 21185 is a red dwarf in Ursa Major, 8.3 light-years away, one of the nearest stars and brighter than most red dwarfs.",
        "It is the brightest red dwarf in the northern sky, yet invisible to the naked eye.",
    ),
    "Ross 154": (
        "Ross 154 is a red dwarf in Sagittarius about 9.7 light-years away. It is a flare star, brightening sharply at irregular intervals.",
        "Invisible to the eye, it can briefly flare far brighter than its normal output.",
    ),
    "Ross 248": (
        "Ross 248 is a faint red dwarf in Andromeda, about 10.3 light-years away. In tens of thousands of years it will become the closest star to the Sun.",
        "In roughly 33,000 years it will pass closer to us than any other star.",
    ),
    "Groombridge 34": (
        "Groombridge 34 is a binary of two red dwarfs in Andromeda, about 11.6 light-years away, with a confirmed planet around its larger member.",
        "Both stars are red dwarfs; the larger one hosts a known super-Earth.",
    ),
    "Kruger 60": (
        "Kruger 60 is a nearby binary of two red dwarfs in Draco, about 13 light-years away, first noted for its large proper motion.",
        "The pair takes about 44 years to complete one orbit around their common centre.",
    ),
    "Van Maanen's Star": (
        "Van Maanen's Star in Pisces is the nearest known solitary white dwarf, about 14 light-years away - the exposed core of a long-dead star.",
        "It packs about two-thirds of the Sun's mass into a body the size of Earth.",
    ),
    "Ross 128": (
        "Ross 128 is a quiet red dwarf in Virgo about 11 light-years away. It hosts Ross 128 b, one of the nearest temperate rocky planets known.",
        "Its calm behaviour makes it a favoured target in the search for habitable worlds.",
    ),
    "Lacaille 9352": (
        "Lacaille 9352 is a fast-moving red dwarf in Phoenix about 10.7 light-years away, and the brightest red dwarf in the southern sky.",
        "It was catalogued in the 1750s from the Cape of Good Hope by Nicolas-Louis Lacaille.",
    ),
    "Ran": (
        "Ran, or Epsilon Eridani, is a young orange dwarf in Eridanus about 10.5 light-years away. Ringed by dust, it hosts a confirmed giant planet.",
        "At under a billion years old, it is a youthful analogue of our middle-aged Sun.",
    ),
    "Alsafi": (
        "Alsafi, or Sigma Draconis, is an orange dwarf in Draco about 19 light-years away and the brightest star of its constellation.",
        "It is a favourite target in the search for extrasolar planets.",
    ),
    "Achird": (
        "Achird, or Eta Cassiopeiae, is a yellow-white dwarf paired with an orange dwarf, about 19 light-years away in Cassiopeia.",
        "The two stars take roughly 480 years to complete a single orbit.",
    ),
    "Mira": (
        "Mira, in Cetus, is a famous pulsating red giant around 300 light-years away whose brightness swings from visible to invisible over about 330 days.",
        "It gave its name to an entire class of variable stars, the Miras.",
    ),
    "Algol": (
        "Algol in Perseus is a bright eclipsing binary about 90 light-years away. One star regularly dims the pair every 2.9 days.",
        "Ancient observers nicknamed it the 'Demon Star' for its strange, regular dimming.",
    ),
    "Mizar": (
        "Mizar in Ursa Major, about 83 light-years away, was the first star ever photographed and the first found to be a binary through a telescope.",
        "A telescope splits it into two, and each of those is itself a close pair.",
    ),
    "Merak": (
        "Merak is a white star in Ursa Major, about 80 light-years away, forming the Big Dipper's second pointer toward Polaris.",
        "With Dubhe it points the way to the North Star.",
    ),
    "Schedar": (
        "Schedar is an orange giant in Cassiopeia, about 228 light-years away, marking the queen's heart and the brightest star of the W.",
        "It was once reported to have flared and briefly changed colour.",
    ),
    "Almach": (
        "Almach is a striking binary in Andromeda, about 350 light-years away, pairing a golden giant with a hot blue star.",
        "A small telescope reveals a lovely gold-and-blue colour contrast.",
    ),
    "Mirach": (
        "Mirach is an orange giant in Andromeda about 200 light-years away, used as a guide star to find the Andromeda Galaxy nearby.",
        "It is one of the stars that helps sky-watchers locate the Andromeda Galaxy.",
    ),
    "Alnair": (
        "Alnair is a hot blue-white star in Grus, about 101 light-years away, and the brightest star of the crane in the southern sky.",
        "Its name means 'the bright one' in Arabic.",
    ),
    "Peacock": (
        "Peacock is a hot blue-white star in Pavo, about 179 light-years away, and the brightest star of the peacock constellation.",
        "It is one of the brightest stars of the far southern sky.",
    ),
    "Sadr": (
        "Sadr is a yellow-white supergiant in Cygnus, about 1,800 light-years away, sitting where the arms of the Northern Cross meet.",
        "It is surrounded by the glowing Gas of the Cygnus Nebula region.",
    ),
    "Rasalhague": (
        "Rasalhague is a white giant in Ophiuchus, about 49 light-years away, and the brightest star of the serpent-bearer.",
        "It spins rapidly and has a faint, close companion star.",
    ),
    "Denebola": (
        "Denebola is a white star in Leo about 36 light-years away, marking the lion's tail and shining almost as brightly as its famous neighbour Regulus.",
        "Its name simply means 'the lion's tail' in Arabic.",
    ),
    "Thuban": (
        "Thuban is a white giant in Draco, about 303 light-years away. It was the pole star when the Egyptian pyramids were built.",
        "It served as the North Star around 2700 BCE.",
    ),
}

# Alternate spellings -> canonical key in FAMOUS_STARS.
ALIASES = {
    "eps-eri": "Ran", "epsilon-eridani": "Ran", "18-eps-eri": "Ran", "18eps-eri": "Ran",
    "sigma-dra": "Alsafi", "sigma-draconis": "Alsafi",
    "eta-cas": "Achird", "eta-cassiopeiae": "Achird",
    "proxima-cen": "Proxima Centauri", "proxima": "Proxima Centauri",
    "alpha-cen": "Rigil Kentaurus", "alpha-centauri": "Rigil Kentaurus",
    "rigil-kentaurus-a": "Rigil Kentaurus", "alpha-centauri-a": "Rigil Kentaurus",
    "alpha-centauri-b": "Toliman", "toliman-b": "Toliman",
    "barnards-star": "Barnard's Star",
    "van-maanens-star": "Van Maanen's Star",
    "lacaille-9352-b": "Lacaille 9352",
    "beta-cen": "Hadar", "beta-centauri": "Hadar", "agena": "Hadar",
    "beta-ceti": "Diphda",
}

# ----------------------------------------------------------------------
# Famous planets, keyed by planet name.
# ----------------------------------------------------------------------
FAMOUS_PLANETS = {
    "Proxima Cen b": (
        "Proxima Cen b is a roughly Earth-mass planet orbiting the nearest star to the Sun, inside its habitable zone. It was announced in 2016 from the star's radial-velocity wobble.",
        "Its year lasts only about 11 days.",
    ),
    "Ross 128 b": (
        "Ross 128 b is a temperate rocky planet around a quiet red dwarf about 11 light-years away, making it one of the nearest potentially habitable worlds.",
        "Its host star is unusually calm for a red dwarf, giving the planet a quieter environment.",
    ),
    "eps Eri b": (
        "Epsilon Eridani b is a giant planet at least as massive as Jupiter, orbiting a young Sun-like star every 7.3 years. It was among the earliest exoplanets confirmed.",
        "Announced in 2000, it orbits a star only about 800 million years old.",
    ),
    "51 Peg b": (
        "51 Pegasi b is the first exoplanet ever found around a Sun-like star, announced in 1995. It is a 'hot Jupiter' racing around its star every 4.2 days.",
        "Its discovery won the 2019 Nobel Prize in Physics for Mayor and Queloz.",
    ),
    "55 Cnc e": (
        "55 Cancri e is a scorching super-Earth orbiting a Sun-like star about 41 light-years away, with a year of only 18 hours.",
        "Its dayside is hot enough to melt iron; the planet may be covered in lava.",
    ),
    "TRAPPIST-1 e": (
        "TRAPPIST-1 e is one of seven Earth-sized planets around a small red dwarf 40 light-years away, sitting in the habitable zone where water could be liquid.",
        "All seven planets would fit inside the orbit of Mercury.",
    ),
    "TRAPPIST-1 b": (
        "TRAPPIST-1 b is the innermost of seven Earth-sized planets orbiting a cool red dwarf. It is likely a hot, rocky world without a thick atmosphere.",
        "Webb telescope observations suggest it may lack a substantial atmosphere.",
    ),
    "HD 209458 b": (
        "HD 209458 b, nicknamed Osiris, was the first exoplanet seen to transit its star, letting astronomers measure a planetary atmosphere evaporating into space.",
        "It was the first exoplanet caught transiting and the first with a detected atmosphere.",
    ),
    "Kepler-16 b": (
        "Kepler-16 b is a cold gas giant that orbits two stars at once, about 245 light-years away, proving that circumbinary planets really exist.",
        "It orbits a binary star, so its sky would show two suns.",
    ),
    "GJ 1214 b": (
        "GJ 1214 b is a warm super-Earth around a red dwarf about 40 light-years away, wrapped in a thick, steamy atmosphere that hides its surface.",
        "Its hazy atmosphere has puzzled astronomers for years.",
    ),
    "TOI-700 d": (
        "TOI-700 d is an Earth-sized planet in the habitable zone of a quiet red dwarf about 100 light-years away, found by the TESS mission.",
        "It was TESS's first Earth-sized planet in a habitable zone.",
    ),
    "HD 189733 b": (
        "HD 189733 b is a hot Jupiter about 64 light-years away with a deep blue colour, where glass-like silicate particles may rain sideways in fierce winds.",
        "Its atmosphere likely rains molten glass in winds of thousands of kilometres per hour.",
    ),
    "GJ 436 b": (
        "GJ 436 b is a Neptune-sized planet orbiting close to a red dwarf about 32 light-years away, trailing a huge tail of escaping hydrogen.",
        "It leaves a comet-like tail of evaporating gas behind it.",
    ),
}


# ----------------------------------------------------------------------
# Builders
# ----------------------------------------------------------------------
def _lookup_famous(name):
    if name in FAMOUS_STARS:
        return FAMOUS_STARS[name]
    slug = name.lower().replace("'", "").replace(".", "")
    slug = slug.replace(" ", "-")
    key = ALIASES.get(slug)
    return FAMOUS_STARS.get(key) if key else None


def star_content(name, spectral, dist_ly, abs_mag, con_abbr):
    famous = _lookup_famous(name)
    if famous:
        return famous
    blurb = _template_star_blurb(name, spectral, dist_ly, abs_mag, con_abbr)
    return blurb, None


def _template_star_blurb(name, spectral, dist_ly, abs_mag, con_abbr):
    desc = spectral_description(spectral)
    constellation = con_name(con_abbr)
    if constellation:
        where = f"in {constellation}"
    else:
        where = "in the sky"
    if dist_ly is not None:
        distance = f"{dist_ly:g} light-years from the Sun"
    else:
        distance = "at an uncertain distance"
    if abs_mag is None:
        return f"{name} is {desc} {where}, {distance}."
    rel = "brighter" if abs_mag < SUN_ABSOLUTE_MAGNITUDE else "dimmer"
    return (
        f"{name} is {desc} {where}, {distance}. "
        f"Its absolute magnitude is {abs_mag:.2f}, {rel} than the Sun's {SUN_ABSOLUTE_MAGNITUDE}."
    )


def planet_content(name, host, mass_earth, radius_earth, period_days, method,
                   for_famous=None):
    if name in FAMOUS_PLANETS:
        return FAMOUS_PLANETS[name]
    size = _planet_size_phrase(mass_earth, radius_earth, method)
    orb = f"It orbits {host}"
    if period_days is not None:
        orb += f" once every {_human_period(period_days)}"
    orb += "."
    disc = ""
    if for_famous:
        disc = f"Discovered in {for_famous}"
        if method:
            disc += f" by the {method.lower()} method"
        disc += "."
    blurb = f"{name} is {size}. {orb} {disc}".strip()
    return blurb, None


def _planet_size_phrase(mass_earth, radius_earth, method=None):
    # Radial-velocity and astrometric masses are minimum masses, so say so.
    minimum = method in ("Radial velocity", "Astrometry", "Minimum mass")
    word = "at least " if minimum else "about "
    if mass_earth is not None:
        if mass_earth < 2:
            return "an Earth-sized planet"
        if mass_earth < 10:
            return f"a super-Earth with {word}{mass_earth:.1f} times Earth's mass"
        if mass_earth < 100:
            return f"a Neptune-sized planet with {word}{mass_earth:.0f} times Earth's mass"
        return f"a giant planet with {word}{mass_earth:.0f} times Earth's mass"
    if radius_earth is not None:
        return f"a planet about {radius_earth:.1f} times Earth's size"
    return "a planet"


def _human_period(period_days):
    if period_days < 1:
        hours = period_days * 24
        return f"{hours:.1f} hours"
    if period_days < 400:
        return f"{period_days:.1f} days"
    return f"{period_days / 365.25:.1f} years"
