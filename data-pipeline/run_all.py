"""
Run the whole pipeline from scratch, in order:

    python data-pipeline/run_all.py

Stages D2-D8. D1 (d01_make_mock.py) is the temporary mock and is not run here.
Downloads are cached in data-pipeline/cache/ and re-used if their hash matches.
"""

import importlib
import time

STAGES = [
    ("d02_ingest", "ingest HYG star catalog"),
    ("d03_convert", "convert + clean"),
    ("d04_subset", "subset + export stars.json"),
    ("d05_exoplanets", "exoplanets + host matching + hasPlanets"),
    ("d06_solar_system", "solar system"),
    ("d09_deepsky", "deep-sky objects (OpenNGC + curated)"),
    ("d08_validate", "validate all outputs"),
]


def main():
    t0 = time.time()
    for module_name, label in STAGES:
        print(f"\n=== {module_name}: {label} ===")
        module = importlib.import_module(module_name)
        try:
            module.main()
        except SystemExit as exc:
            if exc.code:
                raise
    print(f"\nPipeline finished in {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
