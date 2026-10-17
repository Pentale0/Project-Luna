# Luna data pipeline

Python scripts that turn open astronomy catalogs into the JSON files Person A's
frontend loads. One command rebuilds everything.

## Quick start

```
python -m pip install pandas          # one-time
python data-pipeline/run_all.py        # runs D2 -> D8, ~6s after first download
```

The first run downloads the HYG catalog (~13.6 MB) into `data-pipeline/cache/`
and verifies its sha256. Later runs reuse the cache.

## Stages

| Script | Milestone | Output |
|---|---|---|
| `d01_make_mock.py` | D1 mock (temporary, kept for reference) | `luna/public/data/stars.json`, `exoplanets.json` (mock) |
| `d02_ingest.py` | D2 download + inspect HYG | `cache/columns_report.txt` |
| `d03_convert.py` | D3 convert + clean | `cache/hyg_clean.csv` |
| `d04_subset.py` | D4 subset | `luna/public/data/stars.json` |
| `d05_exoplanets.py` | D5 exoplanets + host match | `luna/public/data/exoplanets.json`, updates `stars.json` |
| `d06_solar_system.py` | D6 solar system | `luna/public/data/solar-system.json` |
| `d07_content.py` | D7 popup text (library, no output) | merged into the files above |
| `d08_validate.py` | D8 validation | `cache/validation_report.txt` |
| `d09_deepsky.py` | D9 deep-sky catalogue (nebulae, clusters, galaxies, black holes) | `luna/public/data/deep-sky.json` |
| `d10_assets.py` | D10 real image assets (surface maps + object photographs) | `luna/public/textures/`, `luna/public/images/deepsky/`, `luna/public/data/deepsky-images.json` |
| `run_all.py` | runs D2-D10 | the shipped data files + image assets |

`d07_content.py` and `luna_build.py` and `luna_common.py` are libraries the
stage scripts import; they have no `main` of their own except `d07` (which
also has helpers only).

Files in `cache/` are disposable and can be deleted to force a clean rebuild.
`d01_make_mock.py` is **not** part of `run_all.py`: it is the early D1 mock and
would overwrite the real outputs.

## Shipped files (`luna/public/data/`)

See `SCHEMA.md` for the exact shape of each file.

- `stars.json` — 12,577 stars, ~4.4 MB
- `exoplanets.json` — 1,283 planets, ~0.5 MB
- `solar-system.json` — 28 bodies, ~10 KB
- `deep-sky.json` — 12,171 objects (galaxies, clusters, nebulae, black holes…), ~6 MB
- `deepsky-images.json` — manifest mapping the 231 notable objects to a real photo

Loaded over the network they gzip to well under 1 MB each, so the browser
parses them in a fraction of a second.

## Shipped image assets

`d10_assets.py` also downloads real imagery into the frontend's `public/`
folder so the app looks photoreal and works offline:

- `luna/public/textures/` — 15 NASA-derived equirectangular surface maps for the
  Sun, planets and Moon (Solar System Scope, **CC BY 4.0**). Used both on the 3D
  spheres and to render photoreal planet portraits in the info panel.
- `luna/public/images/deepsky/` — 231 real photographs, one per "notable"
  deep-sky object, looked up through the Wikipedia REST API (files come from
  Wikimedia Commons; the per-object source and credit are recorded in
  `deepsky-images.json`).

## Coordinate system (important for Person A)

All star positions are **galactic Cartesian, in parsecs, Sun at (0, 0, 0)**:

- **+x** points toward the **Galactic Centre** (Sagittarius)
- **+y** points in the direction of Galactic rotation
- **+z** points toward the **North Galactic Pole** — **this is "up"**. The
  Milky Way's plane is `z ≈ 0`, so draw an artistic galaxy disk flat in x-y.

### The conversion math (D3)

Step 1 — sky coordinates to equatorial Cartesian (parsecs). With right
ascension α, declination δ (both convert degrees → radians) and distance d:

```
x_eq = d · cos(δ) · cos(α)
y_eq = d · cos(δ) · sin(α)
z_eq = d · sin(δ)
```

HYG stores α in **hours**, so `α_deg = ra · 15`.

Step 2 — rotate equatorial J2000 into galactic axes with the IAU matrix:

```
|x|     | -0.0548755604  -0.8734370902  -0.4838350155 | |x_eq|
|y|  =  |  0.4941094279  -0.4448296300   0.7469822445 | |y_eq|
|z|     | -0.8676661490  -0.1980763734   0.4559837762 | |z_eq|
```

A rotation preserves lengths, so `sqrt(x² + y² + z²)` still equals `d`. Both
D3 and D8 check this. If the axes were wrong, stars would land in the wrong
place instantly.

### Proper motion → velocity (D3)

The frontend time machine needs stars to actually *move*, so D3 also derives a
velocity for every star from HYG's proper motion (`pmra`, `pmdec`, both in
milliarcseconds per year). HYG's `pmra` is the usual catalogued value
**μα·cosδ**, so the sky-plane speed is computed directly:

```
v_east  = d_pc · pmra_mas  · mas_to_rad
v_north = d_pc · pmdec_mas · mas_to_rad
v⃗ = v_east · east̂ + v_north · nortĥ      (rotated with the same IAU matrix)
```

where `east̂ = (−sinα, cosα, 0)` and
`nortĥ = (−sinδ·cosα, −sinδ·sinα, cosδ)`. HYG carries **no radial velocity**,
so the line-of-sight component is `0` — this is tangential motion only. The
result ships as `vx`, `vy`, `vz` in **parsecs per year** and is validated by D8
(nothing may move faster than 0.05 pc/yr, i.e. ~1500 km/s).

Sanity checks against the literature: Barnard's Star ≈ 87 km/s, Kapteyn's Star
≈ 161 km/s (a halo star), Sirius ≈ 17 km/s.

### Other formulas

Light-years ↔ parsecs: `d_ly = d_pc · 3.261563`

Absolute magnitude (distance modulus): `M = m − 5 · log10(d_pc / 10)`

Mass conversion (solar system, D6): `mass_earth = mass_kg / 5.9722e24`

## Data hygiene rules applied

- HYG encodes an unknown distance as **100000 pc**; those 10,224 rows are
  dropped (they have no usable 3D position).
- Missing colour, spectral type or distance becomes `null`, never `0` or `""`.
- ids are stable across re-runs: `hyg-<HYG id>` and `exo-<planet-name-slug>`.
- Planets whose host is not in HYG (mostly faint Kepler/TESS hosts outside the
  Hipparcos/Gliese catalogs) are **not shipped** and are counted in
  `cache/exoplanet_report.txt` (5,168 as of the current archive snapshot).
