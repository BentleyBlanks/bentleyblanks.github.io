"""Download traceable Poly Haven model sources through the public CC0 API.

Usage:
  python Script_PolyHavenFetch.py old_military_crate service_pistol

The script downloads one glTF plus every file declared by its selected
resolution.  No credential is required.  Runtime GLBs are produced separately
by Script_ExternalAssetBake.py so the source bundle remains reproducible.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import time
from pathlib import Path
from urllib.request import Request, urlopen


API = "https://api.polyhaven.com/files/{slug}"
ASSET = "https://polyhaven.com/a/{slug}"
CC0 = "https://creativecommons.org/publicdomain/zero/1.0/"
ROOT = Path(__file__).resolve().parent / "Source"


def Fetch(url: str) -> bytes:
    last_error = None
    for attempt in range(4):
        request = Request(url, headers={"User-Agent": "Taierzhuang1938AssetPipeline/1.0"})
        try:
            with urlopen(request, timeout=180) as response:
                return response.read()
        except Exception as error:
            last_error = error
            if attempt < 3:
                time.sleep(1.5 * (attempt + 1))
    raise last_error


def Verify(payload: bytes, expected: str, name: str) -> None:
    actual = hashlib.md5(payload).hexdigest()
    if expected and actual.lower() != expected.lower():
        raise RuntimeError(f"MD5 mismatch for {name}: {actual} != {expected}")


def FolderName(slug: str) -> str:
    return "Model_PolyHaven" + "".join(part.title() for part in slug.split("_"))


def Download(slug: str, resolution: str) -> None:
    manifest = json.loads(Fetch(API.format(slug=slug)).decode("utf-8"))
    try:
        entry = manifest["gltf"][resolution]["gltf"]
    except KeyError as exc:
        choices = sorted((manifest.get("gltf") or {}).keys())
        raise RuntimeError(f"{slug} has no glTF {resolution}; choices={choices}") from exc

    destination = ROOT / FolderName(slug)
    destination.mkdir(parents=True, exist_ok=True)
    files = {Path(entry["url"]).name: entry, **entry.get("include", {})}
    for relative, spec in files.items():
        target = destination / Path(relative)
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            existing = target.read_bytes()
            try:
                Verify(existing, spec.get("md5", ""), relative)
                print(f"{slug}: reuse {target.relative_to(ROOT.parent)}", flush=True)
                continue
            except RuntimeError:
                pass
        payload = Fetch(spec["url"])
        Verify(payload, spec.get("md5", ""), relative)
        target.write_bytes(payload)
        print(f"{slug}: {target.relative_to(ROOT.parent)} ({len(payload)} bytes)", flush=True)

    license_note = (
        f"Poly Haven asset: {ASSET.format(slug=slug)}\n"
        f"License: CC0 1.0 Universal ({CC0})\n"
        "Downloaded through https://api.polyhaven.com/ and modified for "
        "Taierzhuang1938 runtime performance.\n"
    )
    (destination / "License_PolyHavenCc0.txt").write_text(license_note, encoding="utf-8")


def Main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("slugs", nargs="+")
    parser.add_argument("--resolution", default="1k")
    args = parser.parse_args()
    for slug in args.slugs:
        Download(slug, args.resolution)


if __name__ == "__main__":
    Main()
