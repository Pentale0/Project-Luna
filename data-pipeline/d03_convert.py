"""
D3 - Convert and clean.

Reads the raw HYG catalog and writes cache/hyg_clean.csv with:
  * missing-distance sentinel rows removed
  * RA hours -> degrees, distance parsecs -> galactic Cartesian x/y/z
  * light-year distance and a consistent absolute magnitude
  * nulls (never 0 or "") for missing colour / spectral / names
"""

import pandas as pd

import luna_common as luna


def convert():
    df = pd.read_csv(luna.HYG_GZ)
    before = len(df)

    df = df[df["id"] != 0]                                  # drop Sol itself
    df = df[df["dist"] < luna.HYG_DIST_SENTINEL]            # drop unknown distances
    df = df[df["dist"] > 0]                                 # drop non-positive
    luna.status(f"kept {len(df)} of {before} rows with usable 3D positions")

    ra_deg = df["ra"] * 15.0                                # HYG RA is in hours
    xyz = [luna.radec_to_galactic_xyz(ra, dec, dist)
           for ra, dec, dist in zip(ra_deg, df["dec"], df["dist"])]
    df["x"] = [v[0] for v in xyz]
    df["y"] = [v[1] for v in xyz]
    df["z"] = [v[2] for v in xyz]

    df["dist_pc"] = df["dist"]
    df["dist_ly"] = df["dist"].apply(luna.light_years_from_parsecs)
    df["ra_deg"] = ra_deg

    for col in ("proper", "spect", "bf", "bayer", "gl", "con"):
        df[col] = df[col].where(df[col].notna(), None)

    keep = ["id", "proper", "bf", "bayer", "flam", "con", "gl", "hip", "hd",
            "ra_deg", "dec", "dist_pc", "dist_ly", "mag", "absmag", "ci",
            "spect", "x", "y", "z"]
    out = df[keep]
    luna.CACHE_DIR.mkdir(parents=True, exist_ok=True)
    out.to_csv(luna.HYG_CLEAN, index=False)
    luna.status(f"wrote {luna.HYG_CLEAN.relative_to(luna.PROJECT_DIR)} "
                f"({luna.HYG_CLEAN.stat().st_size/1e6:.1f} MB)")

    # sanity check: |(x,y,z)| must equal the original distance
    sample = out.sample(min(2000, len(out)), random_state=0)
    worst = ((sample.x**2 + sample.y**2 + sample.z**2) ** 0.5 - sample.dist_pc).abs().max()
    luna.status(f"position-length check on 2000 random stars, max error = {worst:.6f} pc")


def main():
    convert()


if __name__ == "__main__":
    main()
