"""Encode Imagegen stationery without repainting, cropping or re-lettering it.

Source directory contains one <asset-name>.png per entry in Data_CommandRoomPapers.
Original PNGs stay local; delivery WebPs and reproducibility records enter the repo.
"""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image


def Encode(sourceDir):
    game = Path(__file__).resolve().parents[1]
    outputDir = game / "Texture/Menu/CommandRoom"
    recordDir = game / "_import/TextureBakes"
    outputDir.mkdir(parents=True, exist_ok=True)
    names = ["MapInitial", "MapWithdrawal", "MapEastDefense", "MapAidReturn",
             "MapNightBattle", "MapLastStand", "MapEpilogue",
             "LetterOpening", "LetterMiddle", "LetterFinal"]
    for suffix in names:
        assetName = "CommandRoom" + suffix
        sourcePath = sourceDir / (assetName + ".png")
        outputPath = outputDir / ("Texture_" + assetName + "Image.webp")
        with Image.open(sourcePath) as source:
            image = source.convert("RGB")
            if max(image.size) > 2048:
                raise ValueError("Image exceeds the print texture limit: " + assetName)
            image.save(outputPath, quality=90, method=6)
            size = image.size
        record = {
            "generator": "Script_EncodeCommandRoomPapers.py@1", "provider": "imagegen",
            "source": sourcePath.name, "sourceSha256": hashlib.sha256(sourcePath.read_bytes()).hexdigest(),
            "prompt": "_import/Prompts/Texture_CommandRoomPapers.txt",
            "operation": "RGB WebP encoding only; no cropping, compositing or text changes",
            "quality": 90, "method": 6,
            "outputs": [{"file": outputPath.name,
                       "width": size[0], "height": size[1], "bytes": outputPath.stat().st_size,
                       "sha256": hashlib.sha256(outputPath.read_bytes()).hexdigest()}],
        }
        (recordDir / ("Texture_" + assetName + ".json")).write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(record["outputs"][0]))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    Encode(parser.parse_args().source)
