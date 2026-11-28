"""Measure visible steel finish from the local Mariners' Museum photos."""

import argparse
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import re

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import binary_erosion, distance_transform_edt, gaussian_filter, map_coordinates


LUMA = np.array([.2126, .7152, .0722], dtype=np.float32)
REGISTERED_LUMA = np.array([.2126, .7152, .0722])
RECORD = Path(__file__).resolve().parent / "Reference/Type89Launcher/Data_Type89LauncherSteelReference.json"
CONTACT_AO = RECORD.parents[2] / "Source/Type89Launcher/Texture_Type89LauncherContactAo.png"
SEAM_AO = CONTACT_AO.with_name("Texture_Type89LauncherSeamAo.png")
JOINT_AO = CONTACT_AO.with_name("Texture_Type89LauncherJointAo.png")


def SaveReferenceRecord(record):
    encoded = json.dumps(record, ensure_ascii=False, indent=2)
    encoded = re.sub(r"\[\s*(-?\d+(?:\.\d+)?(?:\s*,\s*-?\d+(?:\.\d+)?)+)\s*\]",
                     lambda match: "[" + ", ".join(value.strip() for value in match[1].split(",")) + "]", encoded)
    RECORD.write_text(encoded + "\n", encoding="utf-8")


def ContactAoSha256():
    return sha256(CONTACT_AO.read_bytes()).hexdigest() if CONTACT_AO.is_file() else None


def TabWarmIdentity(tab):
    return TabResponseIdentity(tab) | {"surfaceSha256": tab.get("surfaceCalibration", {}).get("sha256"),
                                      "grainSha256": tab.get("grainCalibration", {}).get("sha256"),
                                      "contactAoSha256": ContactAoSha256()}


def TabLightBalanceIdentity(tab):
    return TabWarmIdentity(tab) | {"warmSha256": tab.get("warmCalibration", {}).get("sha256")}


def TabSteelBalanceIdentity(tab):
    return TabLightBalanceIdentity(tab) | {
        "lightBalanceSha256": tab.get("lightBalance", {}).get("sha256"),
        "seamAoSha256": sha256(SEAM_AO.read_bytes()).hexdigest(),
    }


def KnurlFlankResponseIdentity(flank):
    source = flank["source"]
    return {"photoSha256": source["sha256"], "sampleBounds": source["sampleBounds"],
            "uBySampleRow": source["uBySampleRow"], "footprint": flank["footprint"],
            "detailSha256": flank["detail"]["sha256"], "contactAoSha256": ContactAoSha256()}


def KnurlGrooveFinishIdentity(flank):
    return {"photoSha256": flank["source"]["sha256"],
            "photoPattern": flank.get("patternRegistration", {}).get("photo"),
            "responseSha256": flank.get("surfaceCalibration", {}).get("sha256"),
            "contactAoSha256": ContactAoSha256()}


def GripLightBalanceIdentity(flank):
    finish = json.dumps(flank.get("grooveFinish"), sort_keys=True, separators=(",", ":"))
    return KnurlFlankResponseIdentity(flank) | {
        "sourceResponseSha256": flank.get("surfaceCalibration", {}).get("sha256"),
        "sourceFinishSha256": sha256(finish.encode("utf-8")).hexdigest(),
    }


def GripAlbedoBalanceIdentity(flank):
    return GripLightBalanceIdentity(flank) | {
        "lightBalanceSha256": flank.get("lightBalance", {}).get("sha256"),
        "seamAoSha256": sha256(SEAM_AO.read_bytes()).hexdigest(),
    }


def ShoulderReflectionIdentity(flank):
    source = flank["source"]
    return {"photoSha256": source["sha256"], "photoRails": source["photoRails"], "viewCenter": source["viewCenter"],
            "footprint": flank["footprint"], "fineUvOffset": flank["fineUvOffset"],
            "detailSha256": flank["detail"]["sha256"], "contactAoSha256": ContactAoSha256(),
            "seamAoSha256": sha256(SEAM_AO.read_bytes()).hexdigest()}


def SurfaceBalanceIdentity(spec):
    previous = {key: value for key, value in spec.items() if key != "surfaceBalance"}
    encoded = json.dumps(previous, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return {"photoSha256": spec["source"]["sha256"], "footprint": spec["footprint"],
            "sourceFinishSha256": sha256(encoded).hexdigest(), "contactAoSha256": ContactAoSha256(),
            "seamAoSha256": sha256(SEAM_AO.read_bytes()).hexdigest()}


def WideReflectionIdentity(reference):
    patina = reference["barrelPatina"]
    previous = {key: value for key, value in patina.items() if key != "wideReflectionBalance"}
    basis = {"patina": previous, "footprint": reference["footprint"], "closeup": reference["closeups"]["Barrel"]}
    encoded = json.dumps(basis, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return {"photoSha256": patina["source"]["sha256"], "sourceFinishSha256": sha256(encoded).hexdigest(),
            "contactAoSha256": ContactAoSha256(), "seamAoSha256": sha256(SEAM_AO.read_bytes()).hexdigest()}


def ReverseReflectionIdentity(reference):
    basis = {"overall": reference["footprint"], "front": reference["barrelPatina"],
             "closeup": reference["closeups"]["Barrel"]}
    encoded = json.dumps(basis, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return {"sourceFinishSha256": sha256(encoded).hexdigest(),
            "contactAoSha256": ContactAoSha256(), "seamAoSha256": sha256(SEAM_AO.read_bytes()).hexdigest(),
            "jointAoSha256": sha256(JOINT_AO.read_bytes()).hexdigest()}


def SleeveReverseIdentity(reference):
    front = reference["closeups"]["Sleeve"]
    encoded = json.dumps(front, sort_keys=True, separators=(",", ":")).encode("utf-8")
    horizon = RECORD.parents[3] / "Data_Type89LauncherSleeveHorizon.mjs"
    file = horizon.read_bytes().replace(b"\r\n", b"\n")
    return {"frontPhotoSha256": front["source"]["sha256"], "sourceFinishSha256": sha256(encoded).hexdigest(),
            "horizonSha256": sha256(file).hexdigest(), "jointAoSha256": sha256(JOINT_AO.read_bytes()).hexdigest()}


def JointSteelIdentity(reference, region, *, photoFit=None):
    front = reference["closeups"][region] if photoFit is None else photoFit
    encoded = json.dumps(front, sort_keys=True, separators=(",", ":")).encode("utf-8")
    source = RECORD.parents[2] / "Source/Type89Launcher/Texture_Type89LauncherSteelSource.webp"
    atlas = RECORD.parents[3] / "_blender/Data_Type89LauncherSteelAtlas.json"
    layout = atlas.read_bytes().replace(b"\r\n", b"\n")
    return {"frontPhotoSha256": front["source"]["sha256"], "frontFitSha256": sha256(encoded).hexdigest(),
            "rawSteelSha256": sha256(source.read_bytes()).hexdigest(), "atlasSha256": sha256(layout).hexdigest(),
            "jointAoSha256": sha256(JOINT_AO.read_bytes()).hexdigest()}


def CollarJointIdentity(reference):
    return JointSteelIdentity(reference, "CollarRing")


def SaddleJointIdentity(reference):
    return JointSteelIdentity(reference, "Saddle")


def NeckJointIdentity(reference):
    detailAo = JOINT_AO.with_name("Texture_Type89LauncherContactDetailAo.png")
    return JointSteelIdentity(reference, "Neck") | {"contactDetailAoSha256": sha256(detailAo.read_bytes()).hexdigest()}


def StemJointIdentity(reference):
    detailAo = JOINT_AO.with_name("Texture_Type89LauncherContactDetailAo.png")
    return JointSteelIdentity(reference, "Stem") | {"contactDetailAoSha256": sha256(detailAo.read_bytes()).hexdigest()}


def TabReflectanceIdentity(reference, region):
    detailAo = JOINT_AO.with_name("Texture_Type89LauncherContactDetailAo.png")
    return JointSteelIdentity(reference, region) | {"contactDetailAoSha256": sha256(detailAo.read_bytes()).hexdigest()}


def ShoulderReflectanceIdentity(reference):
    shoulder = reference["shoulder"]
    direct = json.dumps(shoulder["Direct"], sort_keys=True, separators=(",", ":")).encode("utf-8")
    detailAo = JOINT_AO.with_name("Texture_Type89LauncherContactDetailAo.png")
    return JointSteelIdentity(reference, "Shoulder", photoFit=shoulder["Flank"]) | {
        "directFitSha256": sha256(direct).hexdigest(),
        "contactDetailAoSha256": sha256(detailAo.read_bytes()).hexdigest(),
    }


def WheelOxideIdentity(reference):
    detailAo = JOINT_AO.with_name("Texture_Type89LauncherContactDetailAo.png")
    return JointSteelIdentity(reference, "Wheel", photoFit=reference["wheelFinish"]) | {
        "contactDetailAoSha256": sha256(detailAo.read_bytes()).hexdigest(),
    }


def WheelRearIdentity(reference):
    oxide = reference.get("wheelOxideFinish", {})
    profile = {key: oxide.get(key) for key in ("fields", "phase")}
    encoded = json.dumps(profile, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return WheelOxideIdentity(reference) | {"oxideFieldsSha256": sha256(encoded).hexdigest()}


def GripRearIdentity(reference):
    grip = reference["knurl"]
    encoded = json.dumps(grip, sort_keys=True, separators=(",", ":")).encode("utf-8")
    detailAo = JOINT_AO.with_name("Texture_Type89LauncherContactDetailAo.png")
    return JointSteelIdentity(reference, "Knurl", photoFit=grip["flankWear"]) | {
        "gripFitSha256": sha256(encoded).hexdigest(),
        "contactDetailAoSha256": sha256(detailAo.read_bytes()).hexdigest(),
    }


def GripFamilyPhaseIdentity(reference):
    finish = json.dumps(reference.get("gripRearFinish"), sort_keys=True, separators=(",", ":"))
    return GripRearIdentity(reference) | {"gripFinishSha256": sha256(finish.encode("utf-8")).hexdigest()}


def SleeveJointIdentity(reference):
    previous = json.dumps(reference.get("sleeveReverseFinish"), sort_keys=True, separators=(",", ":"))
    detailAo = JOINT_AO.with_name("Texture_Type89LauncherContactDetailAo.png")
    return JointSteelIdentity(reference, "Sleeve") | {
        "rearFitSha256": sha256(previous.encode("utf-8")).hexdigest(),
        "horizonSha256": SleeveReverseIdentity(reference)["horizonSha256"],
        "contactDetailAoSha256": sha256(detailAo.read_bytes()).hexdigest(),
    }


def SleeveOpticalIdentity(reference):
    finish = json.dumps(reference.get("sleeveJointFinish"), sort_keys=True, separators=(",", ":"))
    return SleeveJointIdentity(reference) | {"sleeveFinishSha256": sha256(finish.encode("utf-8")).hexdigest()}


def CollarReflectanceIdentity(reference):
    previous = json.dumps(reference.get("collarJointFinish"), sort_keys=True, separators=(",", ":"))
    detailAo = JOINT_AO.with_name("Texture_Type89LauncherContactDetailAo.png")
    return CollarJointIdentity(reference) | {
        "collarFitSha256": sha256(previous.encode("utf-8")).hexdigest(),
        "contactDetailAoSha256": sha256(detailAo.read_bytes()).hexdigest(),
    }


def SaddleReflectanceIdentity(reference):
    previous = json.dumps(reference.get("saddleJointFinish"), sort_keys=True, separators=(",", ":"))
    detailAo = JOINT_AO.with_name("Texture_Type89LauncherContactDetailAo.png")
    return SaddleJointIdentity(reference) | {
        "previousSaddleSha256": sha256(previous.encode("utf-8")).hexdigest(),
        "contactDetailAoSha256": sha256(detailAo.read_bytes()).hexdigest(),
    }


def SaddleRimIdentity(reference):
    upper = json.dumps(reference.get("saddleReflectanceFinish"), sort_keys=True, separators=(",", ":"))
    detailAo = JOINT_AO.with_name("Texture_Type89LauncherContactDetailAo.png")
    return SaddleJointIdentity(reference) | {
        "upperFinishSha256": sha256(upper.encode("utf-8")).hexdigest(),
        "contactDetailAoSha256": sha256(detailAo.read_bytes()).hexdigest(),
    }


def BarrelJointIdentity(reference):
    identity = JointSteelIdentity(reference, "Barrel")
    previous = json.dumps(reference.get("reverseReflectionBalance"), sort_keys=True, separators=(",", ":"))
    detailAo = JOINT_AO.with_name("Texture_Type89LauncherContactDetailAo.png")
    return identity | ReverseReflectionIdentity(reference) | {
        "closePhotoSha256": identity["frontPhotoSha256"],
        "frontPhotoSha256": reference["barrelPatina"]["source"]["sha256"],
        "rearFitSha256": sha256(previous.encode("utf-8")).hexdigest(),
        "contactDetailAoSha256": sha256(detailAo.read_bytes()).hexdigest(),
    }


BARREL_DETAIL = RECORD.with_name("Texture_Type89LauncherBarrelDetail.png")
BARREL_MARKS = RECORD.with_name("Texture_Type89LauncherBarrelMarks.png")
BARREL_SMALL_MARKS = RECORD.with_name("Texture_Type89LauncherSmallBarrelMarks.png")
BARREL_FACETS = RECORD.with_name("Texture_Type89LauncherBarrelFacets.png")
BARREL_BAND = RECORD.with_name("Texture_Type89LauncherBarrelBand.png")
BARREL_GRAIN = RECORD.with_name("Texture_Type89LauncherBarrelGrain.png")
COLLAR_DETAIL = RECORD.with_name("Texture_Type89LauncherCollarDetail.png")
COLLAR_RESPONSE = RECORD.with_name("Texture_Type89LauncherCollarRingResponse.png")
SADDLE_DETAIL = RECORD.with_name("Texture_Type89LauncherSaddleDetail.png")
SADDLE_RESPONSE = RECORD.with_name("Texture_Type89LauncherSaddleResponse.png")
STEM_DETAIL = RECORD.with_name("Texture_Type89LauncherStemDetail.png")
STEM_RESPONSE = RECORD.with_name("Texture_Type89LauncherStemResponse.png")
NECK_DETAIL = RECORD.with_name("Texture_Type89LauncherNeckDetail.png")
NECK_CHROMA = RECORD.with_name("Texture_Type89LauncherNeckChroma.png")
NECK_MARKS = RECORD.with_name("Texture_Type89LauncherNeckMarks.png")
TAB_GRAIN = RECORD.with_name("Texture_Type89LauncherTabGrain.png")
TAB_RESPONSE = RECORD.with_name("Texture_Type89LauncherTabResponse.png")
SLEEVE_DETAIL = RECORD.with_name("Texture_Type89LauncherSleeveDetail.png")
KNURL_DETAIL = RECORD.with_name("Texture_Type89LauncherKnurlDetail.png")
KNURL_FLANK = RECORD.with_name("Texture_Type89LauncherKnurlFlank.png")
KNURL_RESPONSE = RECORD.with_name("Texture_Type89LauncherKnurlResponse.png")
TAB_FRONT_PAIR_PROJECTION = [
    [0.27025285843021063, -0.006591860418187142, 1028.448752789885],
    [-0.011732769701317706, 0.28119255144826527, 475.2094623617538],
    [-1.4645408783465048e-05, -1.0538823106249734e-05, 1.0],
]


def Photo(folder, number):
    path = folder / f"Mariners{number}.jpg"
    with Image.open(path) as source:
        rotated = source.height > source.width
        image = source.convert("RGB")
        if rotated:
            image = image.transpose(Image.Transpose.ROTATE_90)
    return np.asarray(image, dtype=np.float32), {
        "file": path.name,
        "sha256": sha256(path.read_bytes()).hexdigest(),
        "rotatedCounterclockwise": rotated,
    }


def Sample(image, x, y, radius=4):
    ix, iy = round(x), round(y)
    patch = image[iy-radius:iy+radius+1, ix-radius:ix+radius+1]
    return np.median(patch.reshape(-1, 3), axis=0)


def SampleBilinear(image, x, y):
    ix, iy = np.floor(x).astype(int), np.floor(y).astype(int)
    dx, dy = x - ix, y - iy
    above = (1 - dx) * image[iy, ix] + dx * image[iy, ix + 1]
    below = (1 - dx) * image[iy + 1, ix] + dx * image[iy + 1, ix + 1]
    return (1 - dy) * above + dy * below


def FinishMap(samples, evidence, footprint, planar=False):
    lightness = samples @ LUMA
    # The median along each strip removes a shared cylindrical reflection band.
    # On the shoe subtract a plane fitted robustly to the photographed face.
    if planar:
        u, v = np.meshgrid(np.linspace(-1, 1, lightness.shape[0]),
                           np.linspace(-1, 1, lightness.shape[1]), indexing="ij")
        axes = np.stack([np.ones(u.size), u.ravel(), v.ravel()], axis=1)
        intensity = lightness.ravel()
        weight = np.ones_like(intensity)
        for _ in range(3):
            fit = np.linalg.lstsq(axes * weight[:, None], intensity * weight, rcond=None)[0]
            weight = 1 / np.maximum(1, np.abs(intensity - axes @ fit) / 11)
        relative = lightness - (axes @ fit).reshape(lightness.shape)
    else:
        relative = lightness - np.median(lightness, axis=1, keepdims=True)
    # Chromaticity retains the warm oxide contrast when exposure changes.
    warmth = 100 * (samples[..., 0] - samples[..., 2]) / np.maximum(lightness, 25)
    warmth -= np.median(warmth)
    return {"source": evidence, "footprint": footprint,
            "relativeLuminance": np.clip(np.rint(relative), -30, 30).astype(int).tolist(),
            "relativeWarmth": np.clip(np.rint(warmth), -18, 18).astype(int).tolist()}


def PatinaMap(samples):
    lightness = samples @ LUMA
    warmth = (samples[..., 0] - samples[..., 2]) / np.maximum(lightness, 25)
    middle, bright, peak = np.percentile(lightness, [50, 82, 95])
    neutral = float(np.median(warmth[(lightness >= bright) & (lightness <= peak)]))
    # Compare hue to the same photograph's bright steel. Use the color
    # separation to distinguish brown oxide from the cooler worn finish.
    oxide = np.clip((warmth - neutral - .020) / .212, 0, 1)
    cool = np.clip((neutral + .022 - warmth) / .097, 0, 1)
    cool *= np.clip((peak - lightness) / (.60 * peak), 0, 1)
    polished = np.clip((neutral + .10 - warmth) / .105, 0, 1)
    polished *= np.clip((lightness - middle) / max(bright - middle, 12), 0, 1)
    return {"neutralWarmth": round(neutral, 4), "oxideCoverage": np.rint(100 * oxide).astype(int).tolist(),
            "coolFilmCoverage": np.rint(100 * cool).astype(int).tolist(),
            "exposedSteelCoverage": np.rint(100 * polished).astype(int).tolist()}


def OverallBarrelPatina(folder, footprint):
    image, source = Photo(folder, 1)
    # Image-space silhouette rails keep samples on the external steel surface.
    rails = [[83, 550, 682], [200, 548, 683], [400, 544, 684], [611, 541, 685]]
    stations, top, bottom = np.asarray(rails).T
    xs = np.linspace(stations[0], stations[-1], 43)
    lo, hi = np.interp(xs, stations, top), np.interp(xs, stations, bottom)
    angles = np.linspace(-footprint["uHalfSpan"], footprint["uHalfSpan"], 25)
    ys = (lo + hi) / 2 + (hi - lo) / 2 * np.sin(2 * np.pi * angles[:, None])
    samples = np.array([[Sample(image, x, y, radius=4) for x, y in zip(xs, row)] for row in ys])
    source["sampleRails"] = rails
    return {"source": source, "footprint": footprint, **PatinaMap(samples)}


def PhotoResiduals(image, envelopeRadius=8.0):
    photo = Image.fromarray(image.astype(np.uint8))
    fine = np.asarray(photo.filter(ImageFilter.GaussianBlur(.58)), dtype=np.float32)
    surround = np.asarray(photo.filter(ImageFilter.GaussianBlur(envelopeRadius)), dtype=np.float32)
    lightness = fine @ LUMA
    envelope = surround @ LUMA
    tone = (lightness - envelope) / np.maximum(envelope, 35)
    warmth = ((fine[..., 0] - fine[..., 2]) / np.maximum(lightness, 30)
              - (surround[..., 0] - surround[..., 2]) / np.maximum(envelope, 30))

    return tone, warmth, lightness


def SaveDetailPlate(tone, warmth, confidence, xs, ys, path, *, halfSize=True, adjustment=None):
    height, width = xs.shape
    us, vs = np.meshgrid(np.linspace(0, 1, width), np.linspace(0, 1, height))
    edge = np.clip(14 * np.minimum(np.minimum(us, 1 - us), np.minimum(vs, 1 - vs)), 0, 1)
    toneScale, warmthScale = 300, 520
    channels = [128 + toneScale * SampleBilinear(tone, xs, ys),
                128 + warmthScale * SampleBilinear(warmth, xs, ys),
                255 * edge * SampleBilinear(confidence, xs, ys)]
    encoded = np.rint(np.clip(np.stack(channels, axis=-1), 0, 255)).astype(np.uint8)
    if adjustment is not None:
        encoded = adjustment(encoded, toneScale, warmthScale)
    detail = Image.fromarray(encoded)
    if halfSize:
        detail = detail.resize((width // 2, height // 2), Image.Resampling.LANCZOS)
    detail.save(path, optimize=True)
    return {"file": path.name, "sha256": sha256(path.read_bytes()).hexdigest(),
            "toneScale": toneScale, "warmthScale": warmthScale}


def WriteDetailPlate(image, xs, ys, path, excluded=()):
    tone, warmth, lightness = PhotoResiduals(image)
    valid = Image.new("L", (image.shape[1], image.shape[0]), 255)
    draw = ImageDraw.Draw(valid)
    for box in excluded:
        draw.rectangle(box, fill=0)
    confidence = np.asarray(valid.filter(ImageFilter.GaussianBlur(8)), dtype=np.float32) / 255
    confidence *= np.clip((245 - lightness) / 30, 0, 1)
    return SaveDetailPlate(tone, warmth, confidence, xs, ys, path)


def BarrelPhotoCoordinates(projection, halfSpan, u, v):
    center, radius, first, last = projection
    x = center + radius * np.sin(2 * np.pi * halfSpan * (2 * u - 1))
    y = first + (last - first) * v
    return x, y


def BarrelSteelIslands(image, projection, halfSpan):
    # Average over the tiny pits and favor the pale steel within the warm oxide.
    smooth = gaussian_filter(image, (3.4, 3.4, 0), mode="nearest")
    u, v = np.meshgrid(np.linspace(0, 1, 85), np.linspace(0, 1, 65), indexing="ij")
    x, y = BarrelPhotoCoordinates(projection, halfSpan, u, v)
    sampled = np.stack([SampleBilinear(smooth[..., channel], x, y) for channel in range(3)], axis=-1)
    luma = sampled @ LUMA
    warmth = (sampled[..., 0] - sampled[..., 2]) / np.maximum(luma, 25)
    bright = np.clip((luma - 102) / 31, 0, 1)
    pale = .58 + .42 * np.clip((.23 - warmth) / .154, 0, 1)
    return np.rint(bright * pale * 100).astype(int).tolist()


def BarrelCalibrationIdentity(barrel):
    return {"photoSha256": barrel["source"]["sha256"],
            "projection": barrel["source"]["projection"], "footprint": barrel["footprint"]}


def ReadRegisteredFrame(folder):
    payloads = {name: (folder / name).read_bytes() for name in ("beauty.png", "uvHi.png", "uvLo.png")}
    images = {}
    for name, data in payloads.items():
        with Image.open(BytesIO(data)) as frame:
            images[name] = np.asarray(frame.convert("RGB"))
    hi, lo = (images[name].astype(np.int32) for name in ("uvHi.png", "uvLo.png"))
    u, v = ((hi[..., :2] * 256 + lo[..., :2]) / 65535).transpose(2, 0, 1)
    visible = (hi[..., 2] == 255) & (lo[..., 2] == 255)
    hashes = {name: sha256(data).hexdigest() for name, data in payloads.items()}
    return u, v, visible, images["beauty.png"].astype(float), hashes


def ReadRegisteredRgb(folder, name, hashes):
    data = (folder / name).read_bytes()
    hashes[name] = sha256(data).hexdigest()
    with Image.open(BytesIO(data)) as frame:
        return np.asarray(frame.convert("RGB"), dtype=float)


def ReadRegisteredLuma(folder, name, hashes):
    return ReadRegisteredRgb(folder, name, hashes) @ REGISTERED_LUMA


def RegisteredBarrelPhotoFrame(photo, barrel, folder):
    u, v, visible, render, hashes = ReadRegisteredFrame(folder)
    interior = binary_erosion(visible & (u > .08) & (u < .92) & (v > .09) & (v < .91), iterations=3)
    x, y = BarrelPhotoCoordinates(barrel["source"]["projection"], barrel["footprint"]["uHalfSpan"], u, v)
    source = np.stack([SampleBilinear(channel, x, y) for channel in np.moveaxis(photo, -1, 0)], axis=-1)
    return u, v, interior, source, render, hashes


def RegisteredBarrelView(photo, barrel, folder, shape):
    u, v, interior, source, render, hashes = RegisteredBarrelPhotoFrame(photo, barrel, folder)
    wanted, observed = source @ REGISTERED_LUMA, render @ REGISTERED_LUMA
    valid = interior & (u > .54) & (v > .33) & (wanted > 25) & (wanted < 242) & (observed > 22)
    if np.count_nonzero(valid) < 1000:
        raise ValueError(f"The registered barrel patch is missing from {folder}")

    rows, columns = shape
    cells = np.floor(u[valid] * rows).astype(int) * columns + np.floor(v[valid] * columns).astype(int)
    residual = np.log((wanted[valid] + 14) / (observed[valid] + 14))
    size = rows * columns
    counts = np.bincount(cells, minlength=size).reshape(shape).astype(float)
    signals = np.bincount(cells, weights=residual, minlength=size).reshape(shape)
    bright = np.clip((wanted[valid] - 133) / 40, 0, 1)
    peaks = np.bincount(cells, weights=np.clip(residual, 0, .55) * bright, minlength=size).reshape(shape)

    def Average(values, sigma):
        support = gaussian_filter(counts, sigma)
        return gaussian_filter(values, sigma) / np.maximum(support, .2), support

    local, support = Average(signals, (1.25, 1.4))
    broad, _ = Average(signals, (6.9, 5.9))
    peak, _ = Average(peaks, (1.05, 1.1))
    return local - broad, support, peak, local, hashes


def BarrelCalibration(photo, barrel, evidence):
    # Retain shared local residuals across the two fixed-light captures and remove the broad lighting field.
    views = ("V38BarrelFinalDirect", "V38BarrelFinalFixedRake", "V38BarrelDefaultControl")
    shape = (93, 59)
    direct, oblique, default = [RegisteredBarrelView(photo, barrel, evidence / view, shape) for view in views]
    face, faceSupport, frontPeak, _, faceHashes = direct
    side, sideSupport, sidePeak, _, sideHashes = oblique
    _, defaultSupport, defaultPeak, defaultResidual, defaultHashes = default
    samples = np.clip(np.minimum(faceSupport, sideSupport) / 1.8, 0, 1)
    agreement = np.exp(-.5 * ((face - side) / .15)**2)
    contrast = np.clip(.63 * face + .37 * side, -.37, .37) * samples * agreement
    peaks = np.minimum(frontPeak, sidePeak) * samples
    # Limit the corrections where the default light already makes the same steel brighter or darker.
    defaultWeight = np.clip(defaultSupport / 1.8, 0, 1)
    support = np.clip(np.sign(contrast) * defaultResidual / (np.abs(contrast) + .015), 0, 1)
    relief = np.where(contrast < 0, .76, .80) * (1 - support) * defaultWeight
    contrast *= 1 - relief
    peakSupport = np.clip((defaultPeak + .008) / (peaks + .008), 0, 1)
    peaks *= 1 - .58 * (1 - peakSupport) * defaultWeight
    hashes = (faceHashes, sideHashes, defaultHashes)
    return {**BarrelCalibrationIdentity(barrel), "frameSha256": dict(zip(views, hashes)),
            "contrast": np.rint(contrast * 1000).astype(int).tolist(),
            "highlights": np.rint(peaks * 1000).astype(int).tolist()}


def RegisteredBarrelResponse(photo, barrel, folder, shape, sigma, highlightWeight):
    u, v, interior, target, render, hashes = RegisteredBarrelPhotoFrame(photo, barrel, folder)
    source, luma = target @ REGISTERED_LUMA, render @ REGISTERED_LUMA
    valid = interior & (source > 22) & (source < 240) & (luma > 20)
    if np.count_nonzero(valid) < 1000:
        raise ValueError(f"The registered barrel response is missing from {folder}")

    rows, columns = shape
    cells = np.floor(u[valid] * rows).astype(int) * columns + np.floor(v[valid] * columns).astype(int)
    reliability = 1 + highlightWeight * np.clip((source[valid] - 119) / 39, 0, 1)
    counts = np.bincount(cells, weights=reliability, minlength=rows * columns).reshape(shape)
    support = gaussian_filter(counts, sigma)

    def Sample(values):
        accum = np.bincount(cells, weights=values[valid] * reliability, minlength=rows * columns).reshape(shape)
        return gaussian_filter(accum, sigma) / np.maximum(.20, support)

    residual = Sample(np.log((source + 14) / (luma + 14)))
    derivatives = []
    roughnessCurvature = None
    for channel, step in (("base", .28), ("roughness", .28), ("metalness", .25)):
        plus, minus = (ReadRegisteredLuma(folder, f"{channel}{suffix}.png", hashes) for suffix in ("Plus", "Minus"))
        derivatives.append(Sample(np.log((plus + 14) / (minus + 14))) / (2 * step))
        if channel == "roughness":
            roughnessCurvature = Sample(np.log(((plus + 14) * (minus + 14)) / (luma + 14)**2)) / (2 * step**2)
    return np.stack(derivatives, axis=-1), residual, support, hashes, roughnessCurvature


def FitBarrelResponse(views, viewWeights, shape):
    effective = [weight * np.clip(view[2] / .85, 0, 1) for view, weight in zip(views, viewWeights)]
    sensors = [view[0][..., [0, 2]] for view in views]
    regularization = np.array([.015, .023])
    matrix = np.diag(regularization) + sum(weight[..., None, None] * sensor[..., :, None] * sensor[..., None, :]
                                         for sensor, weight in zip(sensors, effective))
    lower, upper = np.array([-.70, -.30]), np.array([.68, .30])
    best = np.full(shape, np.inf)
    result = np.zeros((*shape, 3))
    # The specular response to roughness is nonlinear. At each tested roughness,
    # fit bounded base color and metalness changes with the recorded sensitivities.
    for roughness in np.linspace(-.28, .24, 15):
        residuals = [residual - (gradient[..., 1] + curvature * roughness) * roughness
                     for gradient, residual, _, _, curvature in views]
        vector = sum((weight * residual)[..., None] * sensor
                     for weight, residual, sensor in zip(effective, residuals, sensors))
        solution = np.clip(np.linalg.solve(matrix, vector[..., None])[..., 0], lower, upper)
        for _ in range(8):
            solution[..., 0] = np.clip((vector[..., 0] - matrix[..., 0, 1] * solution[..., 1]) / matrix[..., 0, 0],
                                       lower[0], upper[0])
            solution[..., 1] = np.clip((vector[..., 1] - matrix[..., 1, 0] * solution[..., 0]) / matrix[..., 1, 1],
                                       lower[1], upper[1])
        loss = (solution**2 * regularization).sum(axis=-1) + roughness**2 * .030
        loss += sum(weight * (residual - (sensor * solution).sum(axis=-1))**2
                    for residual, sensor, weight in zip(residuals, sensors, effective))
        improved = loss < best
        best[improved] = loss[improved]
        result[improved] = np.stack((solution[..., 0], np.full(shape, roughness), solution[..., 1]), axis=-1)[improved]
    coverage = np.clip(np.minimum(views[0][2], views[1][2]) / .7, 0, 1)
    return gaussian_filter(result * coverage[..., None], (.52, .52, 0))


def BarrelResponseCalibration(photo, barrel, evidence):
    names = ("V41ResponseDirect", "V41ResponseDefault")
    shape = (93, 59)
    views = [RegisteredBarrelResponse(photo, barrel, evidence / name, shape, 1.05, 1.5) for name in names]
    response = FitBarrelResponse(views, (.52, .48), shape)
    maps = {channel: np.rint(response[..., index] * 1000).astype(int).tolist()
            for index, channel in enumerate(("base", "roughness", "metalness"))}
    return {**BarrelCalibrationIdentity(barrel), "frameSha256": {name: view[3] for name, view in zip(names, views)}, **maps}


def RegisteredBarrelChroma(photo, barrel, folder, shape):
    u, v, interior, source, render, hashes = RegisteredBarrelPhotoFrame(photo, barrel, folder)
    wanted, observed = source @ REGISTERED_LUMA, render @ REGISTERED_LUMA
    valid = interior & (wanted > 31) & (wanted < 230) & (observed > 31) & (observed < 230)
    if np.count_nonzero(valid) < 1000:
        raise ValueError(f"The registered barrel color is missing from {folder}")

    rows, columns = shape
    cells = np.floor(u[valid]*rows).astype(int)*columns + np.floor(v[valid]*columns).astype(int)
    offset = source[valid] / wanted[valid, None] - render[valid] / observed[valid, None]
    counts = np.bincount(cells, minlength=rows * columns).reshape(shape).astype(float)
    support = gaussian_filter(counts, 1.3)
    channels = []
    for signal in offset.T:
        weighted = np.bincount(cells, weights=signal, minlength=rows * columns).reshape(shape)
        channels.append(gaussian_filter(weighted, 1.3) / np.maximum(.20, support))
    return np.stack(channels, axis=-1), support, hashes


def BarrelColorAdjustment(photo, barrel, evidence):
    names = ("V41BarrelFinalDirect", "V41BarrelFinalDefault")
    direct, default = [RegisteredBarrelChroma(photo, barrel, evidence / name, (93, 59)) for name in names]
    face, faceSupport, faceHashes = direct
    normal, normalSupport, normalHashes = default
    support = np.clip(np.minimum(faceSupport, normalSupport) / .8, 0, 1)
    agreement = np.exp(-.5 * ((face - normal) / .11)**2)
    chroma = np.clip((.59*face + .41*normal) * agreement * support[..., None], -.18, .18)
    # Correct the chroma in display color while preserving its luminance.
    chroma -= (chroma @ REGISTERED_LUMA)[..., None]
    maps = {channel: np.rint(chroma[..., index] * 1000).astype(int).tolist()
            for index, channel in enumerate(("red", "green", "blue"))}
    return maps, dict(zip(names, (faceHashes, normalHashes)))


def BarrelFineAdjustment(photo, barrel, evidence):
    names = ("V42FineResponseDirect", "V42FineResponseDefault")
    folders = [evidence / name for name in names]
    u, v, directInside, source, direct, directHashes = RegisteredBarrelPhotoFrame(photo, barrel, folders[0])
    otherU, otherV, defaultInside, _, default, defaultHashes = RegisteredBarrelPhotoFrame(photo, barrel, folders[1])
    if not (np.array_equal(u, otherU) and np.array_equal(v, otherV)):
        raise ValueError("The fine barrel captures must use the same camera and surface coordinates")

    photoLuma = source @ REGISTERED_LUMA
    rendered = np.stack((direct @ REGISTERED_LUMA, default @ REGISTERED_LUMA), axis=-1)
    valid = directInside & defaultInside & (photoLuma > 25) & (photoLuma < 240) & (np.min(rendered, axis=-1) > 23)
    if np.count_nonzero(valid) < 1000:
        raise ValueError("The fine barrel captures do not cover the photographed patch")
    wanted = photoLuma[valid]
    residual = np.log(wanted[:, None] + 14) - np.log(rendered[valid] + 14)

    def Response(folder, hashes, channel, step):
        plus, minus = (ReadRegisteredLuma(folder, f"{channel}{side}.png", hashes)[valid] for side in ("Plus", "Minus"))
        return np.log((plus + 14) / (minus + 14)) / (2 * step)

    frameHashes = (directHashes, defaultHashes)
    baseSlope = np.stack([Response(folder, hashes, "base", .19) for folder, hashes in zip(folders, frameHashes)], axis=-1)
    signed = residual / np.clip(baseSlope, .25, .90)
    agrees = signed[:, 0] * signed[:, 1] > 0
    shared = np.where(agrees, np.sign(signed[:, 0]) * np.min(np.abs(signed), axis=-1), 0)

    shape = (239, 159)
    rows, columns = shape
    # ReferenceField interpolates between sample centers at 0 and 1 on each axis.
    cells = np.rint(u[valid] * (rows - 1)).astype(int) * columns + np.rint(v[valid] * (columns - 1)).astype(int)

    def Grid(signal):
        values = np.bincount(cells, weights=signal, minlength=rows * columns).reshape(shape)
        return gaussian_filter(values, .71)

    peak = np.clip((wanted - 108) / 37, 0, 1)
    reliability = 1 + .65 * np.clip((wanted - 117) / 36, 0, 1)
    highlightWeight = (1 + 1.4 * peak) * reliability
    shadowWeight = (1 - .83 * peak) * reliability
    highSupport = np.maximum(Grid(highlightWeight), .55)
    bright = Grid(np.clip(shared, 0, .39) * highlightWeight) / highSupport
    dark = Grid(np.clip(shared, -.36, 0) * shadowWeight) / np.maximum(Grid(shadowWeight), .55)
    peakCoverage = Grid(peak * reliability) / np.maximum(Grid(reliability), .55)
    # Keep the correction for the surrounding oxide from darkening the small reflected flecks.
    base = bright * (1.08 + 2.30 * peakCoverage) + dark * (1 - .99 * peakCoverage)**2
    base = np.clip(1.05 * base, -.32, .42)

    metalSlope = Response(folders[1], defaultHashes, "metalness", .22)
    remaining = baseSlope[:, 1] * base.ravel()[cells] - residual[:, 1] - .020
    trim = np.clip(remaining / np.maximum(-metalSlope, .09), 0, .26) * peak
    metal = Grid(trim * highlightWeight) / highSupport
    maps = {name: np.rint(values * 1000).astype(int).tolist() for name, values in (("base", base), ("metalness", metal))}
    return maps, dict(zip(names, frameHashes))


def BarrelFinishCalibration(photo, barrel, evidence):
    chroma, colorHashes = BarrelColorAdjustment(photo, barrel, evidence)
    fine, fineHashes = BarrelFineAdjustment(photo, barrel, evidence)
    return {**BarrelCalibrationIdentity(barrel), "frameSha256": {**colorHashes, **fineHashes}, **chroma, **fine}


def BarrelDetail(image, projection, halfSpan, stampTrace):
    # Hold out the punch marks while keeping the steel grain beside the grooves.
    untracedMarks = [[148, 291, 197, 353], [756, 284, 811, 346]]
    strokeMargin, feather = 10, 4
    tone, warmth, lightness = PhotoResiduals(image)
    valid = Image.new("L", (image.shape[1], image.shape[0]), 255)
    draw = ImageDraw.Draw(valid)
    for box in untracedMarks:
        draw.rectangle(box, fill=0)
    for width, stroke in stampTrace["strokes"]:
        points = [tuple(point) for point in stroke]
        width += 2 * strokeMargin
        draw.line(points, fill=0, width=width, joint="curve")
        halfWidth = width / 2
        for x, y in (points[0], points[-1]):
            draw.ellipse((x - halfWidth, y - halfWidth, x + halfWidth, y + halfWidth), fill=0)
    confidence = np.asarray(valid.filter(ImageFilter.GaussianBlur(feather)), dtype=np.float32) / 255
    confidence *= np.clip((245 - lightness) / 30, 0, 1)
    us, vs = np.meshgrid(np.linspace(0, 1, 584), np.linspace(0, 1, 320))
    xs, ys = BarrelPhotoCoordinates(projection, halfSpan, us, vs)
    detail = SaveDetailPlate(tone, warmth, confidence, xs, ys, BARREL_DETAIL, halfSize=False)
    return {**detail, "excludedMarks": untracedMarks, "strokeMarginPixels": strokeMargin,
            "maskFeatherPixels": feather, "registrationOffsetInFootprint": [.003937, -.005615]}


BARREL_MATERIAL_GRID = (151, 109)
BARREL_HIGHLIGHT_GRID = (239, 159)
BARREL_METAL_TRIALS = ((.89, 0), (.89, .32), (.19, .28))
BARREL_ROUGHNESS_TRIALS = ((.27, 0), (.27, .38), (.27, .74), (.90, .48))
BARREL_MATERIAL_CHANNELS = ("base", "polish", "matte", "metal", "oxide")


def ReadBarrelMaterialViews(photo, barrel, evidence, names):
    folders = tuple(evidence / name for name in names)
    captures = [RegisteredBarrelPhotoFrame(photo, barrel, folder) for folder in folders]
    u, v, _, colors, _, _ = captures[0]
    if any(not (np.array_equal(u, otherU) and np.array_equal(v, otherV))
           for otherU, otherV, *_ in captures[1:]):
        raise ValueError("The barrel material views must use the same camera and surface coordinates")
    inside = np.logical_and.reduce([row[2] for row in captures])
    frames = [row[5] for row in captures]
    rendered = np.stack([row[4] @ REGISTERED_LUMA for row in captures], axis=-1)

    def Sample(name, valid):
        return np.stack([ReadRegisteredLuma(folder, name + ".png", hashes)[valid]
                         for folder, hashes in zip(folders, frames)], axis=-1)

    return u, v, inside, colors @ REGISTERED_LUMA, rendered, Sample, dict(zip(names, frames))


def FitBarrelMaterialResponse(source, baseline, coords, sample):
    rows, columns = BARREL_MATERIAL_GRID
    row, col = np.rint(coords).astype(int)
    cells = row * columns + col
    reliability = 1 + .72 * np.clip((source - 112) / 42, 0, 1)
    faceWeight = .56 + .10 * np.clip((source - 127) / 30, 0, 1)
    weights = np.stack((faceWeight, 1 - faceWeight), axis=-1)
    counts = np.bincount(cells, weights=reliability, minlength=rows * columns).reshape(BARREL_MATERIAL_GRID)
    sigma = (1.03, 1.08)
    support = gaussian_filter(counts, sigma)

    def Smooth(values):
        sums = np.bincount(cells, weights=reliability * values, minlength=rows * columns).reshape(BARREL_MATERIAL_GRID)
        return gaussian_filter(sums, sigma) / np.maximum(support, .28)

    target = np.log(source + 14)
    lowerDefault = np.minimum(Smooth(target - np.log(baseline[:, 1] + 14)) - .013, -.038)
    best = np.full(BARREL_MATERIAL_GRID, np.inf)
    selected = np.zeros((*BARREL_MATERIAL_GRID, len(BARREL_MATERIAL_CHANNELS)))
    guard = .58
    for i, (metalTarget, metal) in enumerate(BARREL_METAL_TRIALS):
        for j, (roughTarget, rough) in enumerate(BARREL_ROUGHNESS_TRIALS):
            prefix = f"Fit{i}{j}"
            centers = sample(prefix + "At")
            if i == 0 and j == 0 and np.percentile(np.abs(centers - baseline), 99) >= 1:
                raise ValueError("The unmodified barrel response frame differs from its baseline")
            current = np.log(centers + 14)
            residual = target[:, None] - current
            defaultError = Smooth(residual[:, 1])
            zeroLoss = Smooth((weights * residual**2).sum(axis=-1))
            lowest = np.full(BARREL_MATERIAL_GRID, np.inf)
            chosen = np.zeros(BARREL_MATERIAL_GRID)
            for direction, limit in (("Minus", -.40), ("Plus", .48)):
                slope = np.clip((np.log(sample(prefix + direction) + 14) - current) / limit, .12, 1.10)
                pull = Smooth((weights * residual * slope).sum(axis=-1))
                power = Smooth((weights * slope**2).sum(axis=-1)) + .0025
                slopeDefault = np.maximum(.08, Smooth(slope[:, 1]))
                allowed = defaultError - lowerDefault
                gain = ((pull + guard * slopeDefault * np.minimum(allowed, 0))
                        / (power + guard * slopeDefault**2 * (allowed < 0)))
                limited = np.minimum(gain, allowed / slopeDefault)
                gain = np.where(gain > limited, .25 * gain + .75 * limited, gain)
                gain = np.clip(gain, min(0, limit), max(0, limit))
                risk = np.maximum(lowerDefault - (defaultError - slopeDefault * gain), 0)
                loss = zeroLoss - 2 * gain * pull + gain**2 * power + guard * risk**2
                improved = loss < lowest
                lowest[improved] = loss[improved]
                chosen[improved] = gain[improved]
            loss = lowest + .0040 * rough**2 + .0030 * metal**2
            improved = loss < best
            best[improved] = loss[improved]
            selected[..., 0][improved] = chosen[improved]
            selected[..., 1][improved] = rough if roughTarget == .27 else 0
            selected[..., 2][improved] = rough if roughTarget == .90 else 0
            selected[..., 3][improved] = metal if metalTarget == .89 else 0
            selected[..., 4][improved] = metal if metalTarget == .19 else 0
    fields = gaussian_filter(selected * np.clip(support / .80, 0, 1)[..., None], (.62, .80, 0))
    return np.rint(fields * 1000) / 1000


def RefineBarrelMaterialPeaks(photo, barrel, source, baseline, coords, sample, base):
    u = coords[0] / (BARREL_MATERIAL_GRID[0] - 1)
    v = coords[1] / (BARREL_MATERIAL_GRID[1] - 1)
    glints = (u > .58) & (v > .56) & (source > 123) & (source < 233)
    target, original = source[glints], baseline[glints]
    allowed = np.maximum(3.5, .66 * np.abs(original[:, 1] - target) + .9)
    wanted = np.log(target + 14)
    lowerDefault = np.log(np.maximum(1, target - allowed) + 14)
    upperDefault = np.log(target + allowed + 14)
    weights = np.array([.73, .27])
    peaks = np.zeros((len(target), len(BARREL_MATERIAL_CHANNELS)))
    best = np.full(len(target), np.inf)

    # Keep the default-light error bounded at each photographed bright fleck before filtering.
    for i, (metalTarget, metal) in enumerate(BARREL_METAL_TRIALS):
        for j, (roughTarget, rough) in enumerate(BARREL_ROUGHNESS_TRIALS):
            prefix = f"Fit{i}{j}"
            center = np.log(sample(prefix + "At")[glints] + 14)
            for name, limit in (("Minus", -.40), ("Plus", .48)):
                end = np.log(sample(prefix + name)[glints] + 14)
                slope = np.clip((end - center) / limit, .13, 1.10)
                lower = np.maximum((lowerDefault - center[:, 1]) / slope[:, 1], min(limit, 0))
                upper = np.minimum((upperDefault - center[:, 1]) / slope[:, 1], max(limit, 0))
                gain = np.sum(slope * (wanted[:, None] - center) * weights, axis=-1) / np.sum(slope**2 * weights, axis=-1)
                gain = np.clip(gain, lower, upper)
                prediction = center + slope * gain[:, None]
                loss = np.sum((prediction - wanted[:, None])**2 * weights, axis=-1) + .0014 * rough**2 + .0012 * metal**2
                improved = (lower <= upper) & (loss < best)
                best[improved] = loss[improved]
                peaks[improved, 0] = gain[improved]
                peaks[improved, 1] = rough if roughTarget == .27 else 0
                peaks[improved, 2] = rough if roughTarget == .90 else 0
                peaks[improved, 3] = metal if metalTarget == .89 else 0
                peaks[improved, 4] = metal if metalTarget == .19 else 0

    supported = np.isfinite(best)
    rows, columns = BARREL_HIGHLIGHT_GRID
    cells = np.rint(u[glints][supported] * (rows - 1)).astype(int) * columns
    cells += np.rint(v[glints][supported] * (columns - 1)).astype(int)
    reliability = 1 + 1.5 * np.clip((target[supported] - 132) / 22, 0, 1)

    def Smooth(values):
        field = np.bincount(cells, weights=values, minlength=rows * columns).reshape(BARREL_HIGHLIGHT_GRID)
        return gaussian_filter(field, (.72, .76))

    support = Smooth(reliability)
    u, v = np.meshgrid(np.linspace(0, 1, rows), np.linspace(0, 1, columns), indexing="ij")
    x, y = BarrelPhotoCoordinates(barrel["source"]["projection"], barrel["footprint"]["uHalfSpan"], u, v)
    source = np.stack([SampleBilinear(channel, x, y) for channel in np.moveaxis(photo, -1, 0)], axis=-1) @ REGISTERED_LUMA
    confidence = np.clip(support / .42, 0, 1) * np.clip((u - .58) / .10, 0, 1) * np.clip((v - .56) / .12, 0, 1)
    blend = np.clip(np.clip((source - 127) / 24, 0, 1) * confidence * 1.14, 0, 1)
    resample = [u * (base.shape[0] - 1), v * (base.shape[1] - 1)]
    merged = {}
    for index, name in enumerate(BARREL_MATERIAL_CHANNELS):
        ordinary = map_coordinates(base[..., index], resample, order=1)
        highlight = Smooth(reliability * peaks[supported, index]) / np.maximum(.22, support)
        merged[name] = np.rint(1000 * (ordinary * (1 - blend) + highlight * blend)).astype(int).tolist()
    return merged


def SettleBarrelMaterialPeaks(photo, barrel, evidence):
    names = ("V45BarrelResolveDirect", "V45BarrelResolveDefault")
    u, v, inside, source, rendered, sample, hashes = ReadBarrelMaterialViews(photo, barrel, evidence, names)
    valid = inside & (u > .55) & (v > .53) & (source > 119) & (source < 232)
    if not np.any(valid):
        raise ValueError("The final barrel response views do not cover the photographed highlights")
    luminance = source[valid]
    current = np.log(rendered[valid] + 14)
    initial = np.log(luminance[:, None] + 14) - current
    baseSlope = np.clip((np.log(sample("FinalBaseTest", valid) + 14) - current) / .28, .15, 1.10)
    metalSlope = np.clip((np.log(sample("FinalMetalTest", valid) + 14) - current) / .26, -.65, .25)
    weights = np.array([.82, .18])
    headroom = np.maximum(initial[:, 1], 0) + .012
    fit = np.zeros((len(luminance), 2))
    best = np.sum(weights * initial**2, axis=-1)
    for metal in (0, .05, .10, .15, .20, .25):
        remaining = initial - metal * metalSlope
        base = np.sum(weights * baseSlope * remaining, axis=-1) / np.sum(weights * baseSlope**2, axis=-1)
        ceiling = np.minimum(.31, (headroom - metalSlope[:, 1] * metal) / baseSlope[:, 1])
        base = np.clip(base, 0, np.maximum(0, ceiling))
        residual = remaining - baseSlope * base[:, None]
        loss = np.sum(weights * residual**2, axis=-1) + .0009 * metal**2 + .0004 * base**2
        improved = (ceiling >= 0) & (initial[:, 0] > .013) & (loss < best) & (residual[:, 0] < initial[:, 0] - .005)
        best[improved] = loss[improved]
        fit[improved, 0] = base[improved]
        fit[improved, 1] = metal

    rows, columns = BARREL_HIGHLIGHT_GRID
    cells = np.rint(u[valid] * (rows - 1)).astype(int) * columns + np.rint(v[valid] * (columns - 1)).astype(int)
    reliability = 1 + 1.9 * np.clip((luminance - 129) / 26, 0, 1)

    def Smooth(values):
        table = np.bincount(cells, weights=values, minlength=rows * columns).reshape(BARREL_HIGHLIGHT_GRID)
        return gaussian_filter(table, (.66, .70))

    confidence = Smooth(reliability)
    u, v = np.meshgrid(np.linspace(0, 1, rows), np.linspace(0, 1, columns), indexing="ij")
    x, y = BarrelPhotoCoordinates(barrel["source"]["projection"], barrel["footprint"]["uHalfSpan"], u, v)
    cue = np.stack([SampleBilinear(channel, x, y) for channel in np.moveaxis(photo, -1, 0)], axis=-1) @ REGISTERED_LUMA
    patch = np.clip((cue - 119) / 25, 0, 1) * np.clip((u - .55) / .09, 0, 1) * np.clip((v - .53) / .10, 0, 1)
    result = {name: np.rint(1000 * Smooth(values * reliability) / np.maximum(confidence, .32) * patch).astype(int).tolist()
              for name, values in zip(("highlightBase", "highlightMetal"), fit.T)}
    return result, hashes


def BarrelMaterialCalibration(photo, barrel, evidence):
    names = ("V45BarrelStudyDirect", "V45BarrelStudyDefault")
    u, v, inside, source, rendered, read, hashes = ReadBarrelMaterialViews(photo, barrel, evidence, names)
    valid = inside & (source > 24) & (source < 240) & (np.min(rendered, axis=-1) > 22)
    if np.count_nonzero(valid) < 1000:
        raise ValueError("The barrel material views do not cover the photographed steel")
    rows, columns = BARREL_MATERIAL_GRID
    coordinates = np.stack((u[valid] * (rows - 1), v[valid] * (columns - 1)))
    frames = {}

    def Sample(name):
        if name not in frames:
            frames[name] = read(name, valid)
        return frames[name]

    ordinary = FitBarrelMaterialResponse(source[valid], rendered[valid], coordinates, Sample)
    peaks = RefineBarrelMaterialPeaks(photo, barrel, source[valid], rendered[valid], coordinates, Sample, ordinary)
    highlights, measured = SettleBarrelMaterialPeaks(photo, barrel, evidence)
    return {**BarrelCalibrationIdentity(barrel), "frameSha256": {**hashes, **measured}, **peaks, **highlights}


def BarrelStampDistances(photo, strokes):
    trace = Image.new("L", (photo.shape[1], photo.shape[0]))
    draw = ImageDraw.Draw(trace)
    for width, points in strokes:
        draw.line([tuple(point) for point in points], fill=255, width=width, joint="curve")
    return distance_transform_edt(np.asarray(trace) == 0)


def FitBarrelFacets(photo, barrel, evidence, distances, *, refine):
    prefix = "V49FacetSettle" if refine else "V49Brdf"
    names = tuple(prefix + view for view in ("Direct", "Default"))
    u, v, inside, original, renders, read, hashes = ReadBarrelMaterialViews(photo, barrel, evidence, names)
    startU, startV = (.53, .47) if refine else (.51, .39)
    tiltLimit, gainLimit, gainPenalty = (.84, .34, .070) if refine else (1, .51, .08)
    angle, projection = barrel["footprint"]["uHalfSpan"], barrel["source"]["projection"]
    x, y = BarrelPhotoCoordinates(projection, angle, u, v)
    valid = inside & (u > startU) & (v > startV) & (map_coordinates(distances, (y, x), order=1) >= 6)
    valid &= (original > (113 if refine else 28)) & (original < 232) & np.all(renders > 20, axis=-1)
    if np.count_nonzero(valid) <= 2500:
        raise ValueError("The response views do not cover the measured barrel steel")
    expected, baseline = original[valid], renders[valid]
    if np.max(np.abs(read("ProbeZero", valid) - baseline)) >= .30:
        raise ValueError("The zero-tilt response does not match the unmodified steel")

    residual = np.clip(np.log(expected[:, None] + 16) - np.log(baseline + 16), -.46, .46)
    tiltSlope, gainSlope = [.5 * (np.log(read(channel + "Plus", valid) + 16)
                                 - np.log(read(channel + "Minus", valid) + 16))
                           for channel in ("Across", "Base")]
    shape = (161, 109)
    cells = np.rint(u[valid] * (shape[0] - 1)).astype(int) * shape[1]
    cells += np.rint(v[valid] * (shape[1] - 1)).astype(int)
    confidence = .62 + .95 * np.clip((expected - 101) / 54, 0, 1)
    weights = confidence[:, None] * np.array([.65, .35] if refine else [.52, .48])

    def Smooth(signal):
        values = np.bincount(cells, weights=signal, minlength=np.prod(shape)).reshape(shape)
        return gaussian_filter(values, (.9, .94))

    support = Smooth(confidence)

    def Average(signal):
        return Smooth(np.sum(weights * signal, axis=1)) / np.maximum(support, .30)

    tiltPower = Average(tiltSlope**2) + .050**2
    gainPower = Average(gainSlope**2) + gainPenalty**2
    cross = Average(tiltSlope * gainSlope)
    tiltPull, gainPull = Average(tiltSlope * residual), Average(gainSlope * residual)
    gain = np.zeros(shape)
    # Fit both lamps together with bounded steps. The captures use tangent
    # slope +/-0.16 and linear base gain exp(+/-0.31).
    for _ in range(5):
        tilt = np.clip((tiltPull - cross * gain) / tiltPower, -tiltLimit, tiltLimit)
        gain = np.clip((gainPull - cross * tilt) / gainPower, -gainLimit, gainLimit)

    uu, vv = np.meshgrid(np.linspace(0, 1, shape[0]), np.linspace(0, 1, shape[1]), indexing="ij")
    x, y = BarrelPhotoCoordinates(projection, angle, uu, vv)
    radial = np.clip((uu - startU) / .088, 0, 1) * np.clip((.92 - uu) / .068, 0, 1)
    axial = np.clip((vv - startV) / .096, 0, 1) * np.clip((.91 - vv) / .064, 0, 1)
    clear = np.clip((map_coordinates(distances, (y, x), order=1) - 5) / 7, 0, 1)
    fade = radial * axial * clear * np.clip(support / .55, 0, 1)
    if refine:
        rgb = np.stack([SampleBilinear(channel, x, y) for channel in np.moveaxis(photo, -1, 0)], axis=-1)
        fade *= np.clip((rgb @ REGISTERED_LUMA - 111) / 24, 0, 1)
    return tuple(gaussian_filter(scale * field, (.65, .67)) * fade
                 for scale, field in ((.16, tilt), (.31, gain))), hashes


def WriteResponseFields(plate, identity, fields, hashes, *, scale=120000):
    # Pack the signed fields side by side without losing the small fitted changes.
    encoded = np.rint(32768 + scale * np.concatenate([field.T for field in fields], axis=1))
    if not np.all((encoded >= 0) & (encoded <= 65535)):
        raise ValueError(f"The fitted response exceeds the signed image range: {plate.name}")
    Image.fromarray(encoded.astype(np.uint16)).save(plate)
    return {**identity, "file": plate.name,
            "sha256": sha256(plate.read_bytes()).hexdigest(), "scale": scale, "frameSha256": hashes}


def BarrelFacetCalibration(photo, barrel, evidence):
    trace = barrel["stampTrace"]
    distances = BarrelStampDistances(photo, trace["strokes"] + trace["smallStrokes"])
    first, studyHashes = FitBarrelFacets(photo, barrel, evidence, distances, refine=False)
    remaining, resolveHashes = FitBarrelFacets(photo, barrel, evidence, distances, refine=True)
    resolved = [np.clip(old + .88 * delta, -bound, bound)
                for old, delta, bound in zip(first, remaining, (.205, .196))]
    return WriteResponseFields(BARREL_FACETS, BarrelCalibrationIdentity(barrel), resolved,
                               {**studyHashes, **resolveHashes})


def ResponseEquations(basis, residual, average, shape):
    pull = np.stack([average(direction * residual) for direction in basis], axis=-1)
    response = np.zeros((*shape, len(basis), len(basis)))
    for i, direction in enumerate(basis):
        for j in range(i + 1):
            response[..., i, j] = response[..., j, i] = average(direction * basis[j])
    return pull, response


def FitSignedResponse(pull, response, axes, iterations):
    fit = np.zeros_like(pull)
    # Treat the two measured directions independently. A direction may cross
    # a specular peak, and each material parameter can take only one sign.
    for _ in range(iterations):
        for axis, (_, _, bounds, penalty) in enumerate(axes):
            index = 2 * axis
            pair = slice(index, index + 2)
            fit[..., pair] = 0
            update = pull[..., pair] - np.einsum("...ij,...j->...i", response[..., pair, :], fit)
            curvature = np.stack([response[..., k, k] for k in range(index, index + 2)], axis=-1)
            curvature += penalty**2
            amount = np.clip(update / curvature, 0, bounds)
            improvement = amount * (update - .5 * curvature * amount)
            positive = improvement[..., 0] >= improvement[..., 1]
            fit[..., index] = amount[..., 0] * positive
            fit[..., index + 1] = amount[..., 1] * (~positive)
    return fit


def BarrelBandCalibration(photo, barrel, evidence):
    names = tuple("V50BandStudy" + light for light in ("Direct", "Default", "Soft"))
    u, v, inside, target, observed, sample, hashes = ReadBarrelMaterialViews(photo, barrel, evidence, names)
    trace = barrel["stampTrace"]
    distances = BarrelStampDistances(photo, trace["strokes"] + trace["smallStrokes"])
    angle, projection = barrel["footprint"]["uHalfSpan"], barrel["source"]["projection"]
    x, y = BarrelPhotoCoordinates(projection, angle, u, v)
    valid = inside & (u > .175) & (u < .661) & (v > .11) & (target > 25) & (target < 239)
    valid &= map_coordinates(distances, (y, x), order=1) >= 9
    baseline = observed[valid]
    if len(baseline) < 12000:
        raise ValueError("The response views do not cover the measured middle barrel band")
    if np.max(abs(sample("ProbeZero", valid) - baseline)) >= .30:
        raise ValueError("The baseline with zero response bias differs from the baked finish")

    responseAxes = (("Across", .16, .88, .052), ("Rough", .14, .98, .044), ("Base", .31, .56, .086))
    current = np.log(baseline + 16)
    expected = target[valid]
    residual = np.clip(np.log(expected[:, None] + 16) - current, -.53, .53)
    basis = [np.log(sample(axis + side, valid) + 16) - current
             for axis, *_ in responseAxes for side in ("Plus", "Minus")]
    reliability = .82 + .40 * np.clip((expected - 38) / 83, 0, 1)
    weights = reliability[:, None] * np.array([1 - .48 - .26, .48, .26])
    shape = (109, 81)
    cells = np.rint(u[valid] * (shape[0] - 1)).astype(int) * shape[1]
    cells += np.rint(v[valid] * (shape[1] - 1)).astype(int)

    def Smooth(signal):
        values = np.bincount(cells, weights=signal, minlength=np.prod(shape)).reshape(shape)
        return gaussian_filter(values, (1.37, 1.43))

    support = Smooth(reliability)

    def Average(signal):
        return Smooth(np.sum(weights * signal, axis=1)) / np.maximum(support, .45)

    pull, response = ResponseEquations(basis, residual, Average, shape)
    fit = FitSignedResponse(pull, response, responseAxes, 8)

    uu, vv = np.meshgrid(np.linspace(0, 1, shape[0]), np.linspace(0, 1, shape[1]), indexing="ij")
    x, y = BarrelPhotoCoordinates(projection, angle, uu, vv)
    coverage = np.clip((uu - .175) / .090, 0, 1) * np.clip((.661 - uu) / .085, 0, 1)
    coverage *= np.clip((vv - .11) / .075, 0, 1) * np.clip((.92 - vv) / .068, 0, 1)
    coverage *= np.clip((map_coordinates(distances, (y, x), order=1) - 7) / 12, 0, 1)
    coverage *= np.clip(support / .7, 0, 1)
    tilt, roughness, gain = [gaussian_filter(step * (fit[..., 2*i] - fit[..., 2*i+1]), (.70, .75)) * coverage
                             for i, (_, step, _, _) in enumerate(responseAxes)]
    return WriteResponseFields(BARREL_BAND, BarrelCalibrationIdentity(barrel), (tilt, gain, roughness), hashes)


def BarrelGrainCalibration(photo, barrel, evidence):
    names = ("V51ReferenceRigDirect", "V51DefaultStudy")
    u, v, inside, wanted, observed, read, hashes = ReadBarrelMaterialViews(photo, barrel, evidence, names)
    inside &= (wanted > 21) & (wanted < 235)
    shape = (239, 159)
    index = np.rint(u[inside] * (shape[0] - 1)).astype(int) * shape[1]
    index += np.rint(v[inside] * (shape[1] - 1)).astype(int)
    counts = np.bincount(index, minlength=np.prod(shape)).reshape(shape).astype(float)
    fineScale, broadScale = (.82, .86), (3.50, 4.25)
    fineSupport = gaussian_filter(counts, fineScale)
    broadSupport = gaussian_filter(counts, broadScale)
    if np.count_nonzero(fineSupport > 1.4) < 15000:
        raise ValueError("The response views do not resolve the photographed steel grain")

    def Deposit(luma):
        return np.bincount(index, weights=np.log(luma + 18), minlength=np.prod(shape)).reshape(shape)

    def Band(sums):
        return (gaussian_filter(sums, fineScale) / np.maximum(fineSupport, .01) -
                gaussian_filter(sums, broadScale) / np.maximum(broadSupport, .01))

    expected = Band(Deposit(wanted[inside]))
    close, default = [expected - Band(Deposit(values)) for values in observed[inside].T]
    plus, minus = (read("Base" + side, inside).T for side in ("Plus", "Minus"))
    closeSlope, defaultSlope = [np.clip(gaussian_filter(Deposit(a) - Deposit(b), fineScale) /
                                      (.62 * np.maximum(fineSupport, .01)), .21, .94)
                               for a, b in zip(plus, minus)]
    agree = (np.sign(close) == np.sign(default)) & (fineSupport > 1.4)
    uu, vv = np.meshgrid(np.linspace(0, 1, shape[0]), np.linspace(0, 1, shape[1]), indexing="ij")
    x, y = BarrelPhotoCoordinates(barrel["source"]["projection"], barrel["footprint"]["uHalfSpan"], uu, vv)
    trace = barrel["stampTrace"]
    distances = BarrelStampDistances(photo, trace["strokes"] + trace["smallStrokes"])
    clearance = np.clip((map_coordinates(distances, (y, x), order=1) - 12) / 8, 0, 1)
    confidence = np.clip(np.minimum(abs(close), abs(default)) / .045, 0, 1) * agree * clearance
    coverage = np.clip((uu - .08) / .045, 0, 1) * np.clip((.92 - uu) / .045, 0, 1)
    coverage *= np.clip((vv - .09) / .042, 0, 1) * np.clip((.91 - vv) / .042, 0, 1)
    residual = .55 * close + .45 * default
    slope = .55 * closeSlope + .45 * defaultSlope
    gain = gaussian_filter(np.clip(residual / slope, -.195, .195) * confidence, (.44, .46))
    # The broad field follows the earlier steel calibration. Fit only the
    # small contrast differences that recur in both measured lighting setups.
    gain = 1.15 * (gain - gaussian_filter(gain, broadScale)) * coverage * clearance
    # Preserve the earlier calibration on the photographed exposed-steel highlights.
    photoLuma = SampleBilinear(photo @ REGISTERED_LUMA, x, y)
    brightSteel = np.clip((uu - .63) / .06, 0, 1) * np.clip((vv - .62) / .07, 0, 1)
    brightSteel *= np.clip((photoLuma - 119) / 25, 0, 1)
    gain *= 1 - brightSteel * (gain < 0)
    return WriteResponseFields(BARREL_GRAIN, BarrelCalibrationIdentity(barrel), (gain,), hashes)


def RegisteredBarrelMarks(photo, barrel, folder, distances):
    u, v, inside, reference, render, hashes = RegisteredBarrelPhotoFrame(photo, barrel, folder)
    x, y = BarrelPhotoCoordinates(barrel["source"]["projection"], barrel["footprint"]["uHalfSpan"], u, v)
    distance = map_coordinates(distances, (y, x), order=1)
    steel = inside & (distance >= 8)
    support = gaussian_filter(steel.astype(float), 6.5)
    valid = inside & (support > .12) & (distance < 11)
    luma = render @ REGISTERED_LUMA

    def SurroundingSteel(signal):
        return gaussian_filter(signal * steel, 6.5)[valid] / support[valid]

    def Contrast(signal, surrounding):
        return (signal - surrounding) / np.maximum(surrounding, 28)

    wanted = reference @ REGISTERED_LUMA
    background = SurroundingSteel(luma)
    residual = Contrast(wanted[valid], SurroundingSteel(wanted)) - Contrast(luma[valid], background)
    trials = [ReadRegisteredLuma(folder, name + ".png", hashes)[valid] for name in ("MarkBaseLight", "MarkBaseDark")]
    # The sweeps measure the material response at the marks. Use the original
    # steel baseline even though the trial varies the color across the atlas.
    effects = (np.column_stack(trials) - luma[valid, None]) / np.maximum(background[:, None], 28)
    return u[valid], v[valid], distance[valid], residual, effects, hashes


def FitBarrelMarkGain(photo, barrel, folders, distances):
    first, second = [RegisteredBarrelMarks(photo, barrel, folder, distances) for folder in folders]
    u, v, distance, _, _, _ = first
    if len(u) < 1000 or not np.array_equal(u, second[0]) or not np.array_equal(v, second[1]):
        raise ValueError("The barrel mark response frames must show the same registered strokes")
    weight = np.sqrt([.55, .45])
    residual = np.clip(np.column_stack([first[3], second[3]]), -.7, .7) * weight
    bright, dark = np.stack([first[4], second[4]], axis=1).transpose(2, 0, 1)
    positive = np.sum(residual * (bright - dark) * weight, axis=1) >= 0
    derivative = np.where(positive[:, None], bright, -dark) * weight
    response = np.sum(derivative * residual, axis=1) / (np.sum(derivative * derivative, axis=1) + .044 ** 2)
    response = np.where(positive, np.clip(response, 0, 1.2), np.clip(response, -1.2, 0))
    # The trial frames vary linear base color by exp(+/-0.60). Fade the
    # correction back into the surrounding steel while keeping the narrow rim.
    gain = .60 * response * np.clip((10 - distance) / 6, 0, 1)
    width, height = 584, 320
    cells = np.rint(v * (height - 1)).astype(int) * width + np.rint(u * (width - 1)).astype(int)
    coverage = np.bincount(cells, minlength=height * width).reshape(height, width).astype(float)
    values = np.bincount(cells, gain, minlength=height * width).reshape(height, width)
    smooth = (.94, .86)
    field = gaussian_filter(values, smooth, mode="constant") / np.maximum(
        gaussian_filter(coverage, smooth, mode="constant"), .16)
    return field, {folder.name: row[-1] for folder, row in zip(folders, (first, second))}


def BarrelMarkCalibration(photo, barrel, evidence, *, small=False):
    if small:
        strokes = barrel["stampTrace"]["smallStrokes"]
        prefix, plate = "V47Stamp", BARREL_SMALL_MARKS
        firstScale, firstLimits, settle, limits = 108, (3, 252), .91, (3, 252)
    else:
        strokes = barrel["stampTrace"]["strokes"]
        prefix, plate = "V46Mark", BARREL_MARKS
        firstScale, firstLimits, settle, limits = 150, (0, 255), .88, (4, 252)
    distances = BarrelStampDistances(photo, strokes)
    study = [evidence / (prefix + "Study" + view) for view in ("Direct", "Default")]
    settled = [evidence / (prefix + "Resolve" + view) for view in ("Direct", "Default")]
    first, studyHashes = FitBarrelMarkGain(photo, barrel, study, distances)
    remaining, settledHashes = FitBarrelMarkGain(photo, barrel, settled, distances)
    # The second capture was made with the first field quantized and baked.
    first = (np.clip(np.rint(128 + firstScale * 1.2 * first), *firstLimits) - 128) / firstScale
    gain = first + settle * remaining
    gainScale = 108
    Image.fromarray(np.clip(np.rint(128 + gainScale * gain), *limits).astype(np.uint8)).save(plate)
    return {**BarrelCalibrationIdentity(barrel), "file": plate.name,
            "sha256": sha256(plate.read_bytes()).hexdigest(), "gainScale": gainScale,
            "frameSha256": {**studyHashes, **settledHashes}}


def BarrelFinish(folder, previous, *, evidence=None, responseEvidence=None, finishEvidence=None,
                 materialEvidence=None, markEvidence=None, smallMarkEvidence=None, facetEvidence=None,
                 bandEvidence=None, grainEvidence=None):
    image, source = Photo(folder, 7)
    projection = [509, 540, 23, 400]
    center, radius, first, last = projection
    halfSpan = .154
    angles = np.linspace(-halfSpan, halfSpan, 21)
    xs = center + radius * np.sin(2 * np.pi * angles)
    ys = np.linspace(first, last, 19)
    samples = np.array([[Sample(image, x, y, radius=9) for y in ys] for x in xs])
    source["sampleBounds"] = [int(xs[0]), int(ys[0]), int(xs[-1]), int(ys[-1])]
    source["projection"] = projection
    result = FinishMap(samples, source, {"uCenter": .398, "uHalfSpan": halfSpan, "vRange": [.722, .849]})
    result.update(PatinaMap(samples))
    lightness = samples @ LUMA
    low, transition = np.percentile(lightness, (13, 39))
    shadow = np.clip((transition - lightness) / max(transition - low, 10), 0, 1)
    result["shadowCoverage"] = np.rint(100 * shadow).astype(int).tolist()
    result["stampTrace"] = {
        "bounds": [130, 165, 852, 363], "imageCenter": center, "imageRadius": radius,
        "imageYForVRange": [first, last], "axialCenterImageY": 223, "axialScale": 1,
        "strokes": [
            [5, [[168, 181], [159, 194], [147, 221], [155, 223], [180, 223]]],
            [4, [[169, 182], [170, 205], [168, 238]]],
            [6, [[324, 192], [308, 212], [291, 237], [293, 242], [309, 242], [335, 238]]],
            [5, [[324, 192], [325, 213], [323, 239], [323, 254]]],
            [4, [[510, 207], [498, 210], [489, 221], [485, 235], [487, 251], [494, 265],
                 [505, 271], [519, 269], [529, 260], [534, 245], [533, 229], [527, 216], [519, 208], [510, 207]]],
            [5, [[645, 210], [651, 200], [662, 194], [677, 193], [688, 198], [692, 206],
                 [688, 217], [676, 230], [661, 245], [646, 258], [665, 259], [687, 257]]],
            [4, [[787, 193], [795, 185], [809, 183], [819, 188], [824, 196], [823, 205],
                 [815, 213], [800, 216], [811, 219], [817, 228], [817, 238], [811, 247],
                 [802, 251], [792, 250], [787, 246], [785, 238]]],
            [3, [[318, 314], [319, 333], [315, 347]]],
            [3, [[307, 333], [326, 334], [333, 332]]],
            [3, [[671, 303], [658, 307], [650, 321], [651, 334], [659, 342], [672, 346],
                 [684, 343], [693, 334], [695, 321], [687, 309], [678, 304], [671, 303]]],
            [2, [[660, 317], [677, 317], [664, 331], [678, 332]]],
        ],
        "smallStrokes": [
            [4, [[162, 307], [169, 308], [170, 321], [172, 340], [165, 339], [163, 322], [162, 307]]],
            [4, [[163, 324], [171, 325]]],
            [3, [[176, 309], [182, 309], [181, 316], [179, 321]]],
            [3, [[175, 328], [183, 328], [187, 332], [187, 340], [178, 340], [176, 337], [175, 328]]],
            [4, [[783, 302], [778, 305], [775, 311], [775, 321], [777, 328], [780, 331], [785, 331]]],
            [3, [[784, 302], [789, 304], [791, 310], [791, 318], [788, 326]]],
            [3, [[780, 311], [784, 312], [786, 317], [781, 321], [781, 325]]],
        ],
    }
    result["detail"] = BarrelDetail(image, projection, halfSpan, result["stampTrace"])
    result["exposedSteelIslands"] = BarrelSteelIslands(image, projection, halfSpan)
    identity = BarrelCalibrationIdentity(result)
    for name, frames, measure in (("registeredCalibration", evidence, BarrelCalibration),
                                  ("surfaceResponseCalibration", responseEvidence, BarrelResponseCalibration),
                                  ("finishCalibration", finishEvidence, BarrelFinishCalibration),
                                  ("materialCalibration", materialEvidence, BarrelMaterialCalibration),
                                  ("markCalibration", markEvidence, BarrelMarkCalibration),
                                  ("facetCalibration", facetEvidence, BarrelFacetCalibration),
                                  ("bandCalibration", bandEvidence, BarrelBandCalibration),
                                  ("grainCalibration", grainEvidence, BarrelGrainCalibration)):
        prior = previous.get(name)
        if frames is not None:
            result[name] = measure(image, result, frames)
        elif prior is not None and all(prior.get(key) == value for key, value in identity.items()):
            result[name] = prior
    priorSmall = previous.get("smallMarkCalibration")
    if smallMarkEvidence is not None:
        result["smallMarkCalibration"] = BarrelMarkCalibration(image, result, smallMarkEvidence, small=True)
    elif priorSmall is not None and all(priorSmall.get(key) == value for key, value in identity.items()):
        result["smallMarkCalibration"] = priorSmall
    return result


def CollarPhotoCoordinates(footprint, source, u, v):
    center, radius = source["rasterX"]
    xs = center + radius * np.sin(2 * np.pi * footprint["uHalfSpan"] * (2 * u - 1))
    xStations, firstRows = np.asarray(source["sampleRails"]).T
    first = np.interp(xs, xStations, firstRows)
    return xs, first + (source["lastY"] - first) * v


def FitGripResponse(part, image, coordinates, evidence):
    grip = part == "Direct"
    hashes = {}
    hi, lo = (ReadRegisteredRgb(evidence, f"{part}_Uv{bits}.png", hashes) for bits in ("Hi", "Lo"))
    visible = (hi[..., 2] == 255) & (lo[..., 2] == 255)
    rows, columns = np.nonzero(visible)
    if len(rows) < 400:
        raise ValueError(f"No registered photo area in the {part} material response")
    crop = np.s_[rows.min() - 2:rows.max() + 3, columns.min() - 2:columns.max() + 3]
    u, v = np.moveaxis((256 * hi[crop][..., :2] + lo[crop][..., :2]) / 65535, -1, 0)
    visible = visible[crop]
    x, y = coordinates(u, v)
    # Keep the historical color response separate from the narrow normal-map detail.
    rgb = np.stack([map_coordinates(channel, (y, x), order=1)
                    for channel in np.moveaxis(image.astype(float), -1, 0)], axis=-1)
    photo = rgb @ REGISTERED_LUMA
    lights = ("Default", "Matched", "Gallery4") if grip else ("Default", "Matched")
    weights = np.array([.50, .29, .21] if grip else [.58, .42])
    shape = (51, 48) if grip else (69, 31)
    sigma = (2.35, 2.65) if grip else (2.2, 2.4)
    radius = 5.5 if grip else 2.8
    axes = (("Base", .24, (1.65, 1.80), .021), ("Tilt", .16, (1.04, 1.04), .024),
            ("Rough", .12, (1.1, 1.1), .025))
    support = gaussian_filter(visible.astype(float), radius)
    selected = visible & (support > .77) & (photo > 27) & (photo < 248)
    if selected.sum() < (5000 if grip else 550):
        raise ValueError(f"Insufficient registered samples for the {part} material response")

    def SmoothImage(field):
        return (gaussian_filter(field * visible, radius) / np.maximum(support, .01))[selected]

    def Read(name):
        return SmoothImage(ReadRegisteredLuma(evidence, f"{part}_{name}.png", hashes)[crop])

    initial = np.log(np.column_stack([Read(light) for light in lights]) + 19)
    target = np.log(SmoothImage(photo) + 19)[:, None]
    residual = np.clip(target - initial, -.53, .47)
    if grip:
        # Keep the response stable when the strip light crosses to the other side.
        residual[:, 2] *= .22
    basis = [np.log(np.column_stack([Read(light + axis + side) for light in lights]) + 19) - initial
             for axis, *_ in axes for side in ("Plus", "Minus")]
    bins = np.rint(u[selected] * (shape[0] - 1)).astype(int) * shape[1]
    bins += np.rint(v[selected] * (shape[1] - 1)).astype(int)

    def Smooth(values):
        histogram = np.bincount(bins, weights=values, minlength=np.prod(shape)).reshape(shape)
        return gaussian_filter(histogram, sigma)

    count = Smooth(np.ones(selected.sum()))

    def Average(values):
        return Smooth(values @ weights) / np.maximum(count, .4)

    pull, response = ResponseEquations(basis, residual, Average, shape)
    fit = FitSignedResponse(pull, response, axes, 10)
    uu, vv = np.meshgrid(np.linspace(0, 1, shape[0]), np.linspace(0, 1, shape[1]), indexing="ij")
    fade = np.clip(count / 1.1, 0, 1)
    fade *= np.clip(np.minimum(uu, 1 - uu) / (.15 if grip else .13), 0, 1)
    fade *= np.clip(np.minimum(vv, 1 - vv) / .16, 0, 1)
    fade = fade**2 * (3 - 2 * fade)
    fields = [gaussian_filter((fit[..., 2*i] - fit[..., 2*i+1]) * step, (.85, 1.05)) * fade
              for i, (_, step, _, _) in enumerate(axes)]
    return fields, {evidence.name: hashes}


def RestoreGripResponse(record, prior, identity, evidence, path, part, image, coordinates):
    if evidence is not None:
        fields, hashes = FitGripResponse(part, image, coordinates, evidence)
        record["responseCalibration"] = WriteResponseFields(path, identity, fields, hashes, scale=68000)
    elif (calibration := prior.get("responseCalibration")) is not None:
        if all(calibration.get(key) == value for key, value in identity.items()):
            record["responseCalibration"] = calibration


def CollarFinish(folder, prior=None, evidence=None):
    image, source = Photo(folder, 7)
    # Image rows remain below the curved dark seam and inside the visible ring.
    # The short axial footprint is the portion visible in this close-up.
    rails = [[56, 411], [130, 430], [224, 443], [350, 454], [509, 457],
             [670, 452], [810, 441], [960, 418]]
    rasterX = [509, 540]
    lastY = 580
    footprint = {"uCenter": .398, "uHalfSpan": .154, "vRange": [.18, .61]}
    xStations, firstRows = np.asarray(rails).T
    angles = np.linspace(-footprint["uHalfSpan"], footprint["uHalfSpan"], 27)
    xs = rasterX[0] + rasterX[1] * np.sin(2 * np.pi * angles)
    top = np.interp(xs, xStations, firstRows)
    samples = np.array([[Sample(image, x, y, radius=5) for y in np.linspace(first, lastY, 15)]
                        for x, first in zip(xs, top)])
    source.update({"rasterX": rasterX, "sampleRails": rails, "lastY": lastY})
    result = FinishMap(samples, source, footprint)
    result.update(PatinaMap(samples))

    us, vs = np.meshgrid(np.linspace(0, 1, 352), np.linspace(0, 1, 160))
    xs, ys = CollarPhotoCoordinates(footprint, source, us, vs)
    result["detail"] = WriteDetailPlate(image, xs, ys, COLLAR_DETAIL)
    identity = {"photoSha256": source["sha256"], "rasterX": rasterX,
                "sampleRails": rails, "lastY": lastY, "footprint": footprint}
    RestoreGripResponse(result, prior or {}, identity, evidence, COLLAR_RESPONSE, "Collar", image,
                        lambda u, v: CollarPhotoCoordinates(footprint, source, u, v))
    return result


def StemDetail(image, source):
    left, top, right, bottom = source["sampleBounds"]
    rail = np.asarray(source["lowerSampleEdge"])
    columns = np.arange(left, right + 2)
    rows = np.arange(top, bottom + 2)[:, None]
    lower = np.interp(columns, rail[:, 0], rail[:, 1])[None, :]
    # Continue the steel pixels to the edge of the filter. This keeps the
    # lettering and shadow below the sampled strip out of the detail plate.
    sampleY = np.clip(rows, top + 1, np.floor(lower - 1)).astype(int)
    padded = image[sampleY, columns[None, :]]
    tone, warmth, lightness = PhotoResiduals(padded, envelopeRadius=4.8)
    margin = np.minimum(rows - top, lower - rows)
    confidence = np.clip(margin / 4.5, 0, 1)
    # Fade the photograph's plane transition out of the scratch layer.
    confidence *= np.clip((np.abs(columns - 669) - 8) / 11, 0, 1)[None, :]
    confidence *= np.clip((245 - lightness) / 30, 0, 1)
    u, v = np.meshgrid(np.linspace(0, 1, 80), np.linspace(0, 1, 1152))
    x = left + (right - left) * v
    y = top + (1 - u) * (np.interp(x, rail[:, 0], rail[:, 1]) - top)
    return SaveDetailPlate(tone, warmth, confidence, x - left, y - top, STEM_DETAIL, halfSize=False)


def StemResponseIdentity(stem):
    source = stem["source"]
    return {"photoSha256": source["sha256"], "sampleBounds": source["sampleBounds"],
            "lowerSampleEdge": source["lowerSampleEdge"], "footprint": stem["footprint"]}


def FitStemResponse(photo, stem, evidence, *, refine):
    if refine:
        names = ("V55StemResolveDefault", "V55StemResolveFill", "V55StemResolveSoft")
        axes = (("Across", .16, (.42, .40), .054), ("Along", .16, (.40, .40), .054),
                ("Rough", .14, (.37, .38), .056), ("Base", .31, (.36, .45), .069))
        lightWeights = np.array([.32, .58, .10])
        residualCeiling = [.26, .24, .17]
    else:
        names = ("V55StemFreshDefault", "V55StemFreshFill", "V55StemSoftBRDF")
        axes = (("Across", .16, (.72, .88), .049), ("Along", .16, (.69, .59), .051),
                ("Rough", .14, (.59, .66), .051), ("Base", .31, (.59, .53), .067))
        lightWeights = np.array([.38, .45, .17])
        residualCeiling = [.42, .38, .26]
    folders = [evidence / name for name in names]
    frames = [ReadRegisteredFrame(folder) for folder in folders]
    u, v = frames[0][:2]
    if any(not (np.array_equal(u, row[0]) and np.array_equal(v, row[1])) for row in frames[1:]):
        raise ValueError("The stem response views must use the same registered camera")

    source = stem["source"]
    left, top, right, _ = source["sampleBounds"]
    rail = np.asarray(source["lowerSampleEdge"])
    x = left + (right - left) * v
    y = top + (1 - u) * (np.interp(x, rail[:, 0], rail[:, 1]) - top)
    target = SampleBilinear(photo, x, y)
    render = np.stack([row[3] @ REGISTERED_LUMA for row in frames], axis=-1)
    visible = np.logical_and.reduce([row[2] for row in frames])
    interior = binary_erosion(visible & (u > .07) & (u < .93) & (v > .08) & (v < .92), iterations=3)
    selected = interior & (target > 33) & (target < 232) & np.all(render > 25, axis=-1)
    if selected.sum() < 7500:
        raise ValueError("The response frames do not cover the photographed stem surface")
    hashes = {folder.name: row[-1] for row, folder in zip(frames, folders)}

    def Read(name):
        return np.column_stack([ReadRegisteredLuma(folder, name + ".png", hashes[folder.name])[selected]
                                for folder in folders])

    if np.max(abs(Read("ProbeZero") - render[selected])) > .3:
        raise ValueError("The zero-response views do not reproduce the initial stem finish")
    baseline = np.log(render[selected] + 17)
    residual = np.clip(np.log(target[selected, None] + 17) - baseline, -.40, residualCeiling)
    basis = [np.log(Read(axis + side) + 17) - baseline
             for axis, *_ in axes for side in ("Plus", "Minus")]
    shape = (51, 131)
    bins = np.rint(u[selected] * (shape[0] - 1)).astype(int) * shape[1]
    bins += np.rint(v[selected] * (shape[1] - 1)).astype(int)

    def Smooth(signal):
        field = np.bincount(bins, weights=signal, minlength=np.prod(shape)).reshape(shape)
        return gaussian_filter(field, (1.17, 1.26))

    support = Smooth(np.ones(selected.sum()))

    def Average(values):
        return Smooth(np.sum(lightWeights * values, axis=1)) / np.maximum(support, .32)

    pull, response = ResponseEquations(basis, residual, Average, shape)
    fit = FitSignedResponse(pull, response, axes, 9)
    uu, vv = np.meshgrid(np.linspace(0, 1, shape[0]), np.linspace(0, 1, shape[1]), indexing="ij")
    coverage = np.clip(np.minimum(uu, 1 - uu) / .125, 0, 1) * np.clip(np.minimum(vv, 1 - vv) / .13, 0, 1)
    coverage *= np.clip(support / .8, 0, 1)
    fields = {axis: gaussian_filter((fit[..., 2*i] - fit[..., 2*i+1]) * step, (.64, .70)) * coverage
              for i, (axis, step, _, _) in enumerate(axes)}
    return fields, hashes


def StemResponseCalibration(image, stem, evidence):
    photo = image @ REGISTERED_LUMA
    initial, studyHashes = FitStemResponse(photo, stem, evidence, refine=False)
    remaining, resolveHashes = FitStemResponse(photo, stem, evidence, refine=True)
    limits = {"Across": (-.19, .18), "Along": (-.145, .163), "Rough": (-.141, .137), "Base": (-.233, .245)}
    fields = [np.clip(initial[name] + .88 * remaining[name], *limits[name])
              for name in ("Base", "Across", "Along", "Rough")]
    return WriteResponseFields(STEM_RESPONSE, StemResponseIdentity(stem), fields,
                               {**studyHashes, **resolveHashes})


def StemFinish(folder, previous=None, *, responseEvidence=None):
    image, source = Photo(folder, 4)
    # Registration in the inspection scene puts the lower side of the rubbed
    # rectangle at the smaller U. Stay above the stamped strip to its right.
    xs = np.linspace(170, 1444, 61)
    lower = np.interp(xs, [170, 658, 730, 1444], [473, 473, 443, 443])
    samples = np.array([[Sample(image, x, y, radius=3) for x, y in zip(xs, 405 + t * (lower - 405))]
                        for t in np.linspace(1, 0, 19)])
    source["sampleBounds"] = [170, 405, 1444, 473]
    source["lowerSampleEdge"] = [[170, 473], [658, 473], [730, 443], [1444, 443]]
    footprint = {"uCenter": .549, "uHalfSpan": .043, "vRange": [.078, .934]}
    field = FinishMap(samples, source, footprint)
    lightness = samples @ LUMA
    surround = np.median(lightness[:, (xs >= 748) & (xs <= 1360)], axis=1, keepdims=True)
    exposed = np.clip((lightness - surround - 12) / 39, 0, 1)
    edge = np.clip((xs - 184) / 22, 0, 1) * np.clip((674 - xs) / 20, 0, 1)
    field["rubbedCoverage"] = np.rint(100 * exposed * edge).astype(int).tolist()
    field["detail"] = StemDetail(image, source)
    if responseEvidence is not None:
        field["responseCalibration"] = StemResponseCalibration(image, field, responseEvidence)
    elif previous and (calibration := previous.get("responseCalibration")):
        if all(calibration.get(key) == value for key, value in StemResponseIdentity(field).items()):
            field["responseCalibration"] = calibration
    return field


def ShoeDetail(image, strips):
    guide, left, right = np.asarray(strips, dtype=float).T
    x0, y0 = int(left.min()), int(guide[0])
    x1, y1 = int(right.max()) + 2, int(guide[-1]) + 2
    rows = np.arange(y0, y1)
    lo = np.interp(rows, guide, left)
    hi = np.interp(rows, guide, right)
    columns = np.arange(x0, x1)[None, :]
    sourceX = np.clip(columns, np.ceil(lo[:, None] + 1), np.floor(hi[:, None] - 1)).astype(int)
    # Extend the nearest steel pixels before blurring so the background
    # and curled edge do not get interpreted as wear on the face.
    padded = image[rows[:, None], sourceX]
    tone, warmth, lightness = PhotoResiduals(padded, envelopeRadius=4.65)
    margin = np.minimum(columns - lo[:, None], hi[:, None] - columns)
    confidence = np.clip(margin / 5, 0, 1) * np.clip((hi - lo - 19) / 26, 0, 1)[:, None]
    confidence *= np.clip((245 - lightness) / 30, 0, 1)
    u, v = np.meshgrid(np.linspace(0, 1, 336), np.linspace(0, 1, 152))
    y = guide[0] + (guide[-1] - guide[0]) * u
    a = np.interp(y, guide, left)
    b = np.interp(y, guide, right)
    x = b + v * (a - b)
    return SaveDetailPlate(tone, warmth, confidence, x - x0, y - y0, SADDLE_DETAIL, halfSize=False)


def SaddleCalibrationIdentity(saddle):
    source = saddle["source"]
    return {"photoSha256": source["sha256"], "sampleStrips": source["sampleStrips"],
            "footprint": saddle["footprint"]}


def SaddleViewResponse(photo, saddle, folder, weight, transition, axes, shape):
    u, v, visible, rgb, hashes = ReadRegisteredFrame(folder)
    rows, left, right = np.asarray(saddle["source"]["sampleStrips"]).T
    y = rows[0] + (rows[-1] - rows[0]) * u
    lo, hi = (np.interp(y, rows, edge) for edge in (left, right))
    target = SampleBilinear(photo, hi + v * (lo - hi), y)
    current = rgb @ REGISTERED_LUMA
    interior = binary_erosion(visible & (u > .08) & (u < .92) & (v > .09) & (v < .91), iterations=3)
    selected = interior & (target > 29) & (target < 228)
    if selected.sum() < 16000:
        raise ValueError(f"The response frame does not cover the photographed saddle face: {folder.name}")

    def Sample(name):
        return ReadRegisteredLuma(folder, name + ".png", hashes)[selected]

    if np.max(abs(Sample("ProbeZero") - current[selected])) > .3:
        raise ValueError(f"The zero-response frame differs from the saddle finish: {folder.name}")
    desired = target[selected]
    observed = np.log(current[selected] + 18)
    residual = np.clip(np.log(desired + 18) - observed, -.46, .64)
    basis = [np.log(Sample(axis + side) + 18) - observed
             for axis, *_ in axes for side in ("Plus", "Minus")]
    bins = np.rint(u[selected] * (shape[0] - 1)).astype(int) * shape[1]
    bins += np.rint(v[selected] * (shape[1] - 1)).astype(int)
    emphasis = weight - transition * np.clip((95 - desired) / 31, 0, 1)

    def Smooth(values):
        field = np.bincount(bins, weights=values, minlength=np.prod(shape)).reshape(shape)
        return gaussian_filter(field, (1.42, 1.34))

    support = Smooth(np.ones_like(desired))

    def Average(values):
        return Smooth(values * emphasis) / np.maximum(support, .45)

    pull, response = ResponseEquations(basis, residual, Average, shape)
    return pull, response, support, hashes


def FitSaddleResponse(photo, saddle, evidence, *, refine):
    if refine:
        setups = (("V52AngularResponseDefault", .18, .13), ("V52AngularResponseFill", .35, -.05),
                  ("V52AngularResponseRake", .47, -.08))
        axes = (("Along", .16, (.51, .52), .051), ("Rough", .14, (.58, .59), .046),
                ("Across", .16, (.53, .53), .063), ("Base", .31, (.35, .50), .052))
    else:
        setups = (("V52SaddleFreshDefault", .36, .18), ("V52SaddleFreshFill", .30, -.08),
                  ("V52SaddleRakeBRDF", .34, -.10))
        axes = (("Along", .16, (1.16, .82), .043), ("Rough", .14, (.72, 1.02), .040),
                ("Across", .16, (.57, .57), .058), ("Base", .31, (1.04, .54), .054))
    shape = (71, 61)
    views = [SaddleViewResponse(photo, saddle, evidence / name, weight, transition, axes, shape)
             for name, weight, transition in setups]
    # Normalize each view before combining their measured responses in the same UV cells.
    pull = np.sum([row[0] for row in views], axis=0)
    response = np.sum([row[1] for row in views], axis=0)
    fit = FitSignedResponse(pull, response, axes, 10)

    u, v = np.meshgrid(np.linspace(0, 1, shape[0]), np.linspace(0, 1, shape[1]), indexing="ij")
    coverage = np.clip(np.minimum(u, 1 - u) / .134, 0, 1)
    coverage *= np.clip(np.minimum(v, 1 - v) / .138, 0, 1)
    coverage *= np.clip(np.minimum.reduce([row[2] for row in views]) / .80, 0, 1)
    fields = {name: gaussian_filter(step * (fit[..., 2*i] - fit[..., 2*i+1]), (.9, .82)) * coverage
              for i, (name, step, _, _) in enumerate(axes)}
    return fields, {view[0]: row[3] for view, row in zip(setups, views)}


def SaddleResponseCalibration(image, saddle, evidence):
    photo = image @ REGISTERED_LUMA
    first, initialHashes = FitSaddleResponse(photo, saddle, evidence, refine=False)
    remaining, resolvedHashes = FitSaddleResponse(photo, saddle, evidence, refine=True)
    limits = {"Along": (-.15, .218), "Across": (-.138, .138), "Rough": (-.167, .112), "Base": (-.19, .327)}
    fields = [np.clip(first[name] + .92 * remaining[name], *limits[name])
              for name in ("Base", "Across", "Along", "Rough")]
    return WriteResponseFields(SADDLE_RESPONSE, SaddleCalibrationIdentity(saddle), fields,
                               {**initialHashes, **resolvedHashes}, scale=95000)


def ShoeFinish(folder, previous=None, *, responseEvidence=None):
    image, source = Photo(folder, 1)
    # On the photographed convex face U increases downward and V toward the
    # left. End each strip inside the steel, clear of the dark return and stem.
    strips = [[457, 1458, 1468], [490, 1438, 1473], [530, 1419, 1493],
              [563, 1402, 1515], [603, 1388, 1491], [643, 1375, 1480],
              [680, 1356, 1456], [724, 1352, 1428], [760, 1363, 1409]]
    yz, left, right = np.asarray(strips).T
    ys = np.linspace(yz[0], yz[-1], 37)
    lo = np.interp(ys, yz, left)
    hi = np.interp(ys, yz, right)
    samples = np.array([[Sample(image, x, y, radius=3) for x in np.linspace(rightX, leftX, 19)]
                        for y, leftX, rightX in zip(ys, lo, hi)])
    source["sampleStrips"] = strips
    footprint = {"uCenter": .500, "uHalfSpan": .383, "vRange": [.14, .585]}
    field = FinishMap(samples, source, footprint, planar=True)
    lightness = samples @ LUMA
    warmth = (samples[..., 0] - samples[..., 2]) / np.maximum(lightness, 25)
    # Chroma distinguishes brown oxidation from a dark unlit blue-gray spot.
    residue = np.clip((warmth - .035) / .255, 0, 1)
    field["oxideCoverage"] = np.rint(100 * residue).astype(int).tolist()
    field["detail"] = ShoeDetail(image, strips)
    if responseEvidence is not None:
        field["responseCalibration"] = SaddleResponseCalibration(image, field, responseEvidence)
    elif previous and (calibration := previous.get("responseCalibration")):
        if all(calibration.get(key) == value for key, value in SaddleCalibrationIdentity(field).items()):
            field["responseCalibration"] = calibration
    return field


def SleeveCalibrationIdentity(sleeve):
    return {"photoSha256": sleeve["source"]["sha256"],
            "sampleRails": sleeve["source"]["sampleRails"], "footprint": sleeve["footprint"]}


def RegisteredSleevePhotoFrame(photo, sleeve, folder):
    u, v, visible, render, hashes = ReadRegisteredFrame(folder)
    footprint = sleeve["footprint"]
    center, half = footprint["uCenter"], footprint["uHalfSpan"]
    first, last = footprint["vRange"]
    u0, u1 = center - half, center + half
    stations, top, bottom = np.asarray(sleeve["source"]["sampleRails"]).T
    x = stations[0] + (stations[-1] - stations[0]) * np.clip((v - first) / (last - first), 0, 1)
    lo, hi = (np.interp(x, stations, rail) for rail in (top, bottom))
    y = lo + (hi - lo) * np.clip((u - u0) / (u1 - u0), 0, 1)
    source = np.stack([SampleBilinear(channel, x, y) for channel in np.moveaxis(photo, -1, 0)], axis=-1)
    inside = visible & (u > u0) & (u < u1) & (v > first) & (v < last)
    s, t = (u - center + half) / (2 * half), (v - first) / (last - first)
    interior = binary_erosion(inside, iterations=3) & (s > 0) & (s < 1) & (t > 0) & (t < 1)
    return s, t, interior, source, render, hashes


def RegisteredSleeveView(photo, sleeve, folder, shape):
    s, t, interior, colors, render, hashes = RegisteredSleevePhotoFrame(photo, sleeve, folder)
    source, observed = colors @ REGISTERED_LUMA, render @ REGISTERED_LUMA
    valid = interior & (source >= 13) & (source <= 120) & (observed >= 10)
    if np.count_nonzero(valid) < 1200:
        raise ValueError(f"The registered sleeve patch is missing from {folder}")

    rows, columns = shape
    cells = np.floor(s[valid] * rows).astype(int) * columns + np.floor(t[valid] * columns).astype(int)
    residual = np.log((source[valid] + 9) / (observed[valid] + 9))
    counts = np.bincount(cells, minlength=rows * columns).reshape(shape).astype(float)
    values = np.bincount(cells, weights=residual, minlength=rows * columns).reshape(shape)

    def Average(sigma):
        weights = gaussian_filter(counts, sigma)
        return gaussian_filter(values, sigma) / np.maximum(weights, .18), weights

    local, support = Average((.82, .95))
    broad, _ = Average((4.5, 8.5))
    return local - broad, support, hashes


def SleeveCalibration(photo, sleeve, evidence):
    # Sample near the native resolution of the overview photo so interpolated grain does not drive the fit.
    views = ("V39SleeveCurrent", "V39SleeveDefaultControl")
    shape = (49, 185)
    museum, default = [RegisteredSleeveView(photo, sleeve, evidence / view, shape) for view in views]
    museumContrast, museumSupport, museumHashes = museum
    defaultContrast, defaultSupport, defaultHashes = default
    support = np.clip(np.minimum(museumSupport, defaultSupport) / 1.5, 0, 1)
    agreement = np.exp(-.5 * ((museumContrast - defaultContrast) / .105)**2)
    contrast = np.clip(.67 * museumContrast + .33 * defaultContrast, -.28, .28) * support * agreement
    return {**SleeveCalibrationIdentity(sleeve), "frameSha256": dict(zip(views, (museumHashes, defaultHashes))),
            "contrast": np.rint(contrast * 1000).astype(int).tolist()}


def FitSleeveResponse(photo, sleeve, evidence, shape):
    names = ("V43SleeveStudyneutral", "V43SleeveStudydefault")
    folders = tuple(evidence / name for name in names)
    s, t, inside, colors, direct, directHashes = RegisteredSleevePhotoFrame(photo, sleeve, folders[0])
    otherS, otherT, defaultInside, _, default, defaultHashes = RegisteredSleevePhotoFrame(photo, sleeve, folders[1])
    if not (np.array_equal(s, otherS) and np.array_equal(t, otherT)):
        raise ValueError("The sleeve response captures must use the same camera and surface coordinates")
    frameHashes = (directHashes, defaultHashes)
    target = colors @ REGISTERED_LUMA
    original = np.minimum(direct @ REGISTERED_LUMA, default @ REGISTERED_LUMA)
    valid = inside & defaultInside & (target > 13) & (target < 120) & (original > 7)
    if np.count_nonzero(valid) < 1200:
        raise ValueError("The sleeve response captures do not cover the photographed steel")

    rows, columns = shape
    cells = np.rint(s[valid] * (rows - 1)).astype(int) * columns + np.rint(t[valid] * (columns - 1)).astype(int)
    counts = np.bincount(cells, minlength=rows * columns).reshape(shape).astype(float)
    sigma = (1.55, 2.7)
    support = gaussian_filter(counts, sigma)
    wanted = np.log(target[valid] + 9)
    neutralWeight = .85
    weights = np.array([neutralWeight, 1 - neutralWeight])
    chosen = np.zeros((*shape, 4))
    lowest = np.full(shape, np.inf)

    def Smooth(samples):
        field = np.bincount(cells, weights=samples, minlength=rows * columns).reshape(shape)
        return gaussian_filter(field, sigma) / np.maximum(support, .30)

    def Sample(name):
        return np.stack([ReadRegisteredLuma(folder, name, hashes)[valid]
                         for folder, hashes in zip(folders, frameHashes)], axis=-1)

    # Search the measured finishes and compensate their base color in both lights.
    # The penalty limits changes where several finishes reproduce the photo equally well.
    for i, metal in enumerate((0, .34, .70)):
        for j, (roughTarget, rough) in enumerate(((.40, 0), (.40, .35), (.40, .62), (.92, .49))):
            observed = np.log(Sample(f"Sweep_{i}_{j}.png") + 9)
            gradient = np.clip((np.log(Sample(f"Base_{i}_{j}.png") + 9) - observed) / .36, .14, .95)
            error = wanted[:, None] - observed
            residual = np.stack([Smooth(error[:, slot]) for slot in range(2)], axis=-1)
            sensors = np.stack([Smooth(gradient[:, slot]) for slot in range(2)], axis=-1)
            gain = (residual * sensors * weights).sum(axis=-1) / np.maximum((sensors**2 * weights).sum(axis=-1), .03)
            gain = np.clip(gain, -.40, .52)
            prediction = residual - sensors * gain[..., None]
            loss = (prediction**2 * weights).sum(axis=-1) + .0012 * (metal**2 + rough**2)
            improved = loss < lowest
            lowest[improved] = loss[improved]
            chosen[..., 0][improved] = gain[improved]
            chosen[..., 1][improved] = metal
            chosen[..., 2][improved] = rough if roughTarget == .40 else 0
            chosen[..., 3][improved] = rough if roughTarget == .92 else 0

    coverage = np.clip(support / .95, 0, 1)
    fields = gaussian_filter(chosen * coverage[..., None], (.73, 1.24, 0))
    maps = {name: np.rint(fields[..., index] * 1000).astype(int).tolist()
            for index, name in enumerate(("base", "metal", "polish", "matte"))}
    return maps, dict(zip(names, frameHashes))


def RegisteredSleeveRefinement(photo, sleeve, folder, shape):
    s, t, inside, colors, render, hashes = RegisteredSleevePhotoFrame(photo, sleeve, folder)
    wanted, observed = colors @ REGISTERED_LUMA, render @ REGISTERED_LUMA
    valid = inside & (wanted > 13) & (wanted < 120) & (observed > 9)
    if np.count_nonzero(valid) < 1200:
        raise ValueError(f"The sleeve refinement capture is missing from {folder}")
    rows, columns = shape
    cells = np.rint(s[valid] * (rows - 1)).astype(int) * columns + np.rint(t[valid] * (columns - 1)).astype(int)
    counts = np.bincount(cells, minlength=rows * columns).reshape(shape).astype(float)

    def Sample(values, sigma):
        support = gaussian_filter(counts, sigma)
        total = np.bincount(cells, weights=values, minlength=rows * columns).reshape(shape)
        return gaussian_filter(total, sigma) / np.maximum(support, .22), support

    residual = np.log((wanted[valid] + 9) / (observed[valid] + 9))
    local, support = Sample(residual, (.65, .77))
    broad, _ = Sample(residual, (3.85, 7.1))
    color = colors[valid] / wanted[valid, None] - render[valid] / observed[valid, None]
    chroma = np.stack([Sample(signal, (1.08, 1.55))[0] for signal in color.T], axis=-1)
    return local - broad, chroma, support, hashes


def SleeveResponseCalibration(photo, sleeve, evidence):
    shape = (49, 185)
    response, responseHashes = FitSleeveResponse(photo, sleeve, evidence, shape)
    names = ("V43RegionalNeutral", "V43RegionalDefault", "V43RegionalRake")
    direct, default, oblique = [RegisteredSleeveRefinement(photo, sleeve, evidence / name, shape) for name in names]
    coverage = np.clip(np.minimum.reduce((direct[2], default[2], oblique[2])) / .90, 0, 1)
    # Restore the fine contrast after the roughness and metalness adjustments.
    agreement = np.exp(-.5 * ((direct[0] - oblique[0]) / .15)**2)
    contrast = np.clip(.55 * direct[0] + .18 * default[0] + .27 * oblique[0], -.21, .21) * coverage * agreement
    chroma = np.clip(.55 * direct[1] + .20 * default[1] + .25 * oblique[1], -.18, .18)
    chroma *= coverage[..., None] * np.exp(-.5 * ((direct[1] - oblique[1]) / .125)**2)
    chroma -= (chroma @ REGISTERED_LUMA)[..., None]
    color = {name: np.rint(chroma[..., index] * 1000).astype(int).tolist()
             for index, name in enumerate(("red", "green", "blue"))}
    hashes = dict(zip(names, (direct[3], default[3], oblique[3])))
    return {**SleeveCalibrationIdentity(sleeve), "frameSha256": {**responseHashes, **hashes}, **response,
            "contrast": np.rint(contrast * 1000).astype(int).tolist(), **color}


def SleeveHorizonCalibration(photo, sleeve, evidence):
    names = ("V44RuntimeSleeveNeutral", "V44RuntimeSleeveDefault", "V44RuntimeSleeveRake")
    direct, default, oblique = [RegisteredSleeveRefinement(photo, sleeve, evidence / name, (49, 185)) for name in names]
    support = np.clip(np.minimum.reduce((direct[2], default[2], oblique[2])) / .91, 0, 1)
    agreement = np.exp(-.5 * ((direct[0] - oblique[0]) / .14)**2)
    contrast = np.clip(.51 * direct[0] + .32 * default[0] + .17 * oblique[0], -.16, .16) * support * agreement
    chroma = np.clip(.45 * direct[1] + .40 * default[1] + .15 * oblique[1], -.13, .13)
    chroma *= support[..., None] * np.exp(-.5 * ((direct[1] - default[1]) / .082)**2)
    chroma -= (chroma @ REGISTERED_LUMA)[..., None]
    color = {name: np.rint(chroma[..., index] * 1000).astype(int).tolist()
             for index, name in enumerate(("red", "green", "blue"))}
    return {**SleeveCalibrationIdentity(sleeve), "frameSha256": dict(zip(names, (direct[3], default[3], oblique[3]))),
            "contrast": np.rint(contrast * 1000).astype(int).tolist(), **color}


def SleeveFinish(folder, previous, *, evidence=None, responseEvidence=None, horizonEvidence=None):
    image, source = Photo(folder, 1)
    rails = [[1149, 593, 642], [1164, 593, 648], [1183, 593, 640],
             [1260, 594, 639], [1334, 594, 639], [1354, 595, 641]]
    source["sampleRails"] = rails
    photoX, top, bottom = np.asarray(rails).T
    xs = np.linspace(photoX[0], photoX[-1], 37)
    low, high = (np.interp(xs, photoX, rail) for rail in (top, bottom))
    samples = np.array([[Sample(image, x, y, radius=3) for x, y in zip(xs, low + t * (high - low))]
                        for t in np.linspace(0, 1, 17)])
    footprint = {"uCenter": .375, "uHalfSpan": .166, "vRange": [.026, .984]}
    field = FinishMap(samples, source, footprint)
    lightness = samples @ LUMA
    warmth = (samples[..., 0] - samples[..., 2]) / np.maximum(lightness, 25)
    oxide = np.clip((warmth - .185) / .32, 0, 1)
    oxide *= np.clip((samples[..., 0] - samples[..., 1] - 4) / 21, 0, 1)
    field["oxideCoverage"] = np.rint(100 * oxide ** 1.7).astype(int).tolist()

    # The short contact patch needs denser color samples than the wider arc.
    endRange = [.043, .174]
    first, last = footprint["vRange"]
    endX = photoX[0] + (photoX[-1] - photoX[0]) * (np.linspace(*endRange, 23) - first) / (last - first)
    endTop, endBottom = (np.interp(endX, photoX, rail) for rail in (top, bottom))
    endSamples = np.array([[Sample(image, x, y, radius=1) for x, y in zip(endX, endTop + t * (endBottom - endTop))]
                           for t in np.linspace(0, 1, 25)])
    endLightness = endSamples @ LUMA
    endWarmth = (endSamples[..., 0] - endSamples[..., 2]) / np.maximum(endLightness, 25)
    field["endPatina"] = {
        "footprint": {**footprint, "vRange": endRange},
        "darkPatinaCoverage": np.rint(100 * np.clip((59 - endLightness) / 32, 0, 1)).astype(int).tolist(),
        "oxideChroma": np.rint(100 * np.clip((endWarmth - .32) / .64, 0, 1)).astype(int).tolist(),
        "exposedSteelCoverage": np.rint(100 * np.clip((.37 - endWarmth) / .34, 0, 1)).astype(int).tolist(),
    }

    tone, warmth, lightness = PhotoResiduals(image, envelopeRadius=5.4)
    columns = np.arange(image.shape[1])
    rows = np.arange(image.shape[0])[:, None]
    upper, lower = (np.interp(columns, photoX, rail) for rail in (top, bottom))
    clearance = np.minimum(rows - upper, lower - rows)
    confidence = np.clip((clearance - 1.5) / 7.5, 0, 1)
    confidence *= np.clip((lightness - 17) / 16, 0, 1) * np.clip((233 - lightness) / 31, 0, 1)
    # Remove reflection streaks shared across the photographed arc before
    # transferring the irregular oxide and fine scratches.
    tone -= .80 * np.median(tone[605:635], axis=0)
    us, vs = np.meshgrid(np.linspace(0, 1, 88), np.linspace(0, 1, 352))
    x = photoX[0] + vs * (photoX[-1] - photoX[0])
    upper, lower = (np.interp(x, photoX, rail) for rail in (top, bottom))
    field["detail"] = SaveDetailPlate(tone, warmth, confidence, x, upper + us * (lower - upper),
                                     SLEEVE_DETAIL, halfSize=False)
    identity = SleeveCalibrationIdentity(field)
    for name, frames, measure in (("registeredCalibration", evidence, SleeveCalibration),
                                  ("responseCalibration", responseEvidence, SleeveResponseCalibration),
                                  ("horizonCalibration", horizonEvidence, SleeveHorizonCalibration)):
        prior = previous.get(name)
        if frames is not None:
            field[name] = measure(image, field, frames)
        elif prior is not None and all(prior.get(key) == value for key, value in identity.items()):
            field[name] = prior
    return field


def NeckDetail(image, field):
    footprint = field["footprint"]
    trace = field["stampTrace"]
    v0, v1 = footprint["vRange"]
    y0, y1 = trace["imageYForVRange"]
    pivot = v0 + (trace["axialCenterImageY"] - y0) * (v1 - v0) / (y1 - y0)
    # Use the rectified stamp registration for the surrounding metal as well.
    vRange = [pivot + (v - pivot) * trace["axialScale"] for v in (v0, v1)]
    u, v = np.meshgrid(np.linspace(-footprint["uHalfSpan"], footprint["uHalfSpan"], 512),
                       np.linspace(0, 1, 304))
    xs = trace["imageCenter"] + trace["imageRadius"] * np.sin(2 * np.pi * u)
    ys = y0 + (y1 - y0) * v

    tone, warmth, lightness = PhotoResiduals(image, envelopeRadius=8.0)
    valid = Image.new("L", (image.shape[1], image.shape[0]), 255)
    draw = ImageDraw.Draw(valid)
    for width, points in trace["strokes"]:
        draw.line([tuple(point) for point in points], fill=0, width=width + 25, joint="curve")
    confidence = np.asarray(valid.filter(ImageFilter.GaussianBlur(6)), dtype=np.float32) / 255
    confidence *= np.clip((lightness - 24) / 23, 0, 1) * np.clip((245 - lightness) / 32, 0, 1)
    detail = SaveDetailPlate(tone, warmth, confidence, xs, ys, NECK_DETAIL)
    return {**detail, "footprint": {**footprint, "vRange": vRange}}


def NeckChromaIdentity(neck):
    trace = neck["stampTrace"]
    return {"photoSha256": neck["source"]["sha256"],
            "projection": [trace["imageCenter"], trace["imageRadius"], *trace["imageYForVRange"]],
            "footprint": neck["detail"]["footprint"]}


def NeckPhotoCoordinates(neck, u, v):
    trace = neck["stampTrace"]
    angle = 2 * np.pi * neck["footprint"]["uHalfSpan"] * (2 * u - 1)
    first, last = trace["imageYForVRange"]
    return trace["imageCenter"] + trace["imageRadius"] * np.sin(angle), first + (last - first) * v


def NeckChromaCalibration(photo, neck, evidence):
    names = ("V53NeckStudyDefault", "V53NeckStudyMuseum")
    folders = [evidence / name for name in names]
    frames = [ReadRegisteredFrame(folder) for folder in folders]
    u, v = frames[0][:2]
    if not (np.array_equal(u, frames[1][0]) and np.array_equal(v, frames[1][1])):
        raise ValueError("The neck color views must use the same registered camera")
    identity = NeckChromaIdentity(neck)
    x, y = NeckPhotoCoordinates(neck, u, v)
    target = np.stack([SampleBilinear(channel, x, y) for channel in np.moveaxis(photo, -1, 0)], axis=-1)
    distances = BarrelStampDistances(photo, neck["stampTrace"]["strokes"])
    clearance = map_coordinates(distances, (y, x), order=1)
    interior = frames[0][2] & frames[1][2] & (u > .075) & (u < .925) & (v > .074) & (v < .926)
    interior = binary_erosion(interior, iterations=3)
    lightness = target @ REGISTERED_LUMA
    selected = interior & (clearance > 18) & (lightness > 31) & (lightness < 214)
    if selected.sum() < 6000:
        raise ValueError("The color response views do not cover the photographed neck surface")

    def Features(rgb):
        gray = rgb @ REGISTERED_LUMA
        chroma = rgb[..., (0, 2)] / np.maximum(gray[..., None], 27)
        return np.concatenate((chroma, (1.50 * np.log(gray + 16))[..., None]), axis=-1)

    observed = np.stack([Features(frame[3][selected]) for frame in frames], axis=1)
    residual = Features(target[selected])[:, None, :] - observed
    # Use the measured lightness response to keep the luminance close to the
    # current finish while fitting the color errors shared by both fixtures.
    residual[..., 2] *= .16
    firstResidual, secondResidual = residual[:, :, :2].transpose(1, 0, 2)
    agreement = np.sum(firstResidual * secondResidual, axis=-1) / np.maximum(
        np.linalg.norm(firstResidual, axis=-1) * np.linalg.norm(secondResidual, axis=-1), .001)
    confidence = .40 + .60 * np.clip(agreement, 0, 1)
    hashes = {name: frame[4] for name, frame in zip(names, frames)}

    def Trial(name):
        return np.stack([Features(ReadRegisteredRgb(folder, name + ".png", hashes[folder.name])[selected])
                         for folder in folders], axis=1)

    axes = (("RedBlue", (.32, -.020, -.34), (.88, .75), .049),
            ("Green", (-.15, .19, -.16), (.67, .61), .059),
            ("Gain", (.24, .24, .24), (.50, .48), .079))
    basis = [Trial(axis + sign) - observed for axis, *_ in axes for sign in ("Plus", "Minus")]
    weights = confidence[:, None, None] * np.array([.43, .57])[None, :, None]
    shape = (101, 83)
    bins = np.rint(u[selected] * (shape[0] - 1)).astype(int) * shape[1]
    bins += np.rint(v[selected] * (shape[1] - 1)).astype(int)

    def Smooth(values):
        field = np.bincount(bins, weights=values, minlength=np.prod(shape)).reshape(shape)
        return gaussian_filter(field, (1.12, 1.15))

    support = Smooth(confidence)

    def Average(values):
        return Smooth(np.sum(values * weights, axis=(1, 2))) / np.maximum(support, .36)

    pull, response = ResponseEquations(basis, residual, Average, shape)
    fit = FitSignedResponse(pull, response, axes, 9)
    uu, vv = np.meshgrid(np.linspace(0, 1, shape[0]), np.linspace(0, 1, shape[1]), indexing="ij")
    x, y = NeckPhotoCoordinates(neck, uu, vv)
    fade = np.clip((map_coordinates(distances, (y, x), order=1) - 15) / 18, 0, 1)
    fade *= np.clip(np.minimum(uu, 1 - uu) / .12, 0, 1) * np.clip(np.minimum(vv, 1 - vv) / .12, 0, 1)
    fade *= np.clip(support / .71, 0, 1)
    gains = np.zeros((*shape, 3))
    for i, (_, vector, _, _) in enumerate(axes):
        amount = gaussian_filter(fit[..., 2*i] - fit[..., 2*i+1], (.84, .88)) * fade
        gains += amount[..., None] * vector
    fields = np.moveaxis(.82 * np.clip(gains, -.31, .34), -1, 0)
    return WriteResponseFields(NECK_CHROMA, identity, fields, hashes, scale=110000)


def NeckMarkContrast(photo, neck, distances, folder):
    u, v, visible, rgb, hashes = ReadRegisteredFrame(folder)
    x, y = NeckPhotoCoordinates(neck, u, v)
    target = SampleBilinear(photo, x, y)
    render = rgb @ REGISTERED_LUMA
    distance = map_coordinates(distances, (y, x), order=1)
    inside = binary_erosion(visible & (u > .05) & (u < .95) & (v > .07) & (v < .93), iterations=3)
    steel = inside & (distance > 9)
    support = gaussian_filter(steel.astype(float), (8, 8))
    selected = inside & (support > .075) & (target > 24) & (render > 18)

    def Surrounding(signal):
        return gaussian_filter(signal * steel, (8, 8)) / np.maximum(support, .04)

    backgrounds = [Surrounding(signal) for signal in (target, render)]
    contrast = [(signal - background) / np.maximum(background, 30)
                for signal, background in zip((target, render), backgrounds)]
    return u, v, selected, distance, contrast, render, backgrounds[1], hashes


def FitNeckMarks(photo, neck, distances, folders):
    a, b = [NeckMarkContrast(photo, neck, distances, folder) for folder in folders]
    u, v, _, distance = a[:4]
    if not (np.array_equal(u, b[0]) and np.array_equal(v, b[1])):
        raise ValueError("The neck mark views must use the same registered camera")
    selected = a[2] & b[2] & (distance < 12)
    if selected.sum() < 900:
        raise ValueError("The render does not cover the photographed marks")
    residual = np.stack([(row[4][0] - row[4][1])[selected] for row in (a, b)], axis=-1)
    effects = []
    for folder, row in zip(folders, (a, b)):
        changes = [ReadRegisteredLuma(folder, "Gain" + side + ".png", row[-1]) for side in ("Plus", "Minus")]
        effects.append(np.column_stack([(change - row[5])[selected] / np.maximum(row[6][selected], 30)
                                        for change in changes]))
    positive, negative = np.stack(effects, axis=1).transpose(2, 0, 1)
    weights = np.array([.46, .54])
    brighter = np.sum(weights * residual * (positive - negative), axis=-1) >= 0
    slope = np.where(brighter[:, None], positive, -negative) / .24
    gain = np.sum(weights * slope * np.clip(residual, -.62, .62), axis=-1)
    gain /= np.sum(weights * slope**2, axis=-1) + .11**2
    gain = np.where(brighter, np.clip(gain, 0, .57), np.clip(gain, -.57, 0))
    gain *= np.clip((12 - distance[selected]) / 7, 0, 1)
    shape = (301, 193)
    bins = np.rint(u[selected] * (shape[0] - 1)).astype(int) * shape[1]
    bins += np.rint(v[selected] * (shape[1] - 1)).astype(int)

    def Smooth(signal):
        field = np.bincount(bins, weights=signal, minlength=np.prod(shape)).reshape(shape)
        return gaussian_filter(field, (1.00, .86), mode="constant")

    field = Smooth(gain) / np.maximum(Smooth(np.ones_like(gain)), .26)
    return field, {folder.name: row[-1] for folder, row in zip(folders, (a, b))}


def NeckMarkCalibration(image, neck, evidence):
    distances = BarrelStampDistances(image, neck["stampTrace"]["strokes"])
    photo = image @ REGISTERED_LUMA
    study = [evidence / ("V54NeckMarkStudy" + view) for view in ("Default", "Museum")]
    resolved = [evidence / ("V54NeckMarkResolve" + view) for view in ("Default", "Museum")]
    first, studyHashes = FitNeckMarks(photo, neck, distances, study)
    remaining, resolveHashes = FitNeckMarks(photo, neck, distances, resolved)
    field = np.clip(first + .90 * remaining, -.99, .99)
    return WriteResponseFields(NECK_MARKS, NeckChromaIdentity(neck), (field,),
                               {**studyHashes, **resolveHashes}, scale=30000)


def NeckFinish(folder, previous=None, *, chromaEvidence=None, markEvidence=None):
    image, source = Photo(folder, 6)
    angles = np.linspace(-.132, .132, 23)
    imageCenter, imageRadius = 510, 431
    xs = imageCenter + imageRadius * np.sin(2 * np.pi * angles)
    ys = np.linspace(468, 186, 21)
    samples = np.array([[Sample(image, x, y, radius=8) for y in ys] for x in xs])
    source["sampleBounds"] = [int(xs[0]), int(ys[-1]), int(xs[-1]), int(ys[0])]
    field = FinishMap(samples, source, {"uCenter": .642, "uHalfSpan": .132, "vRange": [.23, .89]})
    lightness = samples @ LUMA
    warmth = (samples[..., 0] - samples[..., 2]) / np.maximum(lightness, 25)
    field["oxideCoverage"] = np.rint(100 * np.clip((warmth - .15) / .29, 0, 1)).astype(int).tolist()
    # The five strokes use the photographed outline and its uneven baseline.
    # All coordinates are pixels in the local reference photograph.
    field["stampTrace"] = {
        "bounds": [208, 286, 729, 413],
        "imageCenter": imageCenter, "imageRadius": imageRadius,
        "imageYForVRange": [int(ys[0]), int(ys[-1])],
        "axialCenterImageY": 346,
        "axialScale": .447,
        "strokes": [
            [8, [[251, 296], [241, 311], [231, 331], [222, 351], [243, 351], [275, 349]]],
            [7, [[251, 299], [255, 320], [259, 346], [260, 370]]],
            [8, [[366, 304], [353, 319], [340, 341], [327, 360], [357, 360], [388, 359]]],
            [7, [[366, 306], [366, 332], [365, 358], [365, 383]]],
            [8, [[460, 310], [443, 312], [431, 322], [425, 341], [425, 363],
                 [431, 381], [444, 393], [462, 396], [478, 392], [491, 379], [497, 359],
                 [496, 339], [490, 323], [478, 313], [460, 310]]],
            [8, [[543, 328], [550, 316], [563, 308], [581, 307], [597, 311], [609, 320],
                 [613, 333], [607, 347], [592, 357], [574, 368], [557, 378],
                 [542, 390], [565, 390], [589, 389], [617, 389]]],
            [7, [[654, 324], [663, 313], [676, 307], [690, 306], [704, 310], [712, 321],
                 [712, 333], [701, 342], [685, 348], [667, 351]]],
            [8, [[686, 348], [703, 350], [713, 358], [716, 370], [711, 381], [700, 389],
                 [687, 393], [672, 392], [658, 386], [652, 377]]],
        ],
    }
    field["detail"] = NeckDetail(image, field)
    identity = NeckChromaIdentity(field)
    for name, sourceEvidence, measure in (("chromaCalibration", chromaEvidence, NeckChromaCalibration),
                                          ("markCalibration", markEvidence, NeckMarkCalibration)):
        calibration = (previous or {}).get(name)
        if sourceEvidence is not None:
            field[name] = measure(image, field, sourceEvidence)
        elif calibration and all(calibration.get(key) == value for key, value in identity.items()):
            field[name] = calibration
    return field


def BlendTabDetail(encoded, photos, toneScale, warmthScale):
    tone, warmth, coverage = np.asarray(encoded, dtype=np.float32).transpose(2, 0, 1)
    confidence = coverage / 255

    def LocalAverage(values, sigma):
        weighted = gaussian_filter(values * confidence, sigma, mode="nearest")
        weights = gaussian_filter(confidence, sigma, mode="nearest")
        return weighted / np.maximum(weights, .03)

    mediumBands, chromaBands = [], []
    for pixels in photos:
        lightness = pixels @ LUMA
        chroma = (pixels[..., 0] - pixels[..., 2]) / np.maximum(lightness, 25)
        surrounding = LocalAverage(lightness, (16, 10))
        medium = LocalAverage(lightness, (3.4, 2.25))
        mediumBands.append((medium - surrounding) / np.maximum(surrounding, 35))
        chromaBands.append(LocalAverage(chroma, (3.4, 2.25)) - LocalAverage(chroma, (16, 10)))

    # Strong lighting changes between photographs have less influence on the wear layer.
    agreement = np.clip(1 - np.abs(mediumBands[0] - mediumBands[1]) / .24, .25, 1)
    alternateShare = .59
    blend = .48 * agreement
    tone += toneScale * blend * ((1 - alternateShare) * mediumBands[0] + alternateShare * mediumBands[1])
    warmth += warmthScale * .28 * blend * ((1 - alternateShare) * chromaBands[0] + alternateShare * chromaBands[1])
    return np.rint(np.clip(np.stack((tone, warmth, coverage), axis=-1), 0, 255)).astype(np.uint8)


def TabDetail(image, number, uAnchors, strips, alternate=None):
    radius = 5.8 if number == 5 else 4.6
    tone, warmth, lightness = PhotoResiduals(image, envelopeRadius=radius)
    columns = np.arange(image.shape[1])
    rows = np.arange(image.shape[0])[:, None]
    photoX, first, last = np.asarray(strips).T
    edgeA, edgeB = (np.interp(columns, photoX, edge) for edge in (first, last))
    clearance = np.minimum(rows - np.minimum(edgeA, edgeB), np.maximum(edgeA, edgeB) - rows)
    confidence = np.clip((clearance - radius) / (radius + 1), 0, 1)
    confidence *= np.clip((lightness - 22) / 22, 0, 1) * np.clip((246 - lightness) / 30, 0, 1)
    uu, vv = np.meshgrid(np.linspace(uAnchors[0], uAnchors[-1], 480), np.linspace(0, 1, 144))
    xs, start, end = (np.interp(uu, uAnchors, values) for values in (photoX, first, last))
    ys = start + vv * (end - start)
    adjustment = None
    if alternate is not None:
        projected = np.stack((xs, ys, np.ones_like(xs)), axis=-1) @ np.asarray(TAB_FRONT_PAIR_PROJECTION).T
        pairedX, pairedY = (projected[..., :2] / projected[..., 2:3]).transpose(2, 0, 1)
        samples = tuple(np.stack([SampleBilinear(channel, x, y) for channel in np.moveaxis(photo, -1, 0)], axis=-1)
                        for photo, x, y in ((image, xs, ys), (alternate, pairedX, pairedY)))

        def Adjust(encoded, toneScale, warmthScale):
            return BlendTabDetail(encoded, samples, toneScale, warmthScale)

        adjustment = Adjust

    name = "Tab" if number == 5 else "TabBack"
    path = RECORD.with_name(f"Texture_Type89Launcher{name}Detail.png")
    return SaveDetailPlate(tone, warmth, confidence, xs, ys, path, halfSize=False, adjustment=adjustment)


def TabResponseIdentity(tab):
    source = tab["source"]
    peer = source["pairedPhoto"]
    return {"photoSha256": source["sha256"], "pairedPhotoSha256": peer["sha256"],
            "projection": peer["projectionFromPrimary"], "sampleStrips": source["sampleStrips"],
            "outlineUV": tab["outlineUV"], "footprint": tab["footprint"]}


def RegisteredTabFace(tab, photos, folder):
    u, v, visible, rgb, hashes = ReadRegisteredFrame(folder)
    anchors, lower, upper = np.asarray(tab["outlineUV"]).T
    realU = anchors[0] + u * (anchors[-1] - anchors[0])
    bottom, top = (np.interp(realU, anchors, side) for side in (lower, upper))
    span = (v - bottom) / (top - bottom)
    x, begin, end = (np.interp(realU, anchors, column) for column in np.asarray(tab["source"]["sampleStrips"]).T)
    y = begin + np.clip(span, 0, 1) * (end - begin)
    transform = np.asarray(tab["source"]["pairedPhoto"]["projectionFromPrimary"])
    projected = np.stack((x, y, np.ones_like(x)), axis=-1) @ transform.T
    px, py = (projected[..., :2] / projected[..., 2:3]).transpose(2, 0, 1)
    target = [SampleBilinear(photos[0], x, y), SampleBilinear(photos[1], px, py)]
    gray = rgb @ REGISTERED_LUMA
    region = visible & (u > .10) & (u < .92) & (span > .12) & (span < .88)
    region = binary_erosion(region, iterations=2)
    for luma in target:
        region &= (luma > 27) & (luma < 234)
    region &= gray > 23
    return u, span, region, target, gray, hashes


def FitTabGrain(tab, photos, evidence):
    folders = [evidence / name for name in ("V56TabStudyDefault", "V56TabStudyFill")]
    a, b = [RegisteredTabFace(tab, photos, folder) for folder in folders]
    u, span, _, target = a[:4]
    if not (np.array_equal(u, b[0]) and np.array_equal(span, b[1])):
        raise ValueError("The tab detail views must share registered surface coordinates")
    keep = a[2] & b[2]
    shape = (181, 89)
    bins = np.rint(u[keep] * (shape[0] - 1)).astype(int) * shape[1]
    bins += np.rint(span[keep] * (shape[1] - 1)).astype(int)
    count = np.bincount(bins, minlength=np.prod(shape)).reshape(shape).astype(float)
    detailScale, backgroundScale = (.67, .99), (3.6, 4.5)
    detail = gaussian_filter(count, detailScale)
    background = gaussian_filter(count, backgroundScale)
    if np.count_nonzero(detail > .61) < 4300:
        raise ValueError("The two photographs do not resolve the visible tab detail")

    def Deposit(luma):
        return np.bincount(bins, weights=np.log(luma[keep] + 18), minlength=np.prod(shape)).reshape(shape)

    def Contrast(luma):
        signal = Deposit(luma)
        return (gaussian_filter(signal, detailScale) / np.maximum(detail, .01)
                - gaussian_filter(signal, backgroundScale) / np.maximum(background, .01))

    expected = [Contrast(luma) for luma in target]
    rendered = [Contrast(row[4]) for row in (a, b)]
    slopes = []
    for folder, row in zip(folders, (a, b)):
        plus, minus = (ReadRegisteredLuma(folder, "Gain" + side + ".png", row[-1])
                       for side in ("Plus", "Minus"))
        derivative = gaussian_filter(Deposit(plus) - Deposit(minus), detailScale)
        slopes.append(np.clip(derivative / (.52 * np.maximum(detail, .01)), .22, .94))
    observed = .48 * rendered[0] + .52 * rendered[1]
    primary, alternate = (band - observed for band in expected)
    targetBand = .57 * expected[0] + .43 * expected[1]
    # Keep only the deviations shared by the two real photographs and both measured lights.
    agree = ((np.sign(primary) == np.sign(alternate))
             & (np.sign(targetBand - rendered[0]) == np.sign(targetBand - rendered[1])))
    shared = np.clip(np.minimum(abs(primary), abs(alternate)) / .034, 0, 1) * agree
    slope = .48 * slopes[0] + .52 * slopes[1]
    gain = np.clip((.57 * primary + .43 * alternate) / slope, -.235, .235)
    raw = gaussian_filter(gain * shared * np.clip((detail - .39) / .92, 0, 1), (.55, .64))
    uu, vv = np.meshgrid(np.linspace(0, 1, shape[0]), np.linspace(0, 1, shape[1]), indexing="ij")
    coverage = np.clip((np.minimum(uu, 1 - uu) - .09) / .09, 0, 1)
    coverage *= np.clip((np.minimum(vv, 1 - vv) - .10) / .13, 0, 1)
    return (raw - gaussian_filter(raw, backgroundScale)) * coverage * 1.18, {
        folder.name: row[-1] for folder, row in zip(folders, (a, b))}


def TabSurfaceView(tab, photos, folder, photoIndex, weight, axes, museum, shape):
    u, span, valid, target, observed, hashes = RegisteredTabFace(tab, photos, folder)
    if valid.sum() < 11000:
        raise ValueError(f"The tab response is unresolved in {folder.name}")

    def Read(name):
        return ReadRegisteredLuma(folder, name + ".png", hashes)[valid]

    if np.max(abs(Read("ProbeZero") - observed[valid])) > .3:
        raise ValueError(f"The tab response baseline does not reproduce {folder.name}")
    baseline = np.log(observed[valid] + 18)
    if photoIndex is not None:
        residual = np.clip(np.log(target[photoIndex][valid] + 18) - baseline, -.46, .37)
    elif museum is not None:
        if not (np.array_equal(u, museum[0]) and np.array_equal(span, museum[1])):
            raise ValueError("The warm-light response must share the original tab camera")
        residual = np.clip(np.log(museum[4][valid] + 18) - baseline, -.30, .30)
    else:
        residual = np.zeros_like(baseline)
    basis = [np.log(Read(axis + side) + 18) - baseline
             for axis, *_ in axes for side in ("Plus", "Minus")]
    bins = np.rint(u[valid] * (shape[0] - 1)).astype(int) * shape[1]
    bins += np.rint(span[valid] * (shape[1] - 1)).astype(int)

    def Smooth(values):
        plane = np.bincount(bins, weights=values, minlength=np.prod(shape)).reshape(shape)
        return gaussian_filter(plane, (1.43, 1.38))

    support = Smooth(np.ones(valid.sum()))

    def Average(values):
        return weight * Smooth(values) / np.maximum(support, .44)

    pull, response = ResponseEquations(basis, residual, Average, shape)
    return pull, response, support, hashes


def FitTabSurface(tab, photos, evidence, *, resolve):
    if resolve:
        setups = (("V56TabResolveDefault", 0, .23), ("V56TabResolveFill", 0, .22),
                  ("V56TabResolvePhoto4", 1, .13), ("V56TabResolveMuseum", None, .42))
        axes = (("Across", .16, (.44, .43), .048), ("Along", .16, (.46, .42), .056),
                ("Rough", .14, (.51, .46), .049), ("Gain", .26, (.40, .36), .064))
    else:
        setups = (("V56TabSurfaceDefault", 0, .37), ("V56TabSurfaceFill", 0, .35),
                  ("V56TabSurfacePhoto4Matched", 1, .16), ("V56TabSurfaceMuseumResponse", None, .12))
        axes = (("Across", .16, (.68, .79), .039), ("Along", .16, (.60, .73), .043),
                ("Rough", .14, (.63, .67), .048), ("Gain", .26, (.65, .80), .068))
    shape = (61, 47)
    museum = RegisteredTabFace(tab, photos, evidence / "V56TabStudyMuseum") if resolve else None
    rows = [TabSurfaceView(tab, photos, evidence / name, photo, weight, axes, museum, shape)
            for name, photo, weight in setups]
    pull = np.sum([row[0] for row in rows], axis=0)
    response = np.sum([row[1] for row in rows], axis=0)
    fit = FitSignedResponse(pull, response, axes, 10)
    u, v = np.meshgrid(np.linspace(0, 1, shape[0]), np.linspace(0, 1, shape[1]), indexing="ij")
    coverage = np.clip((np.minimum(u, 1 - u) - .07) / .085, 0, 1)
    coverage *= np.clip((np.minimum(v, 1 - v) - .09) / .115, 0, 1)
    coverage *= np.clip(np.minimum(rows[0][2], rows[1][2]) / .76, 0, 1)
    fields = {axis: gaussian_filter(step * (fit[..., 2*i] - fit[..., 2*i+1]), (.81, .92)) * coverage
              for i, (axis, step, _, _) in enumerate(axes)}
    hashes = {setup[0]: row[-1] for setup, row in zip(setups, rows)}
    if museum is not None:
        hashes["V56TabStudyMuseum"] = museum[-1]
    return fields, hashes


def TabResponseCalibrations(image, alternate, tab, evidence):
    photos = [photo @ REGISTERED_LUMA for photo in (image, alternate)]
    identity = TabResponseIdentity(tab)
    grain, grainHashes = FitTabGrain(tab, photos, evidence)
    initial, initialHashes = FitTabSurface(tab, photos, evidence, resolve=False)
    remaining, resolveHashes = FitTabSurface(tab, photos, evidence, resolve=True)
    limits = {"Across": (-.17, .14), "Along": (-.148, .14), "Rough": (-.12, .125), "Gain": (-.23, .218)}
    fields = [np.clip(initial[name] + .87 * remaining[name], *limits[name])
              for name in ("Gain", "Across", "Along", "Rough")]
    return {"grainCalibration": WriteResponseFields(TAB_GRAIN, identity, (grain,), grainHashes, scale=95000),
            "surfaceCalibration": WriteResponseFields(TAB_RESPONSE, identity, fields,
                                                       {**initialHashes, **resolveHashes})}


def TabFinish(folder, number, previous=None, *, responseEvidence=None):
    image, source = Photo(folder, number)
    # UV bounds sampled through the artwork's curved face. Each photograph
    # has its own strips of visible metal, in increasing local V order.
    outline = [[.055, .5915, .9808], [.12, .4348, .9911], [.25, .2449, .5492],
               [.382, .1146, .4066], [.51, .0328, .3716], [.66, .0139, .3719],
               [.80, .007, .4302], [.902, .0019, .4542], [.946, .0218, .3694]]
    strips = ([[168, 652, 745], [244, 581, 734], [376, 488, 654],
               [550, 445, 577], [716, 435, 564], [916, 439, 572],
               [1122, 467, 583], [1269, 449, 532], [1370, 384, 459]] if number == 5 else
              [[895, 283, 246], [935, 307, 258], [1005, 346, 257],
               [1100, 344, 270], [1200, 344, 268], [1280, 345, 257],
               [1360, 347, 240], [1425, 354, 313], [1461, 351, 322]])
    uAnchors = np.asarray(outline)[:, 0]
    first, last = uAnchors[0], uAnchors[-1]
    u = np.linspace(first, last, 33)
    xs, starts, ends = (np.interp(u, uAnchors, column) for column in np.asarray(strips).T)
    samples = np.array([[Sample(image, x, y, radius=3) for y in np.linspace(start, end, 17)]
                        for x, start, end in zip(xs, starts, ends)])
    source["sampleStrips"] = strips
    field = FinishMap(samples, source, {"uCenter": (first+last)/2, "uHalfSpan": (last-first)/2, "vRange": [0, 1]})
    field["outlineUV"] = outline
    alternate = None
    if number == 5:
        alternate, alternateSource = Photo(folder, 4)
        source["pairedPhoto"] = {**alternateSource, "matchedPoints": 94, "medianErrorPixels": .524,
                                 "projectionFromPrimary": TAB_FRONT_PAIR_PROJECTION}
    field["detail"] = TabDetail(image, number, uAnchors, strips, alternate)
    lightness = samples @ LUMA
    # Reflective rubbed edges are paired with the remainder of each strip.
    # Restrict the bright-metal estimate to the less saturated areas.
    body = np.median(lightness[:, 3:-3], axis=1, keepdims=True)
    warmth = (samples[..., 0] - samples[..., 2]) / np.maximum(lightness, 25)
    exposed = np.clip((lightness - body - 7) / 34, 0, 1) * np.clip((.61-warmth)/.39, .2, 1)
    field["rubbedCoverage"] = np.rint(100 * exposed).astype(int).tolist()
    if alternate is not None:
        if responseEvidence is not None:
            field.update(TabResponseCalibrations(image, alternate, field, responseEvidence))
        elif previous:
            identity = TabResponseIdentity(field)
            for name in ("grainCalibration", "surfaceCalibration"):
                if (calibration := previous.get(name)) and all(
                        calibration.get(key) == value for key, value in identity.items()):
                    field[name] = calibration
    return field


def EyeEdgeFinish(image, trace):
    halfWidths = [32, 38, 37, 38, 39, 40, 37, 37]
    angularHalfSpan = .16
    angles = np.linspace(-angularHalfSpan, angularHalfSpan, 9)
    crossOffsets = np.sin(2 * np.pi * angles)
    samples = np.array([[Sample(image, x, y + width * offset) for offset in crossOffsets]
                        for (_, x, y), width in zip(trace, halfWidths)])
    lightness = samples @ LUMA
    chroma = (samples[..., 0] - samples[..., 2]) / np.maximum(lightness, 25)
    # The cooler patch is cut by the lighting stripe in the photograph. Use
    # the change in oxide color and taper the coverage at the dull tip.
    clean = np.clip((.46 - chroma) / .34, 0, 1)
    positions = np.array([v for v, _, _ in trace])
    clean *= np.clip((positions - .035) / .10, 0, 1)[:, None]
    spaced = np.linspace(positions[0], positions[-1], 25)
    coverage = np.array([np.interp(spaced, positions, column) for column in clean.T])

    # Transfer the fine corrosion contrast without the broad lighting band.
    fineV = np.linspace(positions[0], positions[-1], 93)
    centerX, centerY = [np.interp(fineV, positions, column) for column in np.asarray(trace).T[1:]]
    widths = np.interp(fineV, positions, halfWidths)
    angles = np.linspace(-angularHalfSpan, angularHalfSpan, 63)
    xs = np.broadcast_to(centerX, (len(angles), len(fineV)))
    ys = centerY + np.sin(2 * np.pi * angles[:, None]) * widths
    tone = SampleBilinear(image @ LUMA, xs, ys)
    blurred = Image.fromarray(np.rint(tone).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3.3))
    envelope = np.asarray(blurred, dtype=np.float32)
    contrast = np.clip(100 * (tone - envelope) / np.maximum(envelope, 45), -29, 29)

    return {"footprint": {"uCenter": 0, "uHalfSpan": angularHalfSpan, "vRange": [positions[0], positions[-1]]},
            "sampleHalfWidths": halfWidths, "rubbedCoverage": np.rint(100 * coverage).astype(int).tolist(),
            "relativeDetail": np.rint(contrast).astype(int).tolist()}


def EyeFinish(folder):
    # V runs around the loop from its outer tip. Photo 5 shows the wire nearly
    # edge-on, giving an unsigned distance from the tip along the visible bar.
    # The oblique reverse view in photo 2 also distinguishes the two arcs.
    traces = {
        "front": (5, [[0, 517, 821], [.065, 463, 824], [.115, 418, 825], [.17, 375, 823],
                      [.226, 335, 820], [.27, 289, 816], [.326, 248, 815], [.38, 214, 813]]),
        "reverse": (2, [[.655, 940, 181], [.70, 971, 165], [.75, 1001, 148], [.80, 1032, 143],
                        [.85, 1052, 161], [.90, 1064, 184], [.95, 1068, 212], [0, 1069, 238],
                        [.04, 1067, 269], [.10, 1048, 288], [.16, 1017, 291], [.22, 981, 283],
                        [.28, 946, 269], [.345, 915, 252]]),
    }
    result = {}
    for side, (number, trace) in traces.items():
        image, source = Photo(folder, number)
        xy = np.asarray(trace)[:, 1:]
        tangent = np.gradient(xy, axis=0)
        across = tangent[:, ::-1] * [-1, 1] / np.linalg.norm(tangent, axis=1)[:, None]
        offsets = np.linspace(-12, 12, 5)
        samples = np.array([[Sample(image, *(position + axis * offset), radius=4) for offset in offsets]
                            for position, axis in zip(xy, across)])
        lightness = samples @ LUMA
        tone = np.median(lightness, axis=1)
        warmth = np.median((samples[..., 0] - samples[..., 2]) / np.maximum(lightness, 25), axis=1)
        lo, hi = np.percentile(tone, [15, 85])
        rubbed = np.clip((tone - lo) / (hi - lo), 0, 1)
        rubbed *= np.clip((.53 - warmth) / .30, .15, 1)
        source["trace"] = trace
        result[side] = {"source": source, "v": [point[0] for point in trace],
                        "sampleLuminance": np.rint(tone).astype(int).tolist(),
                        "sampleWarmth": np.round(warmth.astype(np.float64), 3).tolist(),
                        "rubbedCoverage": np.rint(100 * rubbed).astype(int).tolist()}
        if side == "front":
            result[side]["outerWire"] = EyeEdgeFinish(image, trace)
    return result


def WheelFinish(folder):
    image, source = Photo(folder, 3)
    # Average several teeth at each cross-rim station. Reflected light changes
    # with each facet, while the warm oxide is concentrated away from the lips.
    columns = list(range(267, 324, 4))
    top, bottom = 272, 612
    warmth = []
    for x in columns:
        pixels = image[top:bottom, x:x+3]
        lightness = pixels @ LUMA
        warmth.append(np.median((pixels[..., 0] - pixels[..., 2]) / np.maximum(lightness, 25)))
    rubbed = np.clip((.49 - np.array(warmth)) / .17, 0, 1)
    source.update({"columns": columns, "sampleY": [top, bottom]})

    # Register each complete tooth separately. The rows run toward the top of
    # the photo from the lower crown break, through the crown and the recess.
    toothRows = [[358, 335, 326, 307, 299], [425, 399, 385, 368, 358],
                 [498, 474, 451, 431, 425], [554, 535, 521, 504, 498]]
    phase = np.linspace(0, 1, 25)
    across = np.linspace(.09, .91, 17)
    swatches = []
    for rows in toothRows:
        yy = np.interp(phase, [0, .25, .50, .75, 1], rows)
        lo = np.interp(yy, [265, 410, 560, 613], [267, 269, 271, 272])
        hi = np.interp(yy, [265, 410, 560, 613], [326, 328, 328, 329])
        xx = lo[:, None] + (hi - lo)[:, None] * across
        swatches.append([[Sample(image, x, y, radius=2) for x in line] for y, line in zip(yy, xx)])
    swatches = np.asarray(swatches)
    lightness = swatches @ LUMA
    chroma = np.median((swatches[..., 0] - swatches[..., 2]) / np.maximum(lightness, 25), axis=0)
    worn = np.clip((.57 - chroma) / .46, 0, 1)
    rust = np.clip((chroma - .185) / .55, 0, 1)
    for field in (worn, rust):
        field[0] = field[-1] = (field[0] + field[-1]) * .5
    # Suppress the common reflection at each angular station before keeping
    # small tone changes across a tooth. Keep the four swatches independent.
    fine = []
    for tile in lightness:
        smooth = np.asarray(Image.fromarray(np.rint(tile).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.7)))
        residual = (tile - smooth) / np.maximum(smooth, 45)
        residual -= np.median(residual, axis=1, keepdims=True)
        residual[[0, -1]] = 0
        fine.append(np.rint(np.clip(100 * residual, -28, 28)).astype(int).tolist())
    source["toothRows"] = toothRows
    return {"source": source, "v": np.linspace(.06, .94, len(columns)).round(4).tolist(),
            "sampleWarmth": np.round(np.asarray(warmth, dtype=np.float64), 3).tolist(),
            "rubbedCoverage": np.rint(100 * rubbed).astype(int).tolist(),
            "rim": {"footprint": {"uCenter": .5, "uHalfSpan": .5, "vRange": [.09, .91]},
                    "wornSteel": np.rint(100 * worn).astype(int).tolist(),
                    "oxide": np.rint(100 * rust).astype(int).tolist(), "toothDetail": fine}}


def KnurlWear(image, bounds):
    left, top, right, bottom = bounds
    selection = np.s_[top:bottom, left:right]
    tone, warmth, lightness = (field[selection] for field in PhotoResiduals(image))
    h, w = tone.shape
    window = np.hanning(h)[:, None] * np.hanning(w)[None, :]
    amplitude = np.abs(np.fft.rfft2(tone * window, s=(h * 4, w * 4)))
    fx = np.fft.rfftfreq(w * 4)[None, :]
    fy = np.fft.fftfreq(h * 4)[:, None]
    band = (fx > .025) & (fx < .052) & (abs(fy) > .041) & (abs(fy) < .077)
    peaks = [np.unravel_index(np.where(band & (sign * fy > 0), amplitude, 0).argmax(), amplitude.shape)
             for sign in (-1, 1)]
    frequencies = [(float(fx[0, j]), float(fy[i, 0])) for i, j in peaks]
    yy, xx = np.indices((h, w))
    phaseA, phaseB = (2 * np.pi * (px * xx + py * yy) for px, py in frequencies)
    # Keep the measured variations between crests. The regular diamond
    # response and its first harmonics are built separately during baking.
    modes = [phaseA, phaseB, 2 * phaseA, 2 * phaseB, phaseA + phaseB, phaseA - phaseB]
    basis = np.column_stack([fn(phase.ravel()) for phase in modes for fn in (np.cos, np.sin)])
    signals = np.column_stack((tone.ravel(), warmth.ravel()))
    weights = np.sqrt(window.ravel())[:, None]
    fitted = np.linalg.lstsq(basis * weights, signals * weights, rcond=None)[0]
    irregularTone, irregularWarmth = (signals - basis @ fitted).T.reshape(2, h, w)

    # This photo crop matches the visible UV window in the side inspection.
    # V increases to the right and U increases down in the rotated photo.
    # The grip sits below the stem in this orientation, across the U seam.
    center, halfSpan = .02227, .09188
    footprint = {"uCenter": center, "uHalfSpan": halfSpan, "vRange": [.44433, .69863]}
    us, vs = np.meshgrid(np.linspace(0, 1, 200), np.linspace(0, 1, 216))
    srcX = (w - 1.01) * vs
    arc = np.sin(2 * np.pi * halfSpan * (2 * us - 1)) / np.sin(2 * np.pi * halfSpan)
    srcY = (h - 1.01) * (.5 + .5 * arc)
    confidence = np.clip((247 - lightness) / 25, 0, 1)
    detail = SaveDetailPlate(irregularTone, irregularWarmth, confidence, srcX, srcY, KNURL_DETAIL, halfSize=False)
    return {"footprint": footprint, "detail": detail,
            "removedFrequencies": [[round(x, 5), round(y, 5)] for x, y in frequencies]}


def KnurlFrequency(folder, prior=None, evidence=None):
    image, source = Photo(folder, 3)
    x0, y0, x1, y1 = bounds = [665, 338, 883, 513]
    patch = image[y0:y1, x0:x1] @ LUMA
    rows, cols = patch.shape
    amplitude = np.abs(np.fft.rfft2((patch - patch.mean()) * np.hanning(rows)[:, None] * np.hanning(cols)))
    fy, fx = np.fft.fftfreq(rows)[:, None], np.fft.rfftfreq(cols)[None, :]
    region = (fx > .025) & (fx < .052) & (abs(fy) > .041) & (abs(fy) < .077)
    peaks = [np.unravel_index(np.where(region & (sign * fy > 0), amplitude, 0).argmax(), amplitude.shape)
             for sign in (1, -1)]
    axial = float(np.mean([fx[0, i] for j, i in peaks]))
    angular = float(np.mean([abs(fy[j, 0]) for j, i in peaks]))
    # The counts are frequencies in the display asset's UVs.
    source["sampleBounds"] = bounds
    result = {"source": source, "axialCyclesPerPixel": round(axial, 5),
              "angularCyclesPerPixel": round(angular, 5),
              "axialCycles": round(axial * 345 / .406), "angularCycles": round(angular * np.pi * 316),
              "wear": KnurlWear(image, bounds)}
    footprint = result["wear"]["footprint"]
    angle = 2 * np.pi * footprint["uHalfSpan"]

    def PhotoCoordinates(u, v):
        arc = np.sin((2 * u - 1) * angle) / np.sin(angle)
        return x0 + (x1 - x0 - 1.01) * v, y0 + (y1 - y0 - 1.01) * (.5 + .5 * arc)

    identity = {"photoSha256": source["sha256"], "sampleBounds": bounds, "footprint": footprint}
    RestoreGripResponse(result, prior or {}, identity, evidence, KNURL_RESPONSE, "Direct", image, PhotoCoordinates)
    return result


def KnurlFlankWear(folder):
    image, source = Photo(folder, 4)
    bounds = [162, 587, 328, 660]
    left, top, right, bottom = bounds
    region = np.s_[top:bottom, left:right]
    tone, warmth, lightness = (field[region] for field in PhotoResiduals(image))
    # Match the straight patterned face to the visible rim and the edge of
    # the stem. The angular samples follow the foreshortened cylinder.
    us = np.array([.65413, .66609, .67802, .69007, .70246, .71485, .72793,
                   .74129, .75531, .77049, .78660, .80496, .82687])
    projectedY = np.arange(len(us)) * 6
    sampleU, sampleV = np.meshgrid(np.linspace(us[0], us[-1], 100), np.linspace(0, 1, 168))
    srcX = (right - left - 1.01) * sampleV
    srcY = np.clip(np.interp(sampleU, us, projectedY), 0, bottom - top - 1.01)
    toneUv, warmthUv, shadeUv = (SampleBilinear(field, srcX, srcY) for field in (tone, warmth, lightness))
    height, width = toneUv.shape
    window = np.hanning(height)[:, None] * np.hanning(width)[None, :]
    amplitude = np.abs(np.fft.rfft2(toneUv * window, s=(height * 6, width * 6)))
    fx = np.fft.rfftfreq(width * 6)[None, :]
    fy = np.fft.fftfreq(height * 6)[:, None]
    band = (fx > .074) & (fx < .122) & (np.abs(fy) > .052) & (np.abs(fy) < .081)
    peaks = [np.unravel_index(np.where(band & (fy * sign > 0), amplitude, 0).argmax(), amplitude.shape)
             for sign in (-1, 1)]
    frequencies = [(float(fx[0, j]), float(fy[i, 0])) for i, j in peaks]
    yy, xx = np.indices(toneUv.shape)
    a, b = (2 * np.pi * (f * xx + g * yy) for f, g in frequencies)
    phases = [a, b, 2 * a, 2 * b, a + b, a - b]
    # The same row of diamonds reflects differently near the rim. Fit that
    # variation before transferring the non-repeating pits and scratches.
    angular = (2 * xx / (width - 1) - 1).ravel()
    basis = np.column_stack([fn(phase).ravel() * scale for phase in phases
                             for fn in (np.cos, np.sin) for scale in (1, angular, angular ** 2)])
    weight = np.sqrt(window).ravel()[:, None]
    observations = np.column_stack((toneUv.ravel(), warmthUv.ravel()))
    fitted = np.linalg.lstsq(basis * weight, observations * weight, rcond=None)[0]
    wearTone, wearWarmth = (observations - basis @ fitted).T.reshape(2, height, width)
    detail = SaveDetailPlate(wearTone, wearWarmth, np.clip((247 - shadeUv) / 25, 0, 1),
                             np.minimum(xx, width - 1.01), np.minimum(yy, height - 1.01),
                             KNURL_FLANK, halfSize=False)
    # The steel is lit unevenly. Measure the excess warmth in grooves
    # against the exposed edges in the same band of the photograph.
    sample = image[region]
    chroma = (sample[..., 0] - sample[..., 2]) / np.maximum(sample @ LUMA, 25)
    shadowChroma = []
    for rows in np.array_split(np.arange(tone.shape[0]), 5):
        bandTone, bandChroma = tone[rows], chroma[rows]
        dark = np.median(bandChroma[bandTone < -.09])
        bright = np.median(bandChroma[bandTone > .09])
        shadowChroma.append([np.interp(rows.mean(), projectedY, us), np.clip(dark - bright, 0, 1)])
    source["sampleBounds"] = bounds
    source["observedGripBounds"] = [151, 581, 338, 669]
    source["uBySampleRow"] = np.stack([us, projectedY], axis=1).tolist()
    footprint = {"uCenter": round((us[0] + us[-1]) / 2, 6), "uHalfSpan": round((us[-1] - us[0]) / 2, 6),
                 "vRange": [.39821, .75679]}
    return {"source": source, "footprint": footprint, "detail": detail,
            "shadowChroma": np.round(shadowChroma, 5).tolist(), "uvFrequencies": np.round(frequencies, 5).tolist()}


def ShoulderPhotoGrid(uRange, vRange, viewCenter, rails, width, height):
    # The two photo rails follow the projected arc. Their horizontal
    # positions are calibrated at the collar seam and the shoulder edge.
    u, v = np.meshgrid(np.linspace(*uRange, width), np.linspace(*vRange, height))
    samples, x, first, last = np.asarray(rails, dtype=float).T
    low, high = np.sin(2 * np.pi * (np.asarray(uRange) - viewCenter))
    angle = (np.sin(2 * np.pi * (u - viewCenter)) - low) / (high - low)
    y = (1 - angle) * np.interp(v, samples, first) + angle * np.interp(v, samples, last)
    return np.interp(v, samples, x), y


def ShoulderFinish(folder):
    # Each row is a shoulder V coordinate and the photograph's x, upper y
    # and lower y for the selected angular window.
    views = {
        "Direct": (3, (.805, .859), (.48249027237354086, .8664682993820096), .998, 104, [
            [.48249, 308.06956, 38.40369, 64.61473], [.53109, 322.13987, 49.36836, 74.93868],
            [.57931, 336.09973, 58.14894, 83.13699], [.62753, 350.0596, 65.88087, 90.28486],
            [.67576, 364.02388, 70.53136, 94.25883], [.72398, 377.98374, 76.60274, 99.35858],
            [.77247, 392.02312, 80.4039, 102.34945], [.81669, 404.82555, 82.49834, 103.75066],
            [.86647, 419.23602, 84.6097, 105.24531],
        ]),
        "Flank": (4, (.524, .778), (.3431906614785992, .43404287785152973), .645, 246, [
            [.34319, 87.96217, 356.49705, 535.42175], [.35531, 88.7496, 356.68103, 535.41247],
            [.36742, 89.53703, 356.86836, 535.40346], [.37954, 90.32446, 357.17862, 536.22417],
            [.39165, 91.11188, 356.50108, 536.05457], [.40375, 91.89832, 355.80537, 535.87569],
            [.40981, 92.29204, 356.45206, 536.37513], [.42193, 93.07946, 355.7389, 536.19099],
            [.43404, 93.86689, 356.84941, 536.33033],
        ]),
    }
    fields = {}
    for name, (photo, uRange, vRange, viewCenter, width, rails) in views.items():
        image, source = Photo(folder, photo)
        source.update({"photoRails": rails, "viewCenter": viewCenter})
        u0, u1 = uRange
        footprint = {"uCenter": round((u0 + u1) / 2, 6), "uHalfSpan": round((u1 - u0) / 2, 6),
                     "vRange": vRange}
        x, y = ShoulderPhotoGrid(uRange, vRange, viewCenter, rails, 17, 21)
        samples = np.stack([SampleBilinear(channel, x, y) for channel in np.moveaxis(image, -1, 0)], axis=-1)
        samples = samples.transpose(1, 0, 2)
        field = FinishMap(samples, source, footprint)
        if name == "Flank":
            patina = PatinaMap(samples)
            field["oxideCoverage"] = patina["oxideCoverage"]
            field["neutralWarmth"] = patina["neutralWarmth"]
            luma = samples @ LUMA
            chroma = (samples[..., 0] - samples[..., 2]) / np.maximum(luma, 25)
            relative = np.asarray(field["relativeLuminance"], dtype=float)
            clean = np.clip((patina["neutralWarmth"] + .065 - chroma) / .13, 0, 1)
            # Use scratches and cool local highlights. The broad strip
            # reflection is removed by FinishMap.
            wear = np.clip((relative - 2) / 20, 0, 1) * clean
            field["exposedSteelCoverage"] = np.rint(100 * wear).astype(int).tolist()
            # Surface correspondence measured with the shoulder UV islands.
            field["fineUvOffset"] = [-.00199, -.00255]
        x, y = ShoulderPhotoGrid(uRange, vRange, viewCenter, rails, width, 108)
        if name == "Flank":
            # Keep the blur in PhotoResiduals inside the visible strip so
            # the adjoining dark stem cannot contribute to the grain.
            detailBounds = [85, 346, 96, 548]
            left, top, right, bottom = detailBounds
            source["detailBounds"] = detailBounds
            image = image[top:bottom, left:right]
            x, y = x - left, y - top
        detailPath = RECORD.with_name(f"Texture_Type89LauncherShoulder{name}.png")
        field["detail"] = WriteDetailPlate(image, x, y, detailPath)
        fields[name] = field
    return fields


def Main():
    options = argparse.ArgumentParser(description=__doc__)
    options.add_argument("--photos", type=Path, required=True, help="Local ReferencePhotos directory")
    options.add_argument("--barrel-evidence", type=Path, help="V38 Evidence directory containing fixed-light views and the default-light control")
    options.add_argument("--barrel-response-evidence", type=Path, help="V40 Evidence directory containing the two captures with steel response variants")
    options.add_argument("--barrel-finish-evidence", type=Path, help="V41 Evidence directory with barrel color and fine-response captures")
    options.add_argument("--barrel-material-evidence", type=Path, help="V44 Evidence directory with barrel material and highlight-response captures")
    options.add_argument("--barrel-mark-evidence", type=Path, help="V46 Evidence directory with barrel stamp response captures")
    options.add_argument("--barrel-small-mark-evidence", type=Path, help="V47 Evidence directory with the small barrel stamp response captures")
    options.add_argument("--barrel-facet-evidence", type=Path, help="V49 Evidence directory with tangent-normal and base-color response captures")
    options.add_argument("--barrel-band-evidence", type=Path, help="V50 Evidence directory with three-light barrel response captures")
    options.add_argument("--barrel-grain-evidence", type=Path, help="V51 Evidence directory with registered fine-grain color response captures")
    options.add_argument("--saddle-response-evidence", type=Path, help="V52 Evidence directory with saddle material response captures")
    options.add_argument("--neck-chroma-evidence", type=Path, help="V53 Evidence directory with the neck color response captures")
    options.add_argument("--neck-mark-evidence", type=Path, help="V54 Evidence directory with the neck mark response captures")
    options.add_argument("--stem-response-evidence", type=Path, help="V55 Evidence directory with stem material response captures")
    options.add_argument("--tab-response-evidence", type=Path, help="V56 Evidence directory with paired-photo tab response captures")
    options.add_argument("--grip-response-evidence", type=Path, help="V57 captures of the grip and collar under measured lighting")
    options.add_argument("--sleeve-evidence", type=Path, help="V39 Evidence directory containing the two registered sleeve controls")
    options.add_argument("--sleeve-response-evidence", type=Path, help="V42 Evidence directory with sleeve response and refinement captures")
    options.add_argument("--sleeve-horizon-evidence", type=Path, help="V43 Evidence directory with sleeve horizon lighting captures")
    args = options.parse_args()
    record = json.loads(RECORD.read_text(encoding="utf-8"))
    prior = record.get("closeups", {})
    priorFlank = record.get("knurl", {}).get("flankWear", {})
    priorShoulderBalance = record.get("shoulder", {}).get("Flank", {}).get("reflectionBalance")
    priorWideBalance = record.get("barrelPatina", {}).get("wideReflectionBalance")
    multiPhotoFits = [(name, record.pop(name, None), identity) for name, identity in (
        ("reverseReflectionBalance", ReverseReflectionIdentity), ("sleeveReverseFinish", SleeveReverseIdentity),
        ("collarJointFinish", CollarJointIdentity), ("saddleJointFinish", SaddleJointIdentity),
        ("neckJointFinish", NeckJointIdentity), ("sleeveJointFinish", SleeveJointIdentity),
        ("sleeveOpticalFinish", SleeveOpticalIdentity),
        ("collarReflectanceFinish", CollarReflectanceIdentity), ("barrelJointFinish", BarrelJointIdentity),
        ("stemJointFinish", StemJointIdentity), ("saddleReflectanceFinish", SaddleReflectanceIdentity),
        ("saddleRimFinish", SaddleRimIdentity), ("saddleSurfaceRefinement", SaddleRimIdentity),
        ("tabReflectanceFinish", lambda current: TabReflectanceIdentity(current, "Tab")),
        ("tabBackReflectanceFinish", lambda current: TabReflectanceIdentity(current, "TabBack")),
        ("shoulderReflectanceFinish", ShoulderReflectanceIdentity), ("wheelOxideFinish", WheelOxideIdentity),
        ("wheelRearRefinement", WheelRearIdentity),
        ("gripRearFinish", GripRearIdentity), ("gripFamilyPhase", GripFamilyPhaseIdentity))]
    barrel = BarrelFinish(args.photos, prior.get("Barrel", {}), evidence=args.barrel_evidence,
                          responseEvidence=args.barrel_response_evidence, finishEvidence=args.barrel_finish_evidence,
                          materialEvidence=args.barrel_material_evidence, markEvidence=args.barrel_mark_evidence,
                          smallMarkEvidence=args.barrel_small_mark_evidence, facetEvidence=args.barrel_facet_evidence,
                          bandEvidence=args.barrel_band_evidence, grainEvidence=args.barrel_grain_evidence)
    sleeve = SleeveFinish(args.photos, prior.get("Sleeve", {}), evidence=args.sleeve_evidence,
                          responseEvidence=args.sleeve_response_evidence, horizonEvidence=args.sleeve_horizon_evidence)
    record["barrelPatina"] = OverallBarrelPatina(args.photos, record["footprint"])
    collar = CollarFinish(args.photos, prior.get("CollarRing"), evidence=args.grip_response_evidence)
    record["closeups"] = {"Barrel": barrel, "CollarRing": collar,
                          "Stem": StemFinish(args.photos, prior.get("Stem"), responseEvidence=args.stem_response_evidence),
                          "Sleeve": sleeve,
                          "Saddle": ShoeFinish(args.photos, prior.get("Saddle"), responseEvidence=args.saddle_response_evidence),
                          "Neck": NeckFinish(args.photos, prior.get("Neck"), chromaEvidence=args.neck_chroma_evidence,
                                             markEvidence=args.neck_mark_evidence),
                          "Tab": TabFinish(args.photos, 5, prior.get("Tab"), responseEvidence=args.tab_response_evidence),
                          "TabBack": TabFinish(args.photos, 2)}
    record["ringFinish"] = EyeFinish(args.photos)
    record["wheelFinish"] = WheelFinish(args.photos)
    record["knurl"] = KnurlFrequency(args.photos, record.get("knurl"), evidence=args.grip_response_evidence)
    record["knurl"]["flankWear"] = KnurlFlankWear(args.photos)
    record["shoulder"] = ShoulderFinish(args.photos)
    shoulder = record["shoulder"]["Flank"]
    if priorShoulderBalance and all(priorShoulderBalance.get(key) == value
                                   for key, value in ShoulderReflectionIdentity(shoulder).items()):
        shoulder["reflectionBalance"] = priorShoulderBalance
    tab, flank = record["closeups"]["Tab"], record["knurl"]["flankWear"]
    for key, previous, current, identity in (
        ("warmCalibration", prior.get("Tab", {}), tab, TabWarmIdentity(tab)),
        ("surfaceCalibration", priorFlank, flank, KnurlFlankResponseIdentity(flank)),
    ):
        calibration = previous.get(key)
        if calibration and all(calibration.get(field) == value for field, value in identity.items()):
            current[key] = calibration
    pattern = priorFlank.get("patternRegistration")
    knurl = record["knurl"]
    if (pattern and pattern.get("responseSha256") == flank.get("surfaceCalibration", {}).get("sha256")
            and pattern.get("photoSha256") == flank["source"]["sha256"]
            and pattern.get("footprint") == flank["footprint"]
            and pattern.get("uBySampleRow") == flank["source"]["uBySampleRow"]
            and pattern.get("cyclesPerChart") == [knurl["angularCycles"], knurl["axialCycles"]]):
        flank["patternRegistration"] = pattern
    grooveFinish = priorFlank.get("grooveFinish")
    if grooveFinish and all(grooveFinish.get(key) == value for key, value in KnurlGrooveFinishIdentity(flank).items()):
        flank["grooveFinish"] = grooveFinish
    for previous, current, identity in (
        (prior.get("Tab", {}), tab, TabLightBalanceIdentity(tab)),
        (priorFlank, flank, GripLightBalanceIdentity(flank)),
    ):
        calibration = previous.get("lightBalance")
        if calibration and all(calibration.get(field) == value for field, value in identity.items()):
            current["lightBalance"] = calibration
    balance = prior.get("Tab", {}).get("steelBalance")
    if balance and all(balance.get(field) == value for field, value in TabSteelBalanceIdentity(tab).items()):
        tab["steelBalance"] = balance
    albedo = priorFlank.get("albedoBalance")
    if albedo and all(albedo.get(field) == value for field, value in GripAlbedoBalanceIdentity(flank).items()):
        flank["albedoBalance"] = albedo
    for name in ("Barrel", "Saddle"):
        previous = prior.get(name, {}).get("surfaceBalance")
        spec = record["closeups"][name]
        if previous and all(previous.get(field) == value for field, value in SurfaceBalanceIdentity(spec).items()):
            spec["surfaceBalance"] = previous
    if priorWideBalance and all(priorWideBalance.get(field) == value
                                for field, value in WideReflectionIdentity(record).items()):
        record["barrelPatina"]["wideReflectionBalance"] = priorWideBalance
    for name, previous, identity in multiPhotoFits:
        if previous is None:
            continue
        photo = args.photos / previous["source"]["file"]
        unchanged = not photo.is_file() or sha256(photo.read_bytes()).hexdigest() == previous["sourceSha256"]
        if unchanged and all(previous.get(field) == value for field, value in identity(record).items()):
            record[name] = previous
    SaveReferenceRecord(record)
    print("Measured close-ups:", ", ".join(record["closeups"]), "knurl UV cycles:",
          record["knurl"]["angularCycles"], record["knurl"]["axialCycles"], flush=True)


if __name__ == "__main__":
    Main()
