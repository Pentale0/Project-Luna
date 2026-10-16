"""
D4 - Subset and export.

Rule: keep every star within 30 parsecs, OR brighter than magnitude 6.5
(naked-eye), OR carrying a proper name. Exoplanet host stars that fall
outside the rule are added later by D5.

Output: public/data/stars.json
"""

import json

import pandas as pd

import luna_build
import luna_common as luna

MAX_FILE_MB = 5.0


def main():
    df = pd.read_csv(luna.HYG_CLEAN)
    keep = df[df.apply(luna_build.subset_mask, axis=1)]
    luna.status(f"subset: {len(keep)} of {len(df)} stars")

    stars = [luna_build.build_star(row) for row in keep.to_dict("records")]
    stars.sort(key=lambda s: int(s["id"].split("-")[1]))

    out = luna.OUT_DIR / "stars.json"
    luna.write_json(out, stars)
    size_mb = out.stat().st_size / 1e6
    luna.status(f"wrote {out.relative_to(luna.PROJECT_DIR)}: {len(stars)} stars, {size_mb:.2f} MB")
    if size_mb > MAX_FILE_MB:
        luna.status(f"WARNING: file exceeds the {MAX_FILE_MB} MB budget")
    print(json.dumps(stars[0], ensure_ascii=False))


if __name__ == "__main__":
    main()
