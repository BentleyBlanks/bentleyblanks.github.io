"""Bake facial-hair coverage from each character's original and shaved references.

The photographs stay in OneDrive. The runtime receives one coverage atlas and
the groom builder receives compact sampling grids. Registration is authored in
Data_HairReferences.json against an orthographic projection of the existing mesh.
"""
import base64
import hashlib
import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

PROJECT = Path(__file__).resolve().parent.parent
HAIR = PROJECT / "Hair"
REFERENCE_ROOT = Path(os.environ.get("HAIR_REFERENCE_ROOT", Path.home() / "OneDrive/Sync/饮河/FPS/角色/Tripo"))
TILE_SIZE = 512
GRID_SIZE = 128
ATLAS_COLUMNS = 4
CANONICAL_SIZE = (2048, 2048)
PARTS = ["mustache", "soul", "chin", "jaw", "cheek"]


def Hash(data):
    return hashlib.sha256(data).hexdigest()


def Polygon(size, points):
    result = Image.new("L", size)
    ImageDraw.Draw(result).polygon(points, fill=255)
    return result


def MaximumFilter(image, size):
    """Separable square maximum, identical to Pillow's edge-clamped filter.

    The reference atlas now holds thirteen portraits. Two linear passes avoid
    the generic RGB filter's quadratic neighbourhood work on every portrait.
    """
    pixels = np.asarray(image)
    radius = size // 2
    horizontal = np.zeros_like(pixels)
    padded = np.pad(pixels, ((0, 0), (radius, radius), (0, 0)), mode="edge")
    for offset in range(size):
        np.maximum(horizontal, padded[:, offset:offset+image.width], out=horizontal)
    padded = np.pad(horizontal, ((radius, radius), (0, 0), (0, 0)), mode="edge")
    result = np.zeros_like(pixels)
    for offset in range(size):
        np.maximum(result, padded[offset:offset+image.height], out=result)
    return Image.fromarray(result)


def Regions(registration, proportional=False):
    """Loose anatomical windows delimit subtraction without drawing the beard."""
    ref = registration["reference"]
    cx = ref["centerX"]
    nose, mouth, chin = ref["noseY"], ref["mouthY"], ref["chinY"]
    width, face = ref["mouthHalfWidth"], ref["faceHalfWidth"]
    mustache = [(cx-width-65, mouth+35), (cx-width-65, nose+50),
                (cx-110, nose-18), (cx+110, nose-18),
                (cx+width+65, nose+50), (cx+width+65, mouth+35),
                (cx+width-20, mouth+12), (cx+80, mouth-48),
                (cx-80, mouth-48), (cx-width+20, mouth+12)]
    soul = [(cx-145, mouth+35), (cx+145, mouth+35),
            (cx+125, mouth+190), (cx-125, mouth+190)]
    chin_region = [(cx-face*.73, chin-190), (cx-face*.40, mouth+150),
                   (cx, mouth+125), (cx+face*.40, mouth+150),
                   (cx+face*.73, chin-190), (cx+face*.72, chin+100),
                   (cx-face*.72, chin+100)]
    jaw = [(cx-face, nose-200), (cx-face*.75, mouth+70),
           (cx-face*.45, chin-110), (cx, chin-85),
           (cx+face*.45, chin-110), (cx+face*.75, mouth+70),
           (cx+face, nose-200), (cx+face*.98, mouth+160),
           (cx+face*.75, chin+65), (cx, chin+100),
           (cx-face*.75, chin+65), (cx-face*.98, mouth+160)]
    cheek_left = [(cx-face, nose-300), (cx-face*.76, nose-220),
                  (cx-width-35, nose+70), (cx-width-40, mouth+140),
                  (cx-face*.70, chin-80), (cx-face*1.03, mouth+80)]
    cheek_right = [(2*cx-x, y) for x, y in cheek_left]
    if proportional:
        # A fixed 190 px soul patch consumes the entire chin in a more distant
        # portrait. Classify by anatomical proportions, independently of framing.
        gap = chin-mouth
        soul = [(cx-width*.55, mouth+gap*.16), (cx+width*.55, mouth+gap*.16),
                (cx+width*.46, mouth+gap*.43), (cx-width*.46, mouth+gap*.43)]
        chin_region = [(cx-face*.58, chin-gap*.45), (cx-face*.32, mouth+gap*.43),
                       (cx, mouth+gap*.38), (cx+face*.32, mouth+gap*.43),
                       (cx+face*.58, chin-gap*.45), (cx+face*.5, chin+gap*.25),
                       (cx-face*.5, chin+gap*.25)]
    return {"mustache": [mustache], "soul": [soul], "chin": [chin_region],
            "jaw": [jaw], "cheek": [cheek_left, cheek_right]}


def Bake(reference, tile_index, atlasRows):
    source_path = REFERENCE_ROOT / reference["source"]
    bald_path = REFERENCE_ROOT / reference["baldSource"]
    source_bytes, bald_bytes = source_path.read_bytes(), bald_path.read_bytes()
    if Hash(source_bytes) != reference["sha256"] or Hash(bald_bytes) != reference["baldSha256"]:
        raise ValueError(f"Reference hash changed: {source_path}")
    image = Image.open(source_path).convert("RGB")
    bald = Image.open(bald_path).convert("RGB")
    # Registration uses a 2048-square coordinate frame. Preserve 1K source
    # originals on disk; normalize only the offline sampling workspace.
    sourceSize, baldSize = image.size, bald.size
    if image.width != image.height or bald.width != bald.height:
        raise ValueError("Head references must be square")
    image = image.resize(CANONICAL_SIZE, Image.Resampling.LANCZOS)
    bald = bald.resize(CANONICAL_SIZE, Image.Resampling.LANCZOS)
    registration = reference["registration"]
    target = np.asarray(image, dtype=np.float32) / 255
    smooth_skin = np.asarray(bald.filter(ImageFilter.GaussianBlur(8)), dtype=np.float32) / 255
    bright_skin = np.asarray(MaximumFilter(bald, 9), dtype=np.float32) / 255
    skin_linear = np.power(.6*smooth_skin[..., 0] + .4*bright_skin[..., 0], 2.2)
    target_linear = np.power(target[..., 0], 2.2)
    coverage = np.clip((skin_linear-target_linear) / np.maximum(skin_linear-.004, .01), 0, 1)
    coverage = np.clip((coverage-.10) / .90, 0, .97)
    # Separate neutral hair radiance from the warm shaved skin. Solving
    # target = transmission * skin + coverage * neutral_hair preserves grey
    # fibre highlights instead of tinting every gap with the skin colour.
    skin_rgb = np.power(.6*smooth_skin + .4*bright_skin, 2.2)
    target_rgb = np.power(target, 2.2)
    skin_mean = skin_rgb.mean(axis=2)
    target_mean = target_rgb.mean(axis=2)
    skin_chroma = skin_rgb - skin_mean[..., None]
    variance = np.sum(skin_chroma*skin_chroma, axis=2)
    transmission = np.sum(skin_chroma*(target_rgb-target_mean[..., None]), axis=2) / np.maximum(variance, .00001)
    transmission = np.clip(transmission, 0, 1)
    transmission = np.where(variance < .00001, 0, transmission)
    scalp_coverage = np.maximum(coverage, 1-transmission)
    neutral_pixel = (target.max(axis=2)-target.min(axis=2)) < .12
    support = (coverage > .015) | (neutral_pixel & (target[..., 0] < .75))
    scalp_coverage *= support
    if reference["beard"].get("grayCoverage"):
        coverage = np.maximum(coverage, scalp_coverage)
    scalp_gray = (target_mean-(1-scalp_coverage)*skin_mean) / np.maximum(scalp_coverage, .01)
    scalp_gray = np.clip(scalp_gray, .0001, .6)
    region = Image.new("L", image.size)
    windows = Regions(registration, reference["beard"].get("proportionalRegions", False))
    # Fine central regions override the broad cheek/jaw classification.
    for part in ["cheek", "jaw", "chin", "soul", "mustache"]:
        draw = ImageDraw.Draw(region)
        for polygon in windows[part]:
            draw.polygon(polygon, fill=PARTS.index(part)+1)
    region_pixels = np.asarray(region)
    # Sparse cheek whiskers are high-frequency marks. Local illumination changes
    # between the two portraits must not become dark cheek patches.
    local_bright = np.asarray(MaximumFilter(image, 9), dtype=np.float32)[..., 0] / 255
    local_linear = np.power(local_bright, 2.2)
    detail = np.clip((local_linear-target_linear) / np.maximum(local_linear-.004, .01), 0, 1)
    coverage = np.where(region_pixels == 5, np.minimum(coverage, detail), coverage)
    domain = Image.fromarray(np.where(region_pixels > 0, 255, 0).astype(np.uint8))
    feather = np.asarray(domain.filter(ImageFilter.GaussianBlur(3)), dtype=np.float32)/255
    coverage *= feather
    # Exclude the coloured lips. Their position is taken from the reference.
    ref = registration["reference"]
    cx, mouth, width = ref["centerX"], ref["mouthY"], ref["mouthHalfWidth"]
    nose, face = ref["noseY"], ref["faceHalfWidth"]
    lips = Polygon(image.size, [(cx-width+20, mouth), (cx-width*.48, mouth-35),
        (cx, mouth-27), (cx+width*.48, mouth-35), (cx+width-20, mouth),
        (cx+width*.60, mouth+34), (cx, mouth+43), (cx-width*.60, mouth+34)])
    coverage *= 1-np.asarray(lips.filter(ImageFilter.GaussianBlur(2)), dtype=np.float32)/255
    for part, weight in reference["beard"].get("coverageWeights", {}).items():
        coverage = np.where(region_pixels == PARTS.index(part)+1, coverage*weight, coverage)
    if reference["beard"].get("enabled") is False:
        coverage.fill(0)
    crop = tuple(reference.get("faceCrop", (448, 896, 1600, 2048)))
    mask = Image.fromarray(np.round(coverage*255).astype(np.uint8))
    tile = mask.crop(crop).resize((TILE_SIZE, TILE_SIZE), Image.Resampling.LANCZOS)
    tile_pixels = np.asarray(tile).copy()
    tile_pixels[[0, -1], :] = 0
    tile_pixels[:, [0, -1]] = 0
    tile = Image.fromarray(tile_pixels)
    sampling = tile.resize((GRID_SIZE, GRID_SIZE), Image.Resampling.BOX)
    classification = region.crop(crop).resize((GRID_SIZE, GRID_SIZE), Image.Resampling.NEAREST)
    tx, ty = tile_index % ATLAS_COLUMNS, tile_index // ATLAS_COLUMNS
    output = {
        "sourceSha256": reference["sha256"], "baldSha256": reference["baldSha256"],
        "sourceSize": list(sourceSize), "baldSize": list(baldSize),
        "grayCoverage": reference["beard"].get("grayCoverage", False),
        "proportionalRegions": reference["beard"].get("proportionalRegions", False),
        "coverageWeights": reference["beard"].get("coverageWeights", {}),
        "beardLuminance": reference["beard"].get("referenceLuminance", False),
        "portraitLuminance": reference["beard"].get("portraitLuminance", False),
        "crop": list(crop), "tile": [tx/ATLAS_COLUMNS, ty/atlasRows, 1/ATLAS_COLUMNS, 1/atlasRows],
        "projection": registration,
        "grid": {"size": GRID_SIZE,
                 "alpha": base64.b64encode(sampling.tobytes()).decode(),
                 "parts": base64.b64encode(classification.tobytes()).decode()},
    }
    # The lower edge of dense hair is read from the original portrait. The
    # eyebrow/ear guard only limits the search area, it does not draw the edge.
    dark_hair = ((skin_linear-target_linear) / np.maximum(skin_linear, .01) > .65) & (target[..., 0] < .45)
    hairline = []
    for x in np.linspace(cx-face*1.12, cx+face*1.12, 65):
        relative = min(1, max(0, (abs(x-cx)/face-.65)/.35))
        blend = relative*relative*(3-2*relative)
        ceiling = int((1-blend)*(ref['browY']-130) + blend*(nose-80))
        column = dark_hair[:ceiling, max(0, int(x)-4):min(image.width, int(x)+5)].mean(axis=1)
        candidates = np.flatnonzero(np.convolve(column, np.ones(3)/3, mode='same') > .45)
        if len(candidates):
            hairline.append([round(float(x), 2), int(candidates[-1])])
    output['hairline'] = hairline
    image_y, image_x = np.mgrid[0:image.height, 0:image.width]
    relative = np.clip((np.abs(image_x-cx)/face-.65)/.35, 0, 1)
    blend = relative*relative*(3-2*relative)
    ceiling = (1-blend)*(ref['browY']-130) + blend*(nose-80)
    scalp_coverage *= np.clip((ceiling-image_y)/8, 0, 1)
    hair_crop = (448, 0, 1600, 1152)
    hair_tile = Image.fromarray(np.round(scalp_coverage*255).astype(np.uint8)).crop(hair_crop)
    hair_tile = hair_tile.resize((TILE_SIZE, TILE_SIZE), Image.Resampling.LANCZOS)
    gray_tile = Image.fromarray(np.round(np.power(scalp_gray, 1/2.2)*255).astype(np.uint8)).crop(hair_crop)
    gray_tile = gray_tile.resize((TILE_SIZE, TILE_SIZE), Image.Resampling.LANCZOS)
    output['hairCrop'] = list(hair_crop)
    weights = np.asarray(hair_tile, dtype=np.float32)/255
    luminance = np.power(np.asarray(gray_tile, dtype=np.float32)/255, 2.2)
    original_tile = np.asarray(image.crop(hair_crop).resize((TILE_SIZE, TILE_SIZE), Image.Resampling.LANCZOS), dtype=np.float32)/255
    dense_hair = (weights > .8) & (original_tile[..., 0] < .4)
    output['normalizationLuminance'] = float(np.median(luminance[dense_hair])) if dense_hair.any() else .005
    # Facial coverage uses R. The scalp uses G coverage and B fibre luminance.
    beardGray = target_mean if reference["beard"].get("portraitLuminance") else scalp_gray
    beardLuminance = Image.fromarray(np.round(np.power(beardGray, 1/2.2)*255).astype(np.uint8)).crop(crop)
    beardLuminance = beardLuminance.resize((TILE_SIZE, TILE_SIZE), Image.Resampling.LANCZOS)
    return Image.merge('RGB', (tile, hair_tile, gray_tile)), output, beardLuminance


def SameCoverageInputs(cached, reference):
    if not cached:
        return False
    beard = reference["beard"]
    expected = {
        "sourceSha256": reference["sha256"], "baldSha256": reference["baldSha256"],
        "projection": reference["registration"],
        "crop": reference.get("faceCrop", [448, 896, 1600, 2048]),
        "beardEnabled": beard.get("enabled", True),
        "grayCoverage": beard.get("grayCoverage", False),
        "proportionalRegions": beard.get("proportionalRegions", False),
        "coverageWeights": beard.get("coverageWeights", {}),
        "beardLuminance": beard.get("referenceLuminance", False),
        "portraitLuminance": beard.get("portraitLuminance", False),
    }
    legacy = {"beardEnabled": True, "grayCoverage": False,
              "proportionalRegions": False, "coverageWeights": {}, "beardLuminance": False, "portraitLuminance": False}
    return all(cached.get(key, legacy.get(key)) == value for key, value in expected.items())


def Main():
    references = json.loads((HAIR / "Data_HairReferences.json").read_text(encoding="utf8"))
    atlasRows = max(2, (len(references["looks"])+ATLAS_COLUMNS-1)//ATLAS_COLUMNS)
    atlas = Image.new("RGB", (ATLAS_COLUMNS*TILE_SIZE, atlasRows*TILE_SIZE))
    luminanceAtlas = Image.new("RGB", atlas.size)
    metadataPath = HAIR / "Data_HairReferenceMasks.json"
    atlas_path = HAIR / "Textures/Texture_HairReferenceMasks.png"
    luminancePath = HAIR / "Textures/Texture_HairReferenceBeardLuminance.png"
    reuse = "--reuse-unchanged" in sys.argv
    old = json.loads(metadataPath.read_text(encoding="utf8")) if reuse and metadataPath.exists() else {}
    oldAtlas = Image.open(atlas_path).copy() if old and atlas_path.exists() else None
    oldLuminance = Image.open(luminancePath).copy() if old.get("luminanceAtlasSha256") and luminancePath.exists() else None
    if oldAtlas is not None and Hash(atlas_path.read_bytes()) != old.get("atlasSha256"):
        raise ValueError("Cached reference atlas checksum changed")
    if oldLuminance is not None and Hash(luminancePath.read_bytes()) != old.get("luminanceAtlasSha256"):
        raise ValueError("Cached beard luminance atlas checksum changed")
    looks = {}
    for index, (key, reference) in enumerate(references["looks"].items()):
        cached = old.get("looks", {}).get(key)
        if oldAtlas is not None and SameCoverageInputs(cached, reference) and (not reference["beard"].get("referenceLuminance") or oldLuminance is not None):
            x, y, w, h = cached["tile"]
            tile = oldAtlas.crop(tuple(round(value) for value in (x*oldAtlas.width, y*oldAtlas.height, (x+w)*oldAtlas.width, (y+h)*oldAtlas.height)))
            luminance = oldLuminance.crop(tuple(round(value) for value in (x*oldLuminance.width, y*oldLuminance.height, (x+w)*oldLuminance.width, (y+h)*oldLuminance.height))) if oldLuminance is not None else Image.new("L", (TILE_SIZE,TILE_SIZE))
            looks[key] = dict(cached)
            looks[key]["tile"] = [(index % ATLAS_COLUMNS)/ATLAS_COLUMNS, (index // ATLAS_COLUMNS)/atlasRows, 1/ATLAS_COLUMNS, 1/atlasRows]
            print(f"{key}: verified unchanged coverage reused", flush=True)
        else:
            tile, looks[key], luminance = Bake(reference, index, atlasRows)
            print(f"{key}: original-reference coverage baked", flush=True)
        looks[key]["beardEnabled"] = reference["beard"].get("enabled", True)
        atlas.paste(tile.convert("RGB"), ((index % ATLAS_COLUMNS)*TILE_SIZE, (index // ATLAS_COLUMNS)*TILE_SIZE))
        if reference["beard"].get("referenceLuminance"):
            luminanceAtlas.paste(luminance.convert("RGB"), ((index % ATLAS_COLUMNS)*TILE_SIZE, (index // ATLAS_COLUMNS)*TILE_SIZE))
    atlas.save(atlas_path, optimize=True)
    luminanceAtlas.save(luminancePath, optimize=True)
    definition_text = (HAIR / "Data_HairReferences.json").read_text(encoding='utf8')
    metadata = {"schema": "tengxian.hairReferenceMasks", "version": 1,
                "definitionSha256": Hash(definition_text.encode()),
                "atlas": "Textures/Texture_HairReferenceMasks.png",
                "luminanceAtlas": "Textures/Texture_HairReferenceBeardLuminance.png",
                "luminanceAtlasSha256": Hash(luminancePath.read_bytes()),
                "atlasSha256": Hash(atlas_path.read_bytes()), "parts": PARTS, "looks": looks}
    metadataPath.write_text(json.dumps(metadata, ensure_ascii=False, indent=1)+"\n", encoding="utf8")


if __name__ == "__main__":
    Main()
