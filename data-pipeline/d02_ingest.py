"""
D2 - Ingest the HYG v4.4 star catalog.

Downloads the catalog (once), verifies its sha256, loads it with pandas and
prints/records a column report. Output: cache/hyg_v44.csv.gz + cache/columns_report.txt
"""

import hashlib
import urllib.request

import pandas as pd

import luna_common as luna


def download():
    luna.CACHE_DIR.mkdir(parents=True, exist_ok=True)
    if luna.HYG_GZ.exists():
        digest = hashlib.sha256(luna.HYG_GZ.read_bytes()).hexdigest()
        if digest == luna.HYG_SHA256:
            luna.status(f"using cached {luna.HYG_GZ.name} (sha256 ok)")
            return
        luna.status("cached file has wrong hash, re-downloading")

    luna.status(f"downloading {luna.HYG_URL}")
    urllib.request.urlretrieve(luna.HYG_URL, luna.HYG_GZ)
    digest = hashlib.sha256(luna.HYG_GZ.read_bytes()).hexdigest()
    if digest != luna.HYG_SHA256:
        raise SystemExit(f"sha256 mismatch: {digest}")
    luna.status(f"downloaded {luna.HYG_GZ.stat().st_size/1e6:.1f} MB, sha256 ok")


def inspect():
    df = pd.read_csv(luna.HYG_GZ)
    lines = []
    lines.append(f"source        : {luna.HYG_URL}")
    lines.append(f"version       : {luna.HYG_VERSION}")
    lines.append(f"rows          : {len(df)}")
    lines.append(f"columns ({len(df.columns)}) : {', '.join(df.columns)}")
    lines.append("")
    lines.append("numeric column summary:")
    lines.append(df.describe(include=["number"]).to_string())
    lines.append("")
    lines.append(f"missing sentinel (dist == {luna.HYG_DIST_SENTINEL:g}): "
                 f"{int((df['dist'] == luna.HYG_DIST_SENTINEL).sum())} rows")
    lines.append(f"blank proper names : {int(df['proper'].isna().sum())}")
    lines.append(f"blank spectral      : {int(df['spect'].isna().sum())}")
    lines.append(f"blank colour (ci)   : {int(df['ci'].isna().sum())}")
    lines.append(f"unique ids          : {df['id'].nunique()} / {len(df)}")

    report = "\n".join(lines)
    (luna.CACHE_DIR / "columns_report.txt").write_text(report, encoding="utf-8")
    print(report)
    luna.status("wrote cache/columns_report.txt")


def main():
    download()
    inspect()


if __name__ == "__main__":
    main()
