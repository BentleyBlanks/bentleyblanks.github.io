"""Fetch the CC0 sources behind Model_RuralYardSet.glb (village yard / farm tools).

Usage (system python, not Blender):
  python Script_RuralYardFetch.py            # everything
  python Script_RuralYardFetch.py kenney     # only the Kenney packs
  python Script_RuralYardFetch.py quaternius # only the Quaternius packs

Two upstreams, both CC0 and both without any credential:

  * **Kenney** (kenney.nl) ships one zip per pack, but the download URL carries a
    content hash that changes whenever Kenney re-cuts the pack
    (`.../survival-kit/4065a8185b-1712149243/kenney_survival-kit.zip`).  Hard
    coding it rots, so the asset page is scraped for the current `.zip` href on
    every run and the resolved URL is written into the source folder.
  * **Quaternius** (quaternius.com) has no zip at all: each pack page links a
    public Google Drive folder and the button is an itch.io widget.  The folder's
    plain HTML listing already carries `aria-label="<name> Shared"` next to the
    file id, so the tree is walked with the same anonymous GET a browser makes,
    and each file is pulled through `uc?export=download`.

**Downloads go through `curl`, never `node fetch`** — the machine's proxy makes
node's fetch report a dead host (see the repo's node-fetch-ignores-proxy note).

Only the members actually baked into the runtime GLB are extracted; a Kenney kit
is 2-10 MB of zip whose textures this project throws away anyway.  The pack's own
License.txt is always kept, and `Source_RuralYard.json` records the resolved URL
plus the sha256 of every byte that landed on disk, so a later run can prove it
fetched the same upstream.
"""

from __future__ import annotations

import hashlib
import io
import json
import re
import subprocess
import sys
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "Source"
CC0 = "https://creativecommons.org/publicdomain/zero/1.0/"
AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Taierzhuang1938AssetPipeline/1.0"


def Curl(url: str, binary: bool = True) -> bytes:
    """One GET through curl.  Retries because kenney.nl occasionally resets."""
    last = None
    for attempt in range(4):
        done = subprocess.run(
            ["curl", "-sS", "-L", "--max-time", "300", "-A", AGENT, url],
            capture_output=True,
        )
        if done.returncode == 0 and done.stdout:
            return done.stdout
        last = done.stderr.decode("utf-8", "replace")
    raise RuntimeError(f"curl failed for {url}: {last}")


def Sha256(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


# --------------------------------------------------------------------------- #
# Kenney
# --------------------------------------------------------------------------- #

KENNEY_PAGE = "https://kenney.nl/assets/{slug}"

# folder -> (kenney slug, members to keep).  Members are matched on the file name
# only, so the "Models/GLB format/" vs "Models/GLTF format/" split between kits
# does not have to be spelled out here.
#
# The list is exactly what Script_RuralYardBake.py consumes.  Candidates that
# were pulled, looked at and dropped, so nobody re-litigates them:
#   graveyard-kit hay-bale / hay-bale-bundled  banded cylinders, i.e. baled hay;
#                                              there was no baler in 1938 Lu-nan
#   graveyard-kit urn-round                    footed lidded funerary urn
#   nature-kit    crops_wheatStageB            standing crop, belongs to the
#                                              farmland pass, not to a yard prop
#   survival-kit  tool-axe / workbench         axe reads as a bare pole once laid
#                                              down; the bench is a vise bench
#   fantasy-town  cart / planks                cart duplicates Model_Handcart;
#                                              planks are a floor tile
KENNEY_PACKS = {
    "Model_KenneyNatureKit": ("nature-kit", (
        "pot_large.glb", "pot_small.glb", "log_stack.glb", "stump_round.glb",
    )),
    "Model_KenneySurvivalKit": ("survival-kit", (
        "bucket.glb", "tool-hoe.glb", "resource-planks.glb",
    )),
    "Model_KenneyGraveyardKit": ("graveyard-kit", ("shovel.glb",)),
    "Model_KenneyFantasyTownKit": ("fantasy-town-kit", (
        "wheel.glb", "stall-bench.glb", "stall-stool.glb", "poles-horizontal.glb",
    )),
}


def KenneyZipUrl(slug: str) -> str:
    page = Curl(KENNEY_PAGE.format(slug=slug)).decode("utf-8", "replace")
    links = re.findall(r'https?://kenney\.nl/media/[^"\']+?\.zip', page)
    if not links:
        raise RuntimeError(f"no .zip link on the Kenney page for {slug}")
    return links[0]


def FetchKenney(folder: str, slug: str, members: tuple[str, ...]) -> dict:
    url = KenneyZipUrl(slug)
    payload = Curl(url)
    archive = zipfile.ZipFile(io.BytesIO(payload))
    wanted = {name.lower(): name for name in members}
    destination = SOURCE / folder
    destination.mkdir(parents=True, exist_ok=True)

    files = {}
    missing = set(wanted)
    for entry in archive.namelist():
        leaf = entry.rsplit("/", 1)[-1]
        key = leaf.lower()
        keep = key in wanted or (key == "license.txt" and "/" not in entry.strip("/"))
        if not keep:
            continue
        blob = archive.read(entry)
        (destination / leaf).write_bytes(blob)
        files[leaf] = Sha256(blob)
        missing.discard(key)
    if missing:
        raise RuntimeError(f"{slug}: pack no longer contains {sorted(missing)}")

    record = {
        "origin": "kenney.nl", "page": KENNEY_PAGE.format(slug=slug),
        "archive": url, "archiveSha256": Sha256(payload), "license": CC0,
        "files": files,
    }
    (destination / "Source_RuralYard.json").write_text(
        json.dumps(record, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"{folder}: {len(files)} files from {url}", flush=True)
    return record


# --------------------------------------------------------------------------- #
# Quaternius
# --------------------------------------------------------------------------- #

QUATERNIUS_PAGE = "https://quaternius.com/packs/{slug}.html"
DRIVE_FOLDER = "https://drive.google.com/drive/folders/{fid}"
DRIVE_FILE = "https://drive.google.com/uc?export=download&id={fid}"
# The folder listing repeats the file id inside a per-row `ssk` token that sits a
# few hundred characters after the aria-label; anchoring on that pair is the only
# stable way to read the listing out of the rendered HTML.
DRIVE_ROW = re.compile(
    r'aria-label="([^"]+?) Shared[^"]*"[^>]*?ssk=\'5:auSv138:([-\w]{20,50})-0-16\'')

# Dropped from this pack after inspection: Barrel (coopered stave barrel is a
# European form), Bags (Model_MarketStorageSet already ships rice sacks),
# Bench_1 (the Kenney stall bench is cleaner), Cart (duplicates Model_Handcart).
QUATERNIUS_PACKS = {
    "Model_QuaterniusMedievalVillage": ("medievalvillage", ("Props", "FBX"), (
        "Well.fbx", "Hay.fbx", "Bonfire.fbx",
    )),
}


def DriveList(fid: str) -> dict[str, str]:
    html = Curl(DRIVE_FOLDER.format(fid=fid)).decode("utf-8", "replace")
    rows = {}
    for match in DRIVE_ROW.finditer(html):
        # Drive appends a type word ("Binary", "Text", "Image") to the label.
        rows.setdefault(re.sub(r" (Binary|Text|Image|PDF)$", "", match.group(1)),
                        match.group(2))
    if not rows:
        raise RuntimeError(f"Drive folder {fid} listed nothing; the markup moved")
    return rows


def FetchQuaternius(folder: str, slug: str, path: tuple[str, ...],
                    members: tuple[str, ...]) -> dict:
    page = Curl(QUATERNIUS_PAGE.format(slug=slug)).decode("utf-8", "replace")
    roots = re.findall(r'drive\.google\.com/drive/folders/([-\w]{20,50})', page)
    if not roots:
        raise RuntimeError(f"no Drive folder on the Quaternius page for {slug}")

    root = roots[0]
    listing = DriveList(root)
    license_id = listing.get("License.txt")
    cursor = root
    for step in path:
        entries = DriveList(cursor)
        if step not in entries:
            raise RuntimeError(f"{slug}: {step} missing under {cursor}")
        cursor = entries[step]
    leaves = DriveList(cursor)

    destination = SOURCE / folder
    destination.mkdir(parents=True, exist_ok=True)
    files = {}
    ids = {}
    for name in members:
        if name not in leaves:
            raise RuntimeError(f"{slug}: pack no longer contains {name}")
        blob = Curl(DRIVE_FILE.format(fid=leaves[name]))
        (destination / name).write_bytes(blob)
        files[name] = Sha256(blob)
        ids[name] = leaves[name]
    if license_id:
        blob = Curl(DRIVE_FILE.format(fid=license_id))
        (destination / "License.txt").write_bytes(blob)
        files["License.txt"] = Sha256(blob)
        ids["License.txt"] = license_id

    record = {
        "origin": "quaternius.com", "page": QUATERNIUS_PAGE.format(slug=slug),
        "driveFolder": DRIVE_FOLDER.format(fid=root), "drivePath": list(path),
        "driveIds": ids, "license": CC0, "files": files,
    }
    (destination / "Source_RuralYard.json").write_text(
        json.dumps(record, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"{folder}: {len(files)} files from {DRIVE_FOLDER.format(fid=root)}", flush=True)
    return record


def Main() -> None:
    which = {arg.lower() for arg in sys.argv[1:]} or {"kenney", "quaternius"}
    SOURCE.mkdir(parents=True, exist_ok=True)
    if "kenney" in which:
        for folder, (slug, members) in KENNEY_PACKS.items():
            FetchKenney(folder, slug, members)
    if "quaternius" in which:
        for folder, (slug, path, members) in QUATERNIUS_PACKS.items():
            FetchQuaternius(folder, slug, path, members)
    print("RURAL_YARD_FETCH_OK", flush=True)


if __name__ == "__main__":
    Main()
