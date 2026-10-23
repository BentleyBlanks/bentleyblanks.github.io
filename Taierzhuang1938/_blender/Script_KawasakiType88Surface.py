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


DEFAULT_SOURCE = Path(r"C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\KawasakiType88")
VERSION = "20261024Surface09"


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
        self.latinFont = Path("C:/Windows/Fonts/arial.ttf")
        self.cjkFont = Path("C:/Windows/Fonts/simsun.ttc")

    def Save(self, name, base, orm, physicalScale, description):
        if isinstance(base, np.ndarray):
            base = Image.fromarray(RGB(base))
        if isinstance(orm, np.ndarray):
            orm = Image.fromarray(RGB(orm))
        for channel, im in (("Base", base), ("Orm", orm)):
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
        chordM = 2.047 if name == "UpperWing" else 1.72
        roundelChordFraction = .4664 if name == "UpperWing" else .574519
        u, v = Grid(w, h)
        x = u * 15 - 7.5
        field = Field(w, h, 88, (12, 80, 320))
        ribDistance = abs((x + .1375) % .275 - .1375)
        ribTape = np.exp(-(ribDistance / .018) ** 4)
        dirtRoot = Gaussian(u, v, .50, .75, .065, .22) * (.5 + field)
        leading = np.exp(-((v - .015) / .026) ** 2) * (.7 + field)
        base = np.ones((h, w, 3), np.float32) * np.array([.70, .715, .685])
        base *= (1 + field[..., None] * .030 + ribTape[..., None] * .015)
        base -= (dirtRoot[..., None] * .035 + leading[..., None] * .012)
        rough = np.clip(.64 + field * .055 + ribTape * .035 + dirtRoot * .09, .48, .83)
        metallic = np.full_like(u, .09)
        orm = np.stack((np.ones_like(u), rough, metallic), axis=2)
        image = Image.fromarray(RGB(base))
        if markings:
            draw = ImageDraw.Draw(image)
            # Lower-wing undersides are unphotographed reconstruction. Their
            # markings must fit the shorter lower span rather than being cut
            # by a tip through reuse of the upper-wing paint coordinates.
            spanCenterM = 6.192 if name == "UpperWing" else 5.50
            for centerX in (-spanCenterM, spanCenterM):
                mask = ((x - centerX) ** 2 + ((v - roundelChordFraction) * chordM) ** 2) < .635 ** 2
                array = np.asarray(image).copy()
                paint = np.stack((.60 + field * .025, .23 + field * .008, .24 + field * .009), axis=2)
                array[mask] = RGB(paint)[mask]
                image = Image.fromarray(array)
                orm[mask, 1] = .67
                orm[mask, 2] = .0
            if markings == "upper":
                # Independently observed hand-painted strokes, rectified onto
                # UV0. Only vector boundaries are used; the paint is authored
                # here, with no photographic colour, shadow or highlight.
                paintPath = Path(__file__).resolve().parents[1] / "Model/KawasakiType88/Data_KawasakiType88Paint.json"
                paint = json.loads(paintPath.read_text(encoding="utf-8"))
                draw = ImageDraw.Draw(image)
                for mark in paint["marks"]:
                    draw.polygon([(round(u * w), round((1 - v) * h)) for u, v in mark["uv0"]], fill=(24, 26, 24))
            ink = np.max(np.asarray(image), axis=2) < 65
            orm[ink, 1] = .75
            orm[ink, 2] = .0
        self.Save(name, image, orm, [15, chordM], "Silver-doped fabric; rib tape, root handling dirt and leading-edge dust. Markings from the museum model, not a verified combat serial.")

    def Fuselage(self):
        w, h = 4096, 1024
        u, v = Grid(w, h)
        field = Field(w, h, 281, (12, 80, 320))
        base = np.ones((h, w, 3), np.float32) * np.array([.705, .72, .675])
        base *= 1 + field[..., None] * .028
        rough = .65 + field * .045
        metal = np.full_like(u, .09)
        fore = u < ((-3.65 + 5.88) / 11.9)
        top = (v < .195) | (v > .805)
        # This dark anti-glare cowling is a museum-reference colour choice.
        painted = fore & top
        base[fore] = np.stack((.65 + field * .025, .665 + field * .025, .64 + field * .025), axis=2)[fore]
        rough[fore] = .37 + field[fore] * .08
        metal[fore] = .72
        base[painted] = np.stack((.255 + field * .012, .285 + field * .012, .31 + field * .012), axis=2)[painted]
        rough[painted] = .45 + field[painted] * .045
        metal[painted] = .025
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
        for side in (.263, .737):
            # The angular tube's circumference here is approximately 2.60 m.
            mask = (((u * 11.9 - 5.88) - .37) / .41) ** 2 + ((v - side) * 2.60 / .29) ** 2 < 1
            array = np.asarray(image).copy()
            paint = np.stack((.60 + field * .024, .23 + field * .006, .24 + field * .007), axis=2)
            array[mask] = RGB(paint)[mask]
            image = Image.fromarray(array)
            rough[mask] = .66
            metal[mask] = 0
            rot = 180 if side < .5 else 0
            self.Stamp(image, "12", (1.45 + 5.88) / 11.9, side, .62 / 11.9, .30 / 2.60, (43, 43, 37), rot)
            self.Stamp(image, "（立川）", (4.13 + 5.88) / 11.9, side, 1.35 / 11.9, .29 / 2.60, (72, 73, 62), rot, True)
            draw = ImageDraw.Draw(image)
            # The tiny two service marks are only legible as linework in the
            # source. Their character content is not represented as known text.
            for z in (-1.30, -.35):
                cx, cy = (z + 5.88) / 11.9 * w, (1 - side) * h
                rw, rh = .31 / 11.9 * w, .12 / 2.60 * h
                draw.rectangle((cx - rw / 2, cy - rh / 2, cx + rw / 2, cy + rh / 2), outline=(86, 87, 74), width=2)
                draw.line((cx - rw * .35, cy + rh * .22, cx, cy - rh * .2, cx + rw * .28, cy), fill=(91, 91, 78), width=2)
        ink = (np.max(np.asarray(image), axis=2) < 110) & (~fore)
        rough[ink], metal[ink] = .75, 0
        orm = np.stack((np.ones_like(u), np.clip(rough, .1, .9), metal), axis=2)
        self.Save("Fuselage", image, orm, [11.9, 2.6], "Body fabric and metal engine panels; darker painted top, localized oil, restrained panel oxidation. Serial/manufacturer legend follows the museum model.")

    def Fin(self):
        w = h = 1024
        u, v = Grid(w, h)
        field = Field(w, h, 122, (8, 40, 180))
        base = np.ones((h, w, 3), np.float32) * np.array([.705, .72, .675])
        base *= 1 + field[..., None] * .03
        image = Image.fromarray(RGB(base))
        self.Stamp(image, "八八式偵察機", .61, .35, .40, .08, (73, 76, 64), cjk=True)
        orm = np.stack((np.ones_like(u), .65 + field * .05, np.full_like(u, .09)), axis=2)
        ink = np.max(np.asarray(image), axis=2) < 120
        orm[ink, 1], orm[ink, 2] = .75, 0
        self.Save("Fin", image, orm, [2.2, 1.6], "Museum-model tail legend; the photograph's triangular dark areas are treated as shadows, not painted into albedo.")

    def Material(self, name, kind, color, roughness, metallic):
        n = 1024
        u, v = Grid(n, n)
        field = Field(n, n, sum(map(ord, name)), (8, 48, 240))
        fine = Field(n, n, 600 + len(name), (128, 512))
        base = np.ones((n, n, 3), np.float32) * np.array(color)
        base *= 1 + field[..., None] * .06
        rough = roughness + field * .10
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
        self.Wing("LowerUnderside", "roundels")
        self.Fuselage()
        self.Fin()
        self.Material("FabricPlain", "cloth", (.705, .72, .675), .65, .09)
        self.Material("Aluminum", "aluminum", (.64, .66, .64), .42, .72)
        self.Material("Steel", "steel", (.115, .13, .13), .48, .80)
        self.Material("Exhaust", "exhaust", (.105, .085, .065), .73, .62)
        self.Material("Wood", "wood", (.19, .065, .035), .36, 0)
        self.Material("Leather", "leather", (.09, .044, .025), .59, 0)
        self.Material("Rubber", "rubber", (.035, .039, .039), .82, 0)
        self.Material("Cockpit", "steel", (.16, .19, .165), .66, .12)
        for args in [("Fabric", "cloth", .0832, .000030), ("Aluminum", "aluminum", .20, .000012),
                     ("Steel", "steel", .20, .000025), ("Exhaust", "exhaust", .20, .00018),
                     ("Wood", "wood", .20, .000055), ("Leather", "leather", .0832, .00013),
                     ("Rubber", "rubber", .20, .000065)]:
            self.DetailNormal(*args)
        paintPath = Path(__file__).resolve().parents[1] / "Model/KawasakiType88/Data_KawasakiType88Paint.json"
        manifest = {"version": VERSION, "generator": str(Path(__file__).name), "albedoContainsLighting": False,
                    "paintContours": {"file": paintPath.name, "sha256": hashlib.sha256(paintPath.read_bytes()).hexdigest(), "scope": "Legible museum wing numerals only; constant authored paint colour"},
                    "referenceScheme": "Kakamigahara Type 88-II scale model 12; not a verified Uchida squadron aircraft", "files": self.records}
        (self.root / "Data_SurfaceSources.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        print(json.dumps({"version": VERSION, "files": len(self.records), "root": str(self.root)}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-root", type=Path, default=DEFAULT_SOURCE)
    SurfaceBake(parser.parse_args().source_root).Run()
