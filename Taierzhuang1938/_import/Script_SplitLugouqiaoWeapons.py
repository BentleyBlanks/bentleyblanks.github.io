"""Split the imported Lugouqiao MAX collection and preserve its authored maps.

The official Blender MAX extension is only needed by the preceding inspection
step.  This script consumes the two inspected ``.blend`` files so its output is
deterministic and never silently replaces source materials with project-wide
steel/wood recipes.

Environment variables:
    TAIERZHUANG_WEAPON_BLEND_APPLY     imported blend with matrices applied
    TAIERZHUANG_WEAPON_BLEND_NOAPPLY  imported blend with matrices preserved
    TAIERZHUANG_WEAPON_TEXTURE_DIR    original collection's texture directory
    TAIERZHUANG_WEAPON_SOURCE_OUT     repository source-output directory
    TAIERZHUANG_WEAPON_RUNTIME_OUT    repository runtime Texture directory
"""

from pathlib import Path
import hashlib
import json
import os
import shutil
import stat

import bpy


def required(name):
    value = os.environ.get(name, "")
    if not value:
        raise RuntimeError(f"{name} is required")
    return Path(value).resolve()


APPLY_BLEND = required("TAIERZHUANG_WEAPON_BLEND_APPLY")
NOAPPLY_BLEND = required("TAIERZHUANG_WEAPON_BLEND_NOAPPLY")
TEXTURE_DIR = required("TAIERZHUANG_WEAPON_TEXTURE_DIR")
SOURCE_OUT = required("TAIERZHUANG_WEAPON_SOURCE_OUT")
RUNTIME_OUT = required("TAIERZHUANG_WEAPON_RUNTIME_OUT")

# 2026-09-05：P38 / K98k / MK98 栓动步枪 / MK1（Bren 式轻机枪，曾误标高射炮）/ PJP 轻迫击炮
# 五件按考据不属于 1938 年 3 月，已从拆分清单与运行时贴图里移除；原始贴图仍按 TEXTURES 逐文件保存。
ASSETS = {
    "BrowningTripodAssembly": ("BROTRIPO009", APPLY_BLEND),
    "UnidentifiedMunition": ("Cylinder026", APPLY_BLEND),
    "OfficerSwordSet": ("Group146", APPLY_BLEND),
    "RingPommelDagger": ("Mesh_0300", APPLY_BLEND),
    "Type11": ("QEDQD", APPLY_BLEND),
    "Mauser96": ("Sphere001", APPLY_BLEND),
    "MediumMortar": ("sphere3", APPLY_BLEND),
}

TEXTURES = {
    "ammobox.dds": "Texture_LugouqiaoType11AmmoBox.dds",
    "body.dds": "Texture_LugouqiaoType11Body.dds",
    "body2.dds": "Texture_LugouqiaoType11BodyAlt.dds",
    "dl772.jpg": "Texture_LugouqiaoUnidentifiedBoltActionRifleBase.jpg",
    "fore.dds": "Texture_LugouqiaoType11Fore.dds",
    "Lug_reb.tga": "Texture_LugouqiaoWaltherP38Base.tga",
    "maose_d.tga": "Texture_LugouqiaoMauser96Base.tga",
    "maose_s.tga": "Texture_LugouqiaoMauser96Specular.tga",
    "MKCRMT.jpg": "Texture_LugouqiaoUnidentifiedAntiaircraftMetal.jpg",
    "Mkwood.jpg": "Texture_LugouqiaoUnidentifiedAntiaircraftWood.jpg",
    "PJP.jpg": "Texture_LugouqiaoLightMortarBase.jpg",
    "stripe01L.jpg": "Texture_LugouqiaoOfficerSwordBase.jpg",
    "Tex_0155_1.dds": "Texture_LugouqiaoRingPommelDaggerBase.dds",
    "Wp_Gun_Karabiner 98 Kurz_d.tga": "Texture_LugouqiaoKarabiner98kBase.tga",
    "Wp_Gun_Karabiner 98 Kurz_n.tga": "Texture_LugouqiaoKarabiner98kNormal.tga",
    "WW-100heqdf.jpg": "Texture_LugouqiaoUnidentifiedMunitionBase.jpg",
}

RUNTIME = {
    "LugouqiaoUnidentifiedMunition": "WW-100heqdf.jpg",
    "LugouqiaoOfficerSword": "stripe01L.jpg",
    "LugouqiaoRingPommelDagger": "Tex_0155_1.dds",
    "LugouqiaoType11AmmoBox": "ammobox.dds",
    "LugouqiaoType11Body": "body.dds",
    "LugouqiaoType11BodyAlt": "body2.dds",
    "LugouqiaoType11Fore": "fore.dds",
    "LugouqiaoMauser96": "maose_d.tga",
}


def descendants(root):
    result = [root]
    for child in root.children:
        result.extend(descendants(child))
    return result


def copy_source_textures():
    target = SOURCE_OUT / "Texture_Source"
    target.mkdir(parents=True, exist_ok=True)
    manifest = []
    for original, renamed in TEXTURES.items():
        source = TEXTURE_DIR / original
        if not source.is_file():
            raise FileNotFoundError(source)
        output = target / renamed
        if output.exists():
            output.chmod(stat.S_IWRITE | stat.S_IREAD)
        shutil.copyfile(source, output)
        payload = source.read_bytes()
        manifest.append({
            "sourceName": original,
            "preservedName": renamed,
            "bytes": len(payload),
            "sha256": hashlib.sha256(payload).hexdigest(),
        })
    (SOURCE_OUT / "Data_LugouqiaoWeaponTextures.json").write_text(
        json.dumps({"version": 1, "textures": manifest}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def relink_images():
    reverse = {key.casefold(): value for key, value in TEXTURES.items()}
    for image in bpy.data.images:
        stem = Path(bpy.path.abspath(image.filepath)).name.casefold()
        renamed = reverse.get(stem)
        if renamed:
            image.filepath = "//Texture_Source/" + renamed


def split_blends():
    SOURCE_OUT.mkdir(parents=True, exist_ok=True)
    for asset, (root_name, blend_path) in ASSETS.items():
        bpy.ops.wm.open_mainfile(filepath=str(blend_path))
        root = bpy.data.objects.get(root_name)
        if root is None:
            raise RuntimeError(f"missing root {root_name} in {blend_path}")
        keep = set(descendants(root))
        for obj in list(bpy.data.objects):
            if obj not in keep:
                bpy.data.objects.remove(obj, do_unlink=True)
        relink_images()
        output = SOURCE_OUT / f"Model_Lugouqiao{asset}.blend"
        bpy.ops.wm.save_as_mainfile(filepath=str(output), check_existing=False)
        print(f"split {root_name} -> {output.name}")


def save_runtime_image(source_name, output_name, colorspace="sRGB", file_format="JPEG", max_side=1024):
    image = bpy.data.images.load(str(TEXTURE_DIR / source_name), check_existing=False)
    copy = image.copy()
    copy.colorspace_settings.name = colorspace
    longest = max(copy.size)
    if longest > max_side:
        scale = max_side / longest
        copy.scale(max(1, round(copy.size[0] * scale)), max(1, round(copy.size[1] * scale)))
    output = copy
    if copy.channels == 1:
        values = list(copy.pixels)
        output = bpy.data.images.new(output_name, width=copy.size[0], height=copy.size[1], alpha=False)
        rgba = [channel for value in values for channel in (value, value, value, 1.0)]
        output.pixels.foreach_set(rgba)
        bpy.data.images.remove(copy)
    output.filepath_raw = str(RUNTIME_OUT / output_name)
    output.file_format = file_format
    output.save()
    bpy.data.images.remove(output)
    bpy.data.images.remove(image)


def solid_runtime_image(output_name, rgba):
    image = bpy.data.images.new(output_name, width=8, height=8, alpha=False)
    image.generated_color = rgba
    image.filepath_raw = str(RUNTIME_OUT / output_name)
    image.file_format = "PNG"
    image.save()
    bpy.data.images.remove(image)


def bake_specular_orm(source_name, output_name):
    source = bpy.data.images.load(str(TEXTURE_DIR / source_name), check_existing=False)
    if max(source.size) > 512:
        scale = 512.0 / max(source.size)
        source.scale(max(1, round(source.size[0] * scale)), max(1, round(source.size[1] * scale)))
    pixels = list(source.pixels)
    output_pixels = []
    for index in range(0, len(pixels), 4):
        specular = 0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2]
        output_pixels.extend((1.0, 1.0 - specular * 0.55, specular, 1.0))
    output = bpy.data.images.new(output_name, width=source.size[0], height=source.size[1], alpha=False)
    output.pixels.foreach_set(output_pixels)
    output.filepath_raw = str(RUNTIME_OUT / output_name)
    output.file_format = "PNG"
    output.save()
    bpy.data.images.remove(output)
    bpy.data.images.remove(source)


def bake_runtime_textures():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.image_settings.color_mode = "RGB"
    RUNTIME_OUT.mkdir(parents=True, exist_ok=True)
    for material, source in RUNTIME.items():
        save_runtime_image(source, f"Texture_{material}Base.jpg")
    # Shared neutral maps keep albedo-only source materials inside the normal
    # PBR loading path without inventing surface detail that was not authored.
    solid_runtime_image("Texture_LugouqiaoFlatNormal.png", (0.5, 0.5, 1.0, 1.0))
    solid_runtime_image("Texture_LugouqiaoMetalOrm.png", (1.0, 0.42, 0.88, 1.0))
    solid_runtime_image("Texture_LugouqiaoWoodOrm.png", (1.0, 0.78, 0.0, 1.0))
    bake_specular_orm("maose_s.tga", "Texture_LugouqiaoMauser96Orm.png")


copy_source_textures()
split_blends()
bake_runtime_textures()
print(f"Wrote {len(ASSETS)} split assets and {len(TEXTURES)} original texture files")
