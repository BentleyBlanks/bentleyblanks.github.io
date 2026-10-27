"""Deterministic, physically scaled Type 88-II surface sources.

Uses NumPy and Pillow, not a generative-image service. Authored albedo never
contains illumination. Normal detail is in metres; masks distinguish doped
fabric, painted/bare aluminium, exhaust steel, varnish, leather and rubber.
All files are private build inputs beside the editable Blender project.
"""
from pathlib import Path
import argparse
import hashlib
import json
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


DEFAULT_SOURCE = Path(r"C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\KawasakiType88\Release86")
VERSION = "20261027Surface44"


def Field(width, height, seed, frequencies=(8, 32, 128)):
    rng = np.random.default_rng(seed)
    field = np.zeros((height, width), np.float32)
    for i, frequency in enumerate(frequencies):
        smallHeight = max(2, round(frequency * height / width))
        values = (rng.random((smallHeight, frequency)) * 255).astype(np.uint8)
        im = Image.fromarray(values).resize((width, height), Image.Resampling.BICUBIC)
        field += (np.asarray(im).astype(np.float32) / 255 - .5) / (2 ** i)
    return field


def Grid(width, height):
    return np.meshgrid(np.linspace(0, 1, width, dtype=np.float32),
                       np.linspace(1, 0, height, dtype=np.float32))


def Gaussian(u, v, x, y, sx, sy):
    return np.exp(-.5 * (((u - x) / sx) ** 2 + ((v - y) / sy) ** 2))


def RGB(values):
    return np.clip(values * 255, 0, 255).astype(np.uint8)


def CompositeSrgbCoverage(base, paint, coverage):
    """Average authored albedo coverage in linear light, then encode sRGB."""
    a = np.asarray(base, np.float32) / 255
    b = np.asarray(paint, np.float32) / 255
    a = np.where(a <= .04045, a / 12.92, ((a + .055) / 1.055) ** 2.4)
    b = np.where(b <= .04045, b / 12.92, ((b + .055) / 1.055) ** 2.4)
    linear = a * (1 - coverage[..., None]) + b * coverage[..., None]
    encoded = np.where(linear <= .0031308, linear * 12.92, 1.055 * np.maximum(linear, 0) ** (1 / 2.4) - .055)
    return np.uint8(np.clip(encoded * 255 + .5, 0, 255))


def NormalFromHeight(height, tileM):
    gy, gx = np.gradient(height, tileM / height.shape[0], tileM / height.shape[1])
    normal = np.stack((-gx, gy, np.ones_like(gx)), axis=2)
    normal /= np.linalg.norm(normal, axis=2, keepdims=True)
    return RGB(normal * .5 + .5)


class SurfaceBake:
    def __init__(self, sourceRoot):
        self.root = Path(sourceRoot) / "Textures"
        self.root.mkdir(parents=True, exist_ok=True)
        self.records = []
        self.cowlingPath = Path(__file__).resolve().parents[1] / "Model/KawasakiType88/Data_KawasakiType88Cowling.json"
        self.cowlingData = json.loads(self.cowlingPath.read_text(encoding="utf-8"))
        self.wingPath = Path(__file__).resolve().parents[1] / "Model/KawasakiType88/Data_KawasakiType88Wing.json"
        self.wingData = json.loads(self.wingPath.read_text(encoding="utf-8"))
        self.cockpitPath = Path(__file__).resolve().parents[1] / "Model/KawasakiType88/Data_KawasakiType88Cockpit.json"
        self.cockpitData = json.loads(self.cockpitPath.read_text(encoding="utf-8"))
        self.bodyPath = Path(__file__).resolve().parents[1] / "Model/KawasakiType88/Data_KawasakiType88Body.json"
        self.bodyData = json.loads(self.bodyPath.read_text(encoding="utf-8")) if self.bodyPath.exists() else {}
        self.paintPath = Path(__file__).resolve().parents[1] / "Model/KawasakiType88/Data_KawasakiType88Paint.json"
        self.paintData = json.loads(self.paintPath.read_text(encoding="utf-8"))
        self.latinFont = Path("C:/Windows/Fonts/arial.ttf")
        self.cjkFont = Path("C:/Windows/Fonts/simsun.ttc")

    def Save(self, name, base, orm, physicalScale, description, channels=("Base", "Orm")):
        if isinstance(base, np.ndarray):
            base = Image.fromarray(RGB(base))
        if isinstance(orm, np.ndarray):
            orm = Image.fromarray(RGB(orm))
        for channel, im in (("Base", base), ("Orm", orm)):
            if channel not in channels:
                continue
            path = self.root / f"Texture_Type88{name}{channel}.png"
            im.save(path, compress_level=6)
            self.records.append({"file": path.name, "channel": channel, "pixels": im.size,
                                 "physicalUvExtentM": physicalScale, "description": description,
                                 "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})

    def Stamp(self, image, text, u, v, width, height, color, rotation=0, cjk=False, flipVertical=False):
        font = ImageFont.truetype(str(self.cjkFont if cjk else self.latinFont), 240)
        bounds = font.getbbox(text)
        glyph = Image.new("L", (bounds[2] - bounds[0] + 16, bounds[3] - bounds[1] + 16))
        ImageDraw.Draw(glyph).text((8 - bounds[0], 8 - bounds[1]), text, font=font, fill=255,
                                  stroke_width=0)
        if text == "12":
            # The reference's 1 is a plain painted stroke, without the Arial
            # flag/foot. Both wing numerals face the same direction.
            glyph = Image.new("L", (310, 250))
            draw = ImageDraw.Draw(glyph)
            draw.line((28, 10, 28, 239), fill=255, width=14)
            def Curve(a, b, c, d):
                return [((1-t)**3*a[0]+3*(1-t)**2*t*b[0]+3*(1-t)*t*t*c[0]+t**3*d[0],
                         (1-t)**3*a[1]+3*(1-t)**2*t*b[1]+3*(1-t)*t*t*c[1]+t**3*d[1]) for t in np.linspace(0, 1, 50)]
            path = Curve((133, 66), (133, -7), (287, -5), (287, 68))
            path += Curve((287, 68), (287, 105), (195, 163), (132, 236))[1:]
            path += [(293, 236)]
            draw.line(path, fill=255, width=14, joint="curve")
        if rotation:
            glyph = glyph.rotate(rotation, expand=True, resample=Image.Resampling.BICUBIC)
        if flipVertical:
            glyph = glyph.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        glyph = glyph.resize((max(2, round(image.width * width)), max(2, round(image.height * height))), Image.Resampling.LANCZOS)
        image.paste(color, (round(image.width * u - glyph.width / 2), round(image.height * (1 - v) - glyph.height / 2)), glyph)

    def Wing(self, name, markings):
        w, h = 4096, 1024
        chordM = 2.092026 if name == "UpperWing" else 1.72
        roundelChordFraction = .44158846 if name == "UpperWing" else .574519
        u, v = Grid(w, h)
        x = u * 15 - 7.5
        field = Field(w, h, 88, (12, 80, 320))
        ribPitch = self.wingData["upperFabric" if name == "UpperWing" else "lowerFabric"]["ribPitchM"]
        ribDistance = abs((x + ribPitch / 2) % ribPitch - ribPitch / 2)
        ribTape = np.exp(-(ribDistance / .018) ** 4)
        dirtRoot = Gaussian(u, v, .50, .75, .065, .22) * (.5 + field)
        leading = np.exp(-((v - .015) / .026) ** 2) * (.7 + field)
        pigment = self.paintData.get("lowerWingFinish", {}).get("baseSrgb", [.70, .715, .685]) if name == "LowerWingFabric" else [.70, .715, .685]
        base = np.ones((h, w, 3), np.float32) * np.array(pigment)
        base *= (1 + field[..., None] * .030 + ribTape[..., None] * .015)
        base -= (dirtRoot[..., None] * .035 + leading[..., None] * .012)
        rough = np.clip(.64 + field * .055 + ribTape * .035 + dirtRoot * .09, .48, .83)
        # The museum wing silver finish is glossier than the separate red/ink
        # pigments. Apply its constant factor before the authored paint
        # coverage overrides; no photographic brightness enters this map.
        if name == "UpperWing":
            rough *= self.paintData.get("wingFinish", {}).get("silverRoughnessFactor", 1.)
            rough *= np.where(np.abs(x) >= self.wingData["upperAileron"]["spanEndM"],
                              self.paintData.get("wingFinish", {}).get("tipSilverRoughnessFactor", 1.), 1.)
        metallic = np.full_like(u, .09)
        orm = np.stack((np.ones_like(u), rough, metallic), axis=2)
        image = Image.fromarray(RGB(base))
        if markings:
            draw = ImageDraw.Draw(image)
            paintData = self.paintData if markings == "upper" else {}
            raster = paintData.get("wingPaint", {})
            samples = max(1, int(raster.get("coverageSamples", 1)))
            # Lower-wing undersides are unphotographed reconstruction. Their
            # markings must fit the shorter lower span rather than being cut
            # by a tip through reuse of the upper-wing paint coordinates.
            spanCenterM = 6.192 if name == "UpperWing" else 5.10
            roundels = paintData.get("upperRoundels", {}).get("marks", [
                {"spanCentreM": centerX, "chordFraction": roundelChordFraction, "radiusM": .635}
                for centerX in (-spanCenterM, spanCenterM)])
            for roundel in roundels:
                centerX = float(roundel["spanCentreM"])
                chordFraction = float(roundel["chordFraction"])
                radius = float(roundel["radiusM"])
                array = np.asarray(image).copy()
                paint = np.stack((.64 + field * .025, .28 + field * .008, .275 + field * .009), axis=2)
                if samples > 1:
                    maskImage = Image.new("L", (w * samples, h * samples))
                    cx, cy = (centerX + 7.5) / 15 * w * samples, (1 - chordFraction) * h * samples
                    if "semiAxesM" in roundel:
                        a, b = roundel["semiAxesM"]
                        angle = math.radians(roundel["angleDegrees"])
                        side = -1 if centerX < 0 else 1
                        points = []
                        for t in np.linspace(0, math.tau, 361):
                            dx = a * math.cos(t) * math.cos(angle) - b * math.sin(t) * math.sin(angle)
                            dy = a * math.cos(t) * math.sin(angle) + b * math.sin(t) * math.cos(angle)
                            points.append((cx + side * dx / 15 * w * samples, cy - dy / chordM * h * samples))
                        ImageDraw.Draw(maskImage).polygon(points, fill=255)
                    else:
                        rx, ry = radius / 15 * w * samples, radius / chordM * h * samples
                        ImageDraw.Draw(maskImage).ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=255)
                    coverage = np.asarray(maskImage.resize((w, h), Image.Resampling.LANCZOS), np.float32) / 255
                    array = CompositeSrgbCoverage(array, RGB(paint), coverage)
                    orm[..., 1] = orm[..., 1] * (1 - coverage) + .67 * coverage
                    orm[..., 2] *= 1 - coverage
                else:
                    dx, dy = x - centerX, (v - chordFraction) * chordM
                    if "semiAxesM" in roundel:
                        dx *= -1 if centerX < 0 else 1
                        a, b = roundel["semiAxesM"]
                        angle = math.radians(roundel["angleDegrees"])
                        mask = ((dx * math.cos(angle) + dy * math.sin(angle)) / a) ** 2 + ((-dx * math.sin(angle) + dy * math.cos(angle)) / b) ** 2 < 1
                    else:
                        mask = dx ** 2 + dy ** 2 < radius ** 2
                    array[mask] = RGB(paint)[mask]
                    orm[mask, 1] = .67
                    orm[mask, 2] = .0
                image = Image.fromarray(array)
            if markings == "upper":
                # Independently observed hand-painted strokes, rectified onto
                # UV0. Only vector boundaries are used; the paint is authored
                # here, with no photographic colour, shadow or highlight.
                inkColor = tuple(raster.get("inkSrgb8", [24, 26, 24]))
                if samples > 1:
                    maskImage = Image.new("L", (w * samples, h * samples))
                    maskDraw = ImageDraw.Draw(maskImage)
                    for mark in paintData["marks"]:
                        maskDraw.polygon([(u * w * samples, (1 - v) * h * samples) for u, v in mark["uv0"]], fill=255)
                    coverage = np.asarray(maskImage.resize((w, h), Image.Resampling.LANCZOS), np.float32) / 255
                    image = Image.fromarray(CompositeSrgbCoverage(np.asarray(image), np.asarray(inkColor), coverage))
                    orm[..., 1] = orm[..., 1] * (1 - coverage) + .75 * coverage
                    orm[..., 2] *= 1 - coverage
                else:
                    draw = ImageDraw.Draw(image)
                    for mark in paintData["marks"]:
                        draw.polygon([(round(u * w), round((1 - v) * h)) for u, v in mark["uv0"]], fill=inkColor)
            if samples == 1:
                ink = np.max(np.asarray(image), axis=2) < 65
                orm[ink, 1] = .75
                orm[ink, 2] = .0
        self.Save(name, image, orm, [15, chordM], "Silver-doped fabric; rib tape, root handling dirt and leading-edge dust. Markings from the museum model, not a verified combat serial.", channels=("Base",) if name == "LowerWingFabric" else ("Base", "Orm"))

    def Fuselage(self):
        w, h = 4096, 1024
        u, v = Grid(w, h)
        field = Field(w, h, 281, (12, 80, 320))
        paintPath = Path(__file__).resolve().parents[1] / "Model/KawasakiType88/Data_KawasakiType88Paint.json"
        paintData = json.loads(paintPath.read_text(encoding="utf-8"))
        pigments = paintData.get("bodyPigments", {})
        base = np.ones((h, w, 3), np.float32) * np.array(pigments.get("fabricBaseSrgb", [.705, .72, .675]))
        base *= 1 + field[..., None] * .028
        rough = .65 + field * .045
        metal = np.full_like(u, .09)
        fore = u < ((-3.65 + 5.88) / 11.9)
        stations = np.asarray(self.cowlingData["powerStationsAftM"])
        power = np.interp(u[0] * 11.9 - 5.88, stations[:, 0], stations[:, 1])[None, :]
        fraction = self.cowlingData["hoodHalfWidthFraction"]
        if self.cowlingData.get("hoodHalfWidthFractionStationsAftM"):
            hoodStations = np.asarray(self.cowlingData["hoodHalfWidthFractionStationsAftM"])
            fraction = np.interp(u[0] * 11.9 - 5.88, hoodStations[:, 0], hoodStations[:, 1])[None, :]
        cutoff = np.arcsin(fraction ** (1 / power)) / math.tau
        top = (v < cutoff) | (v > 1 - cutoff)
        # This muted upper-cowling finish is a museum-reference appearance
        # choice; the coating identity has not been established from drawings.
        painted = fore & top
        silver = pigments.get("foreSilverSrgb", [.65, .665, .64])
        base[fore] = np.stack((silver[0] + field * .025, silver[1] + field * .025, silver[2] + field * .025), axis=2)[fore]
        # The selected museum finish reads as silver paint rather than polished
        # bare metal. Keep the separate dark hood override below.
        rough[fore] = .55 + field[fore] * .06
        metal[fore] = .38
        foreUpper = np.asarray(pigments.get("foreUpperSrgb", [.66, .68, .69]), dtype=np.float32)
        base[painted] = (foreUpper[None, None, :] + field[..., None] * .012)[painted]
        rough[painted] = .45 + field[painted] * .045
        metal[painted] = .025
        dorsalHalf = pigments.get("dorsalHalfCircumference", .125)
        dorsal = (~fore) & ((v < dorsalHalf) | (v > 1 - dorsalHalf))
        dorsalUpper = np.asarray(pigments.get("dorsalUpperSrgb", [.66, .68, .69]), dtype=np.float32)
        base[dorsal] = (dorsalUpper[None, None, :] + field[..., None] * .012)[dorsal]
        rough[dorsal] = .55 + field[dorsal] * .045
        metal[dorsal] = .025
        # Oil belongs behind/below the engine and the radiator, never as a
        # uniform all-airframe brown noise layer.
        oil = Gaussian(u, v, .19, .50, .095, .075) * np.clip(.60 + field * 2, 0, 1)
        base -= oil[..., None] * np.array([.065, .072, .064])
        rough -= oil * .17
        # Small aluminium oxidation around the forward service panel seams.
        seam = np.exp(-((u - .183) / .0025) ** 2) * fore
        base += seam[..., None] * .025
        rough += seam * .08
        image = Image.fromarray(RGB(base))
        roundels = self.paintData.get("bodyRoundels", {}).get("marks", [
            {"circumferenceFraction": side, "centreAftM": .37, "semiAxesM": [.41, .29], "angleDegrees": 0., "legacyRaster": True}
            for side in (.263, .737)])
        for roundel in roundels:
            side = roundel["circumferenceFraction"]
            array = np.asarray(image).copy()
            pigment = paintData.get("bodyRoundelFinish", {}).get("baseSrgb", [.64, .28, .275])
            roundelPaint = np.stack((pigment[0] + field * .024, pigment[1] + field * .006, pigment[2] + field * .007), axis=2)
            if roundel.get("legacyRaster", False):
                mask = (((u * 11.9 - 5.88) - roundel["centreAftM"]) / roundel["semiAxesM"][0]) ** 2 + ((v - side) * 2.60 / roundel["semiAxesM"][1]) ** 2 < 1
                array[mask] = RGB(roundelPaint)[mask]
                rough[mask] = .66
                metal[mask] = 0
            else:
                samples = 4
                maskImage = Image.new("L", (w * samples, h * samples))
                if "uv0" in roundel:
                    points = [(x * w * samples, (1 - y) * h * samples) for x, y in roundel["uv0"]]
                else:
                    cx, cy = (roundel["centreAftM"] + 5.88) / 11.9 * w * samples, (1 - side) * h * samples
                    a, b = roundel["semiAxesM"]
                    angle = math.radians(roundel["angleDegrees"])
                    points = []
                    for t in np.linspace(0, math.tau, 361):
                        dx = a * math.cos(t) * math.cos(angle) - b * math.sin(t) * math.sin(angle)
                        dy = a * math.cos(t) * math.sin(angle) + b * math.sin(t) * math.cos(angle)
                        points.append((cx + dx / 11.9 * w * samples, cy - dy / 2.6 * h * samples))
                ImageDraw.Draw(maskImage).polygon(points, fill=255)
                coverage = np.asarray(maskImage.resize((w, h), Image.Resampling.LANCZOS), np.float32) / 255
                array = CompositeSrgbCoverage(array, RGB(roundelPaint), coverage)
                rough = rough * (1 - coverage) + .66 * coverage
                metal *= 1 - coverage
            image = Image.fromarray(array)
            rot = 180 if side < .5 else 0
            if not paintData.get("bodyMarks"):
                self.Stamp(image, "12", (1.45 + 5.88) / 11.9, side, .62 / 11.9, .30 / 2.60, (43, 43, 37), rot)
                self.Stamp(image, "（立川）", (4.13 + 5.88) / 11.9, side, 1.35 / 11.9, .29 / 2.60, (72, 73, 62), rot, True)
            draw = ImageDraw.Draw(image)
            # The tiny two service marks are only legible as linework in the
            # source. Their character content is not represented as known text.
            for z in (() if any(m["region"].startswith("Service") for m in paintData.get("bodyMarks", [])) else (-1.30, -.35)):
                cx, cy = (z + 5.88) / 11.9 * w, (1 - side) * h
                rw, rh = .31 / 11.9 * w, .12 / 2.60 * h
                draw.rectangle((cx - rw / 2, cy - rh / 2, cx + rw / 2, cy + rh / 2), outline=(86, 87, 74), width=2)
                draw.line((cx - rw * .35, cy + rh * .22, cx, cy - rh * .2, cx + rw * .28, cy), fill=(91, 91, 78), width=2)
        # Only the visible ink boundaries are rectified; the pigment colour is
        # authored independently so the photograph's lighting is not copied.
        bodyInk = np.zeros((h, w), bool)
        for region, defaultColor in (("Serial", (125, 120, 120)), ("Maker", (130, 128, 126)),
                                     ("ServiceForward", (110, 108, 100)), ("ServiceAft", (110, 108, 100))):
            color = tuple(pigments.get(region, defaultColor))
            maskImage = Image.new("L", (w, h))
            maskDraw = ImageDraw.Draw(maskImage)
            for mark in paintData.get("bodyMarks", []):
                if mark["region"] == region:
                    maskDraw.polygon([(round(x * (w - 1)), round((1 - y) * (h - 1))) for x, y in mark["uv0"]], fill=0 if mark["hole"] else 255)
            image.paste(color, mask=maskImage)
            bodyInk |= np.asarray(maskImage) > 0
        ink = ((np.max(np.asarray(image), axis=2) < 110) & (~fore)) | bodyInk
        rough[ink], metal[ink] = .75, 0
        orm = np.stack((np.ones_like(u), np.clip(rough, .1, .9), metal), axis=2)
        self.Save("Fuselage", image, orm, [11.9, 2.6], "Body fabric and metal engine panels; darker painted top, localized oil, restrained panel oxidation. Serial/manufacturer legend follows the museum model.")

    def Fin(self):
        w, h = 2048, 1024
        u, v = Grid(w, h)
        field = Field(w, h, 122, (8, 40, 180))
        base = np.ones((h, w, 3), np.float32) * np.array([.705, .72, .675])
        base *= 1 + field[..., None] * .03
        image = Image.fromarray(RGB(base))
        paintPath = Path(__file__).resolve().parents[1] / "Model/KawasakiType88/Data_KawasakiType88Paint.json"
        paint = json.loads(paintPath.read_text(encoding="utf-8"))
        mask = Image.new("L", (w, h))
        draw = ImageDraw.Draw(mask)
        for mark in paint["finMarks"]:
            draw.polygon([(round(u * w), round((1 - v) * h)) for u, v in mark["uv0"]], fill=0 if mark["hole"] else 255)
        image.paste((112, 115, 101), mask=mask)
        orm = np.stack((np.ones_like(u), .65 + field * .05, np.full_like(u, .09)), axis=2)
        ink = np.asarray(mask) > 0
        orm[ink, 1] = .74
        orm[ink, 2] = 0
        ink = np.max(np.asarray(image), axis=2) < 120
        orm[ink, 1], orm[ink, 2] = .75, 0
        self.Save("Fin", image, orm, [4.4, 1.6], "Two-side atlas of visible museum-model tail ink; opposite-side placement inferred. The photograph's triangular dark areas are shadows, not albedo.")

    def Material(self, name, kind, color, roughness, metallic, variationScale=None):
        n = 1024
        u, v = Grid(n, n)
        field = Field(n, n, sum(map(ord, name)), (8, 48, 240))
        fine = Field(n, n, 600 + len(name), (128, 512))
        base = np.ones((n, n, 3), np.float32) * np.array(color)
        # The broad random field formerly made diagonal dark bands on the
        # museum model's otherwise even tail fabric. Keep its fine weave and
        # restrained pigment variation without inventing large stains.
        fieldStrength = variationScale if variationScale is not None else (.2 if name == "FabricPlain" else 1.)
        base *= 1 + field[..., None] * (.06 * fieldStrength)
        rough = roughness + field * (.10 * fieldStrength)
        metal = np.full_like(u, metallic)
        if kind == "wood":
            grain = np.sin(u * 155 + .65 * np.sin(v * 14) + field * 1.1)
            laminate = np.sin(u * 19 + .6 * np.sin(v * 5))
            base *= 1 + grain[..., None] * .055 + laminate[..., None] * .07
            rough += grain * .035
        elif kind == "rubber":
            tread = np.exp(-((v - .5) / .23) ** 4)
            dust = np.clip(field * 2 + .10, 0, .45) * tread
            base += dust[..., None] * np.array([.045, .040, .03])
            rough += dust * .12
        elif kind == "leather":
            contact = np.exp(-((u - .25) / .14) ** 2)
            base += contact[..., None] * np.array([.028, .018, .009])
            base += fine[..., None] * .008
            rough -= contact * .11
        elif kind == "exhaust":
            heat = np.exp(-((v - .15) / .21) ** 2)
            rust = np.clip(field * 3 + .22, 0, 1)
            base = base * (1 - rust[..., None] * .30) + rust[..., None] * np.array([.048, .018, .006])
            base += heat[..., None] * np.array([.012, .008, .016])
            rough += rust * .20
            metal *= 1 - rust * .85
        elif kind == "aluminum":
            brush = np.sin(u * 1400 + np.sin(v * 90)) * .004
            base += brush[..., None]
            oxide = np.clip(field - .15, 0, .30)
            base += oxide[..., None] * .04
            rough += oxide * .18
            metal -= oxide * .12
        elif kind == "steel":
            # Clean structural wire/strut steel has restrained scratches. The
            # separate exhaust material receives the visible rust and heat.
            scratch = (np.sin(u * 900 + v * 4) > .997).astype(np.float32)
            base += scratch[..., None] * .018
            rough -= scratch * .09
        orm = np.stack((np.ones_like(u), np.clip(rough, .15, .95), np.clip(metal, 0, 1)), axis=2)
        self.Save(name, base, orm, [.20, .20], "Part-specific " + kind + " surface; UV detail scale is specified by the Blender recipe.")

    def DetailNormal(self, name, kind, tileM, amplitudeM):
        n = 512
        u, v = Grid(n, n)
        field = Field(n, n, len(name) * 139, (16, 64, 256))
        if kind == "cloth":
            # 0.65 mm yarn spacing on 83.2 mm of cloth, with crossed warp/weft.
            warp, weft = np.sin(u * math.tau * 128), np.sin(v * math.tau * 128)
            height = amplitudeM * (.65 * warp * weft + field * .4)
        elif kind == "wood":
            height = amplitudeM * (np.sin(u * 150 + np.sin(v * 14) + field) + field * .35)
        elif kind == "leather":
            height = amplitudeM * (field + .15 * np.sin(u * 400) * np.sin(v * 380))
        elif kind == "aluminum":
            height = amplitudeM * (.25 * field + np.sin(u * 900 + np.sin(v * 36)) * .3)
        elif kind == "exhaust":
            height = amplitudeM * (field * 1.5 + np.clip(field + .1, 0, 1) ** 2 * 2)
        else:
            height = amplitudeM * field
        image = Image.fromarray(NormalFromHeight(height, tileM))
        path = self.root / f"Texture_Type88{name}Normal.png"
        image.save(path, compress_level=6)
        self.records.append({"file": path.name, "channel": "Normal", "pixels": image.size,
                             "metersPerTile": tileM, "heightAmplitudeM": amplitudeM,
                             "description": kind + " tangent-space microstructure; no lighting",
                             "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})

    def Run(self):
        self.Wing("UpperWing", "upper")
        self.Wing("Fabric", None)
        self.Wing("LowerWingFabric", None)
        self.Wing("LowerUnderside", "roundels")
        self.Fuselage()
        self.Fin()
        self.Material("FabricPlain", "cloth", (.705, .72, .675), .65, .09)
        self.Material("Aluminum", "aluminum", (.64, .66, .64), .42, .72)
        self.Material("Steel", "steel", (.115, .13, .13), .48, .80)
        # The selected museum view shows grey outer pipe walls rather than
        # near-black rusty stems. This coating response reconstructs that view;
        # it is not a claim about the service aircraft's exhaust alloy or paint.
        self.Material("Exhaust", "exhaust", (.58, .56, .54), .60, .10)
        self.Material("Wood", "wood", (.19, .065, .035), .36, 0)
        self.Material("Leather", "leather", (.09, .044, .025), .59, 0)
        self.Material("Rubber", "rubber", (.035, .039, .039), .82, 0)
        self.Material("Cockpit", "steel", (.699, .724, .712), .66, .12)
        self.Material("CockpitLining", "cloth", (.23, .25, .24), .74, .03)
        # The museum enclosure reads as silver paint. A lower conductive
        # fraction restores its diffuse response without adding baked light
        # or a view-specific emissive correction.
        self.Material("LowerHousing", "aluminum", (.692, .708, .682), .55, .09)
        for name, finish in self.cockpitData.get("finishes", {}).items():
            self.Material(name, finish["kind"], tuple(finish["baseSrgb"]), finish["roughness"],
                          finish["metallic"], variationScale=finish.get("variationScale", .2))
        if self.cowlingData.get("jointFinish"):
            finish = self.cowlingData["jointFinish"]
            self.Material("CowlingJoint", "steel", tuple(finish["baseSrgb"]), finish["roughness"],
                          finish["metallic"], variationScale=finish.get("variationScale", .2))
        for args in [("Fabric", "cloth", .0832, .000030), ("Aluminum", "aluminum", .20, .000012),
                     ("Steel", "steel", .20, .000025), ("Exhaust", "exhaust", .20, .00018),
                     ("Wood", "wood", .20, .000055), ("Leather", "leather", .0832, .00013),
                     ("Rubber", "rubber", .20, .000065)]:
            self.DetailNormal(*args)
        paintPath = Path(__file__).resolve().parents[1] / "Model/KawasakiType88/Data_KawasakiType88Paint.json"
        manifest = {"version": VERSION, "generator": str(Path(__file__).name), "albedoContainsLighting": False,
                    "wingFinish": self.paintData.get("wingFinish", {}),
                    "lowerWingFinish": self.paintData.get("lowerWingFinish", {}),
                    "bodyRoundelFinish": self.paintData.get("bodyRoundelFinish", {}),
                    "bodyRoundels": self.paintData.get("bodyRoundels", {}),
                    "bodyRecipe": {"file": self.bodyPath.name, "sha256": hashlib.sha256(self.bodyPath.read_bytes()).hexdigest(), "scope": self.bodyData.get("sideTaper", {}).get("scope", "Legacy body side sections"), "roofShoulder": self.bodyData.get("roofShoulder", {})},
                    "upperRoundels": self.paintData.get("upperRoundels", {}),
                    "cowlingRecipe": {"file": self.cowlingPath.name, "sha256": hashlib.sha256(self.cowlingPath.read_bytes()).hexdigest(), "hoodHalfWidthFraction": self.cowlingData["hoodHalfWidthFraction"], "hoodHalfWidthFractionStationsAftM": self.cowlingData.get("hoodHalfWidthFractionStationsAftM", [])},
                    "wingRecipe": {"file": self.wingPath.name, "sha256": hashlib.sha256(self.wingPath.read_bytes()).hexdigest(), "upperRibPitchM": self.wingData["upperFabric"]["ribPitchM"], "lowerRibPitchM": self.wingData["lowerFabric"]["ribPitchM"]},
                    "cockpitRecipe": {"file": self.cockpitPath.name, "sha256": hashlib.sha256(self.cockpitPath.read_bytes()).hexdigest(), "finishScope": self.cockpitData.get("finishScope", "Photo-derived cockpit coatings")},
                    "paintContours": {"file": paintPath.name, "sha256": hashlib.sha256(paintPath.read_bytes()).hexdigest(), "scope": "Visible museum wing, body and tail ink contours; constant authored paint colour. Opposite-side body/tail placement is inferred; indistinct maker strokes are not transcribed."},
                    "referenceScheme": "Kakamigahara Type 88-II scale model 12; not a verified Uchida squadron aircraft", "files": self.records}
        (self.root / "Data_SurfaceSources.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        print(json.dumps({"version": VERSION, "files": len(self.records), "root": str(self.root)}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-root", type=Path, default=DEFAULT_SOURCE)
    SurfaceBake(parser.parse_args().source_root).Run()
