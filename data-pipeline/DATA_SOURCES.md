# Data sources and licenses

Every dataset used by the Luna pipeline, with version, URL, license and the
exact point where it enters the pipeline.

| Dataset | Version / accessed | URL | License | Used by |
|---|---|---|---|---|
| **HYG star database** | v4.4 (2026), sha256 `00b349893b9a53106dd488d8371e8d2fa586043e500bb3cdb8bff3931682197d`, 13,636,362 bytes | `https://codeberg.org/astronexus/hyg` → `data/hyg/CURRENT/hyg_v44.csv.gz` (raw file served from Git-LFS; direct raw URL returns a pointer) | CC BY-SA 4.0 | D2, D3, D4 (all stars) |
| **NASA Exoplanet Archive** — Planetary Systems Composite Parameters (`pscomppars`), via TAP | snapshot accessed 2026-10-16; 6,451 confirmed planets | `https://exoplanetarchive.ipac.caltech.edu/TAP/sync` | NASA data: not copyrighted, reusable with attribution | D5 (all exoplanets) |
| **NASA Planetary Fact Sheet** (NSSDCA, metric) | page last updated 2025-03-18 | `https://nssdc.gsfc.nasa.gov/planetary/factsheet/` | Public NASA reference data | D6 (Sun, planets, Moon, Pluto) |
| NASA/JPL + IAU published values | — | NASA/JPL Solar System Dynamics, IAU Minor Planet Center / Wikipedia cross-checked | Public reference data | D6 (dwarf planets, remaining moons) |
| **D1 mock catalog** | compiled 2026-10-16, hand-curated | — | n/a (temporary) | superseded by D3/D4 |

## Notes and deliberate omissions

- The HYG repository moved from GitHub to Codeberg; the file is stored with
  **Git-LFS**, so the pipeline downloads from the LFS media endpoint
  (`.../media/branch/main/...`) and verifies the sha256 against the LFS object
  id to guarantee a complete, untampered file.
- Distances in HYG come from Hipparcos/Gliese parallaxes and get less reliable
  far away. The 10,224 stars with the unknown-distance sentinel (100000 pc) are
  dropped rather than guessed at.
- **TRAPPIST-1 does not exist in HYG** (the catalog predates the 2016
  discovery, and the star is far too faint for Hipparcos). Its planets are
  therefore not in `exoplanets.json`. This is a coverage limit, not an error.
- Planets whose host stars are outside HYG are excluded and reported in
  `cache/exoplanet_report.txt`. Most are faint Kepler/K2/TESS hosts.
- **Tau Ceti**, **Lacaille 9352** and **Barnard's Star** planetary claims were
  deliberately left out: they are debated or retracted and are not in the
  archive's confirmed-planets table.
- Absolute magnitudes and colours are taken straight from HYG (`absmag`, `ci`)
  when present, otherwise computed from the apparent magnitude and distance.

## Attribution text for the app

> Star data from the HYG database v4.4 (AstroNexus, CC BY-SA 4.0).
> Exoplanet data from the NASA Exoplanet Archive.
> Solar-system data from NASA/NSSDCA and NASA/JPL.
