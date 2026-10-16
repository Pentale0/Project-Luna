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
| `run_all.py` | runs D2-D8 | the three shipped files |

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

Loaded over the network they gzip to well under 1 MB each, so the browser
parses them in a fraction of a second.

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
