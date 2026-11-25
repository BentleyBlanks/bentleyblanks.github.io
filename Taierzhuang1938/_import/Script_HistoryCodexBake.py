"""Extract archival scans and record the approved composited newspaper image.

Usage: python Script_HistoryCodexBake.py --source-dir <downloaded-reference-directory>
Sources and original URLs are documented in docs/Data_HistoryCodex.md.
Requires Pillow and pypdf. Original PDFs remain outside the game repository.
"""
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image
from pypdf import PdfReader


def Main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path, required=True)
    args = parser.parse_args()
    project = Path(__file__).resolve().parent.parent
    output = project / "Texture" / "Menu" / "History"
    output.mkdir(parents=True, exist_ok=True)
    press = output / "Texture_HistoryXinhuaDaily19380408Image.webp"
    if not press.is_file():
        raise FileNotFoundError("Restore the approved Xinhua Daily composited image before rebuilding.")
    records = []

    def Record(image, target, lossless):
        records.append({"file": target.relative_to(project / "Texture").as_posix(), "width": image.width,
                        "height": image.height, "bytes": target.stat().st_size, "lossless": lossless,
                        "sha256": hashlib.sha256(target.read_bytes()).hexdigest()})

    def Save(image, name, lossless=False):
        target = output / ("Texture_History" + name + "Image.webp")
        image.convert("RGB").save(target, format="WEBP", lossless=lossless, quality=95, method=6)
        Record(image, target, lossless)

    plate = PdfReader(args.source_dir / "Source_Beizhuang1938.pdf").pages[9].images[0].image
    # The portrait rectangle within file page 10; captions remain accessible through the original source.
    Save(plate.crop((round(plate.width * .246), round(plate.height * .391),
                     round(plate.width * .808), round(plate.height * .851))), "WangMingzhang")
    memoir = PdfReader(args.source_dir / "Source_ZhangMemoir.pdf")
    if len(memoir.pages) != 17:
        raise ValueError("Expected 17 memoir pages (printed 61-77)")
    for index, page in enumerate(memoir.pages):
        if len(page.images) != 1:
            raise ValueError("A page is no longer a single original scan")
        Save(page.images[0].image, "ZhangMemoir" + str(index + 1).zfill(2), lossless=True)
    # Reuse the approved front page composed onto the restored paper.
    with Image.open(press) as image:
        Record(image, press, False)
    with Image.open(args.source_dir / "Source_WuhanMemorial.jpeg") as image:
        Save(image, "WuhanMemorial")
    record = project / "_import" / "Data_HistoryCodexImages.json"
    record.write_text(json.dumps({"method": "Native scan dimensions for portraits, memoir and photos. The Xinhua Daily front page is placed on a restored paper surface.",
                                  "files": records}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(records, ensure_ascii=False))


if __name__ == "__main__":
    Main()
