"""Bake surface variations for the Type89Launcher UV atlas from the API steel swatch."""

from pathlib import Path
import json
import subprocess
import sys

import numpy as np
from PIL import Image

from Script_BakePbrTexture import GaussianPeriodic, NormalFromHeight, Sha256


HERE = Path(__file__).resolve().parent
STEM = "Type89LauncherSteel"
SOURCE = HERE / "Source/Type89Launcher/Texture_Type89LauncherSteelSource.webp"
DESTINATION = HERE.parent / "Texture"

# In Blender UV order, starting at the bottom left. Each row specifies the
# local sRGB finish, roughness, metalness, occlusion and grain strength.
FINISHES = [
    ((82, 84, 84), .43, .81, 1.00, .72),   # tube and rolled stem
    ((69, 72, 72), .47, .84, .97, .85),   # collars and ribbed sleeve
    ((63, 65, 63), .62, .67, .99, 1.15),  # forged saddle and curved tab
    ((75, 77, 76), .51, .79, .94, .86),   # diamond texture on the side grip
    ((17, 19, 20), .79, .26, .74, .35),   # dark visible recesses
    ((115, 117, 112), .40, .85, .97, .84),  # burnished edges
    ((159, 153, 130), .72, .11, 1.00, .46),  # faint exterior stripe
    ((64, 60, 54), .66, .52, .94, 1.22),  # underside and retained patina
]


def Bake():
    with Image.open(SOURCE) as image:
        field = np.asarray(image.convert("RGB").resize((256, 512), Image.Resampling.LANCZOS), dtype=np.float32)
    # Remove broad image-generation gradients while keeping the grain and patina.
    field += field.mean((0, 1)) - GaussianPeriodic(field, 34)
    field -= field.mean((0, 1))
    rows, columns = field.shape[:2]
    yy, xx = np.meshgrid(np.arange(rows) / rows, np.arange(columns) / columns, indexing="ij")
    ridge = (0.5 + 0.5 * np.cos(2 * np.pi * (40 * xx + 60 * yy))) * (0.5 + 0.5 * np.cos(2 * np.pi * (40 * xx - 60 * yy)))
    base, normal, orm = (np.zeros((1024, 1024, 3), dtype=np.uint8) for _ in range(3))
    for index, (color, roughness, metallic, occlusion, grain) in enumerate(FINISHES):
        sample = np.roll(field, (index * 67, index * 37), axis=(0, 1))
        luminance = sample.mean(axis=2)
        pits = luminance - GaussianPeriodic(luminance, 3.1)
        height = np.clip(pits / 24, -0.75, 0.75) * grain
        if index == 3:
            sample = sample + (ridge - 0.25)[..., None] * 17
            height += ridge * 0.9
        if index == 4:
            # A dark relief pattern for the visible channel floor. The mouth uses
            # the plain half of this swatch.
            ribs = np.maximum(0, np.cos(2 * np.pi * (48 * yy + xx * .18))) ** 5
            ribs *= np.clip((.49 - yy) * 29, 0, 1)
            sample = sample + ribs[..., None] * 44
            height += ribs * .38
        if index == 0:
            # Fine, low-contrast tooling bands follow the tube circumference.
            bands = np.sin(2 * np.pi * (38 * yy + GaussianPeriodic(luminance, 4) * 0.022))
            sample = sample + bands[..., None] * 1.6
        x = index % 4 * columns
        y = (1 - index // 4) * rows
        tile = np.s_[y:y + rows, x:x + columns]
        base[tile] = np.rint(np.clip(np.asarray(color) + sample * grain, 5, 242)).astype(np.uint8)
        vectors = NormalFromHeight(height, 0.00011, .095, 1.0, "gl")
        normal[tile] = np.rint((vectors * .5 + .5) * 255).astype(np.uint8)
        orm[tile] = np.rint(255 * np.clip(np.stack([
            occlusion + np.minimum(height, 0) * .03,
            roughness - luminance * .0025,
            metallic + luminance * .0013,
        ], -1), 0, 1)).astype(np.uint8)

    for channel, pixels, quality in (("Base", base, 86), ("Normal", normal, 95), ("Orm", orm, 95)):
        image = Image.fromarray(pixels)
        if channel != "Base":
            image = image.resize((512, 512), Image.Resampling.BOX)
        image.save(DESTINATION / f"Texture_{STEM}{channel}.webp", method=6, quality=quality)
    subprocess.run([sys.executable, str(HERE / "Script_BakePbrTexture.py"), "--audit", "--name", STEM], check=True)
    recordPath = HERE / "TextureBakes" / f"Texture_{STEM}.json"
    record = json.loads(recordPath.read_text(encoding="utf-8"))
    record["source"] = {"path": SOURCE.relative_to(HERE.parent).as_posix(), "sha256": Sha256(SOURCE)}
    recordPath.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    Bake()
