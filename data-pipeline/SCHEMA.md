# Luna data contract — actual delivered schema

This documents exactly what the pipeline writes, including one **proposed new
schema** (`solar-system.json`) that Person A should confirm.

All three files live in `luna/public/data/`. They are compact JSON (no pretty
indentation) to keep them small. Missing values are always `null`, never `0`
or `""`.

---

## `stars.json`

Array of star objects. Positions are **galactic Cartesian parsecs**, Sun at
origin, `+z` = north galactic pole ("up").

```json
{
  "id": "hyg-32349",
  "name": "Sirius",
  "x": -1.77, "y": -1.91, "z": -0.41,
  "absMag": 1.43,
  "colorIndex": 0.01,
  "spectral": "A1V",
  "distLy": 8.6,
  "constellation": "CMa",
  "hasPlanets": false,
  "info": { "blurb": "...", "funFact": "..." }
}
```

| Field | Type | Notes |
|---|---|---|
| `id` | string | stable: `hyg-<HYG id>` |
| `name` | string | proper (IAU) name, else Bayer/Flamsteed, else Gliese/HD/HIP |
| `x`,`y`,`z` | number | galactic parsecs, 3 decimals |
| `absMag` | number \| null | absolute V magnitude |
| `colorIndex` | number \| null | B−V colour index |
| `spectral` | string \| null | e.g. `"G2V"` |
| `distLy` | number | distance in light-years |
| `constellation` | string \| null | IAU 3-letter abbreviation |
| `hasPlanets` | boolean | true if a shipped planet orbits it |
| `info.blurb` | string | ≤ 60 words |
| `info.funFact` | string \| null | ≤ 25 words, `null` if unsupportable |

## `exoplanets.json`

Array of confirmed planets whose host star is present in `stars.json`.

```json
{
  "id": "exo-proxima-cen-b",
  "name": "Proxima Cen b",
  "hostId": "hyg-70890",
  "massEarth": 1.055,
  "radiusEarth": 1.02,
  "periodDays": 11.1847,
  "discoveryYear": 2016,
  "method": "Radial velocity",
  "info": { "blurb": "...", "funFact": "..." }
}
```

| Field | Type | Notes |
|---|---|---|
| `id` | string | stable: `exo-<planet-name-slug>` |
| `hostId` | string | must exist in `stars.json` (validator enforces this) |
| `massEarth` | number \| null | Earth masses; **minimum mass** for radial-velocity planets |
| `radiusEarth` | number \| null | Earth radii; often model-derived, not measured |
| `periodDays` | number \| null | orbital period |
| `discoveryYear` | integer \| null | |
| `method` | string \| null | one of a fixed set, e.g. "Radial velocity", "Transit" |

## `solar-system.json` — PROPOSED, please confirm

The contract said "Sun, 8 planets, major moons, dwarf planets with orbital
data (semi-major axis, period, radius, mass) and `info`" but did not fix field
names or units. Proposal:

```json
{
  "id": "sol-saturn",
  "name": "Saturn",
  "type": "planet",
  "parentId": "sol-sun",
  "semiMajorAxisAu": 9.573,
  "distanceFromParentKm": null,
  "orbitalPeriodDays": 10759.2,
  "eccentricity": 0.052,
  "radiusKm": 60268.0,
  "massEarth": 95.14,
  "info": { "blurb": "...", "funFact": "..." }
}
```

| Field | Type | Notes |
|---|---|---|
| `type` | string | `"star"` \| `"planet"` \| `"dwarf planet"` \| `"moon"` |
| `parentId` | string \| null | `null` for the Sun; else the body it orbits |
| `semiMajorAxisAu` | number \| null | heliocentric, for planets and dwarf planets |
| `distanceFromParentKm` | number \| null | for moons (distance from parent) |
| `orbitalPeriodDays` | number \| null | |
| `eccentricity` | number \| null | |
| `radiusKm`, `massEarth` | number | mean radius km; mass in Earth masses for consistency with exoplanets |

The current file ships: 1 star, 8 planets, 5 dwarf planets (Pluto, Ceres,
Eris, Haumea, Makemake), 14 moons. If Person A prefers a single distance field
with a unit tag, or wants planets positioned in the same x/y/z space, say so
and this schema will change before the frontend hard-codes it.

---

## Deliberate deviations from the original contract (for Person A)

1. **Coordinate frame.** The contract example values for Sirius
   (`-0.49, 2.48, -0.77`) match an *equatorial* conversion, but the contract
   text says "galactic". We ship the **true galactic frame** (agreed with the
   owner); the example in the contract is superseded.
2. **id format.** Contract showed `exo-0001`. We use `exo-<name-slug>`
   because numeric ids are not stable when the archive adds planets; slugs are.
3. **`solar-system.json`** schema above is new and needs a sign-off.
