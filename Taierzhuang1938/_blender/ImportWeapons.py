# -*- coding: utf-8 -*-
"""把外部枪模 / 冷兵器模（OBJ / glTF / FBX）收进武器规范系，再交给 WriteTzm。

坐标系与 BuildWeapons.py 一致：右手握把 = 原点、枪管沿 -Z、膛线轴 y = +0.035。
步枪还把枪托底板放到 z = +0.255；驳壳枪按原程序化模型，击锤后端约 z = +0.046。
冷兵器（kind="melee"）没有膛线轴：刀尖沿 -Z、柄尾放到 z = +0.270，
`muzzle` 挂点是**刀尖**（近战判定读它），y 跟着刀身的弯度走。

外部模型保留几何与材质分区。运行时给 steel/wood 分区绑定 512px authored PBR；
源包自带的 2K/4K 图不直接进 Pages，避免每把枪重复背一套大图。
"""

import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

from TzmCore import (
    AUTHORED_NORMAL_LAYER, Box, Decimate, Join, Node, Transform, TransformMatrix,
)

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.abspath(os.path.join(HERE, "..", "_import", "Source"))

BORE = 0.035
BUTT_Z = 0.255
PISTOL_REAR_Z = 0.046
MELEE_REAR_Z = 0.270
T_STEEL = "gunSteel"
T_WOOD = "gunWood"
BUDGET = 6000


def _ExternalRoot():
    """付费素材的存放处 —— **不在仓库里**。

    bentleyblanks.github.io 是公开站点，买来的原始模型文件不随仓库分发；
    仓库里只留它派生出的 `Model/*.tzm.json`（已重预算、丢源贴图、改绑共享 PBR）。
    做法沿用 Vefects 素材的先例，登记在 `_import/Data_SourceLicenses.md`。

    解析顺序：环境变量 `TZ1938_SOURCE_ASSETS` → 从本文件向上找同名兄弟目录
    （主仓库和 .claude/worktrees 下的工作树都能命中）。找不到就返回 None，
    `BuilderFor` 随之返回 None，构建自动退回程序化几何 —— 没买素材的人
    clone 下来照样跑得通。
    """
    env = os.getenv("TZ1938_SOURCE_ASSETS")
    if env and os.path.isdir(env):
        return env
    node = HERE
    while True:
        parent = os.path.dirname(node)
        if parent == node:
            return None
        candidate = os.path.join(parent, "Taierzhuang1938SourceAssets", "Weapons")
        if os.path.isdir(candidate):
            return candidate
        node = parent


def _Src(name, external=False):
    if external:
        root = _ExternalRoot()
        if root:
            return os.path.join(root, name)
        # 素材库不在这台机器上：返回一个**必然不存在**的路径，让 BuilderFor 的
        # os.path.isfile 落空、自动退回程序化几何。抛异常会把整条 BuildAll 打断，
        # 而"没有付费素材"是完全正常的状态，不该是错误。
        return os.path.join(SRC, "__external_missing__", name)
    return os.path.join(SRC, name)


# 每把枪对应一份可再分发的免费源。史实对应写在 Data_SourceLicenses.md。
#
# 外部模型的木/钢分区有三种喂法，按来源模型的结构选一种：
#   nameBucket —— 按**对象祖先节点名**分桶（Sketchfab 的 UModeler 拆件经常把
#                 All_Wood 整组挂在网格的父节点上，比材质名可靠）。
#   matName    —— 按**材质名**分桶（颜色写在 baseColorFactor 里的低模）。
#   colorSplit —— 按**面采样的漫反射颜色**分桶（整枪共用一张图、只有贴图里有木色）。
# 不带这三种的走 matIndex / 槽名启发式。所有源图的 2K/4K 贴图都不进 Pages，
# 运行时统一绑 steel/wood 两套 512px authored PBR（见 Data_SourceLicenses.md）。
SOURCES = {
    "ZhongZheng": {
        "file": os.path.join("Model_PolyHavenBoltActionRifle762",
                             "bolt_action_rifle_7_62_1k.gltf"),
        "lengthM": 1.110,
        "kind": "rifle",
        "colorSplit": True,
        "skip": ("bolt_action_rifle_7_62_scope", "bolt_action_rifle_7_62_wrap",
                 "bolt_action_rifle_7_62_bullet_54mm"),
        # 照门挂点 = 第一人称的瞄准线（见 _Mounts）。这一支换过模型源，数是照新几何量的：
        # 等开镜姿态收敛后，瞄准点上半窗 0.055→149、0.060→820、0.066→115、0.072→0。
        # （不是单调的：不同高度切到的是机匣桥、照门座、枪机三样不同的东西。）
        "mounts": {"sightY": 0.072},
        "note": "CC0 Bolt Action Rifle 7.62（Poly Haven）→ 中正式。去掉现代瞄准镜、"
                "包布与独立子弹，只保留木托、机匣、枪机、扳机和机械瞄具；"
                "全长按中正式史实 1.110 m 缩放。",
    },
    "HanYang": {
        "file": os.path.join("Model_Gewehr88", "scene.gltf"),
        "lengthM": 1.250,
        "kind": "rifle",
        "matName": {"Material": "wood", "Material.004": "steel", "Material.005": "steel",
                    "Material.006": "steel", "Material.007": "steel"},
        "noDetails": True,
        # 照门高度。**旧值 0.055（默认档）作废**：那是照"整支枪挂在准星左边"的
        # 那一版几何量的 —— 瞄准点当时压根不在枪上，扫 0.055—0.076 当然档档干净。
        # 2026-08-26 把枪对回瞄准线之后重量（同 Script_AdsSightTest 的上半窗指标）：
        # 0.050→663、0.054→528、0.058→818、0.062→159、0.066→95、0.070→0、0.074→0、
        # 0.078 起整窗也归零。取 0.072：上半窗干净，整窗仍留着五十来个像素 ——
        # 那是准星尖与照门肩，一副能读的照门/准星画面；再往上枪就整个沉出窗外了。
        "mounts": {"muzzleZ": -1.003, "gripZ": -0.418, "sightZ": -0.160,
                   "sightY": 0.072, "magY": BORE - 0.050, "magZ": -0.040},
        "note": "CC-BY Gewehr 88（Sketchfab / TastyTony）→ 汉阳八八式。整长套筒、"
                "曼利夏漏夹弹仓与露出式通条是八八式自带的剪影，不再用 Kar98k 拉长加套筒。"
                "全长按史实 1.250 m。",
    },
    "Type38": {
        "file": os.path.join("Model_Type38Arisaka", "scene.gltf"),
        "lengthM": 1.276,
        "kind": "rifle",
        # UModeler 拆件：木器整组叫 All_Wood，钢件按 End_Barrel / Receiver2 /
        # Front_Barrel / Bolt_Part / Trigger / Type38_Magazine 等组名分散。
        # 背带条按木色桶走（皮革/帆布读作棕件，别读成蓝钢条）。
        "nameBucket": {"All_Wood": "wood", "Sling_Front": "wood",
                       "Sling_BackStock": "wood", "Sling2": "wood"},
        # 照门高度。同汉阳造：**旧值 0.055（默认档）是照歪掉的几何量的**，
        # 那时瞄准点落在枪身左边的空气里。对回瞄准线后重量上半窗：
        # 0.054→418、0.058→542、0.062→144、0.066→0、0.070→0、0.074→0。
        # 取 0.070：上半窗干净，整窗还剩三百来个像素 —— 三八式那副护翼准星
        # 正好架在瞄准点下方，这是它该有的样子，不是遮挡。
        "mounts": {"muzzleZ": -1.029, "gripZ": -0.443, "sightZ": -0.185,
                   "sightY": 0.070, "magY": BORE - 0.036, "magZ": -0.060},
        # The first-person eye sits 140 mm behind the sight.  Keep the rear
        # receiver and stock as a separately named node so the viewmodel can
        # hide only that near-plane geometry while aiming; leaving it merged
        # into the steel/wood body turns its clipped cross-section into a
        # screen-filling rectangular block.
        "adsNearZ": -0.112,
        "note": "CC-BY Type 38 Arisaka rifle（Sketchfab / Snijboer）→ 三八式。"
                "防尘滑盖、直拉机柄、护翼准星、两道箍与通条齐备；全长按史实 1.276 m。",
    },
    "Zb26": {
        "file": os.path.join("Model_SketchfabZb26Larkien", "scene.gltf"),
        "lengthM": 1.165,
        "kind": "rifle",
        # Larkien 的模型把枪托和握把放在 Material，余下两个材质都是钢件。
        # 原模长轴沿 +X、Z 向上；roll=-1 把 Z 还原成游戏坐标的 +Y。
        "matName": {"Material": "wood"},
        # 这一层是 24k 三角的重复枪管细分壳，包在已有的主枪管 Cylinder_0 外面；
        # 深度 collapse 会把它拉成跨屏长刺。丢掉重复壳，保留下面的完整枪管。
        "skip": ("Cylinder.026_0",),
        "roll": -1.0,
        "noBevel": True,
        "noDetails": True,
        "autoSmooth": 34.0,
        # ZB-26 的上置弹匣占据正中，照门/准星与瞄准挂点都必须左偏。
        # -0.025 是照旧几何调的，而旧几何整体左偏 1.56 mm（见 _SymmetryPlaneX）；
        # 枪对回瞄准线后照门跟着右移同样多，这里补回去，照门缺口才仍在准星上。
        "mounts": {"gripZ": -0.470, "sightX": -0.0234, "sightY": 0.095,
                   "sightZ": -0.205, "magY": 0.155, "magZ": -0.118},
        "note": "CC-BY-4.0 ZB26（Sketchfab / Larkien）→ 捷克式。保留上置弹匣、"
                "两脚架、木托与机匣的来源轮廓；全长按史实 1.165 m，重预算到 6000 三角内。",
    },
    "Mauser96": {
        "file": os.path.join("Model_SketchfabMauserC96Maxence", "scene.gltf"),
        "lengthM": 0.288,
        "kind": "pistol",
        # 整枪共用一套 PBR；金属度贴图比漫反射颜色可靠（旧钢也会是棕色），
        # 用它把木握把面拆到 gunWood 桶。原模同样是 Z-up。
        "metalSplit": True,
        "metalMask": os.path.join("Model_SketchfabMauserC96Maxence", "Texture_MetalMask.png"),
        "roll": -1.0,
        "noBevel": True,
        "noDetails": True,
        "autoSmooth": 34.0,
        "mounts": {"sightY": 0.062},
        "note": "CC-BY-4.0 Mauser C96（Sketchfab / Maxence Rouillet）。"
                "保留来源模型的机匣、弹仓与扫帚柄轮廓；全长按史实 0.288 m。",
    },
    "Dadao": {
        # **付费素材，源文件不在仓库里**（见 _ExternalRoot 与 Data_SourceLicenses.md）。
        # 没有这份源就自动退回 BuildWeapons.BuildDadao 的程序化几何。
        "external": True,
        "file": os.path.join("CgmolDadao", "Model_CgmolDadao.fbx"),
        "lengthM": 0.900,
        "kind": "melee",
        # 整刀一个材质（材质.002），靠部件名分桶只为减面时保住细小握柄零件。
        # 写 TZM 时两桶重新并回专用 dadao 材质，并保留源 UV；运行时绑定从原包
        # 4K 贴图压成的 1K PBR。大刀的刀脊、刃口与缠柄都靠这套专用法线，不能
        # 再绑枪械共享的平铺钢/木纹。
        "nameBucket": {"刀把": "wood"},
        "noDetails": True,
        # 原包已经有完整的刃口/刀脊/护手倒角。枪械通用补倒角会再次切拓扑，
        # 不但徒增三角，还会把 FBX 的逐角法线插值坏。
        "noBevel": True,
        "sourcePbr": True,
        # 保留源模的 smooth 法线：专用法线贴图就是按这套切线基底烘焙的。
        # 这里若再按角度强制打硬边，刀面会被切成大块三角明暗。
        "note": "CGMOL 付费「PBR 次世代二十九军战刀」（作者 逍姚子不逍遥，版权：不限用途）"
                "→ 大刀。宽刃前展、上翘削尖、圆盘卡扣、缠柄、柄尾大铁环，"
                "正是二十九军/西北军那一路的制式；全长按史实 0.900 m。",
    },
    "DadaoAlt": {
        # 大刀的第二种式样，**只是外观变体**：大刀是各地铁匠按各自习惯打的，
        # 一个班里人手一把一模一样的刀反倒不像 1938。数值仍走 Data_Weapons.Dadao。
        "file": os.path.join("Model_SketchfabDadao", "scene.gltf"),
        "lengthM": 0.900,
        "kind": "melee",
        # 拆件名是俄文转写：Lezvie=刀身 / Stik=吞口 / Garda=护手 / Rukoiat=柄。
        "nameBucket": {"Rukoiat": "wood"},
        "noDetails": True,
        "autoSmooth": 32.0,
        "note": "CC-BY-4.0 Dadao（Sketchfab / Trector）→ 大刀第二式样。"
                "圆盘吞口、束节木柄、刃线较直的一路；全长同样按 0.900 m。",
    },
    "ServicePistol": {
        "file": os.path.join("Model_PolyHavenServicePistol", "service_pistol_1k.gltf"),
        "lengthM": 0.222,
        "kind": "pistol",
        # 页面里的上下两把其实是同一支枪的闭锁 / 空仓挂机状态。实战模型使用
        # pistol_a（套筒闭合），pistol_b 留作来源参考，不把一支开膛枪塞进枪套。
        "skip": ("service_pistol_pistol_b", "service_pistol_slide_b",
                 "service_pistol_hammer_b", "service_pistol_trigger_b",
                 "service_pistol_magazine_loaded", "service_pistol_magazine_empty",
                 "service_pistol_bullet"),
        # glTF 的长轴是 +X、Z 向上；这份源没有独立木件可供通用启发式判断
        # 前后，所以显式翻向。金属度贴图负责把握把面分到 wood 桶。
        "metalSplit": True,
        "metalMask": os.path.join("Model_PolyHavenServicePistol", "Texture_MetalMask.png"),
        "roll": -1.0,
        "flipForward": True,
        "noDetails": True,
        "mounts": {"sightY": 0.084, "sightZ": 0.030},
        # 不倒角。这支源模 7556 三角、预算 6000，本来就要减面；`_BevelForFirstPerson`
        # 会先把它涨到两万面，逼得减面比例掉到 0.28 —— 倒角出来的那圈高光当场
        # 被压成碎片，还顺手在枪口前戳出 16 mm 的尖刺。Poly Haven 这一支的
        # 硬表面转折自带真倒角，不需要再补一遍。
        "noBevel": True,
        "note": "CC0 Service Pistol（Poly Haven）。保留闭锁状态 A 的枪身、套筒、"
                "击锤与扳机，移除展示用弹匣、子弹及空仓挂机状态 B；全长 0.222 m。",
    },
}


def _ImportFile(path):
    ext = os.path.splitext(path)[1].lower()
    if ext == ".obj":
        bpy.ops.wm.obj_import(filepath=path)
    elif ext in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=path)
    elif ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=path)
    else:
        raise ValueError("不支持的枪模格式：%s" % path)


def _GuessMaterial(slot_name, index, mat_index, mat_name=None, forced=None):
    """决定一个面/零件的桶。优先级：强制桶（按节点名）→ 材质名表 → 槽索引表
    → 名称启发式（wood/stock/grab/grip/handle）→ 默认 steel。"""
    if forced:
        return forced
    if mat_name and slot_name in mat_name:
        return mat_name[slot_name]
    if mat_index and index in mat_index:
        return mat_index[index]
    name = (slot_name or "").lower()
    if any(key in name for key in ("wood", "stock", "grab", "grip", "handle")):
        return "wood"
    return "steel"


def _ObjectBucket(obj, name_bucket):
    """按对象自身的名字链（含祖先）匹配 nameBucket 的键。

    Sketchfab 导出把 UModeler 的部件组名放在**父节点**上，网格对象本身通常叫
    defaultMaterial —— 只读 obj.name 会全部落空。反例是重建的 Blender 命名
    defaultMaterial.008，所以链上任何一层命中都算数。
    """
    if not name_bucket:
        return None
    chain = []
    node = obj
    while node is not None:
        chain.append(node.name)
        node = node.parent
    for key, bucket in name_bucket.items():
        if any(key in name for name in chain):
            return bucket
    return None


def _BaseColorImage(material):
    """取 Principled BSDF 的 Base Color 纹理图像（导入的 glTF 材质）。"""
    if material is None or not material.use_nodes:
        return None
    tree = material.node_tree
    if tree is None:
        return None
    principled = None
    for node in tree.nodes:
        if node.type == "BSDF_PRINCIPLED":
            principled = node
            break
    if principled is not None:
        link = principled.inputs.get("Base Color")
        for conn in (link.links if link else []):
            if conn.from_node.type == "TEX_IMAGE" and conn.from_node.image:
                return conn.from_node.image
    for node in tree.nodes:
        if node.type == "TEX_IMAGE" and node.image:
            return node.image
    return None


def _ImageUpstream(material, input_name):
    """沿 Principled 指定输入反向找第一张图，允许中间夹 Separate Color。"""
    if material is None or not material.use_nodes or material.node_tree is None:
        return None
    principled = next((node for node in material.node_tree.nodes
                       if node.type == "BSDF_PRINCIPLED"), None)
    socket = principled.inputs.get(input_name) if principled is not None else None
    stack = [link.from_node for link in (socket.links if socket else [])]
    seen = set()
    while stack:
        node = stack.pop()
        if node in seen:
            continue
        seen.add(node)
        if node.type == "TEX_IMAGE" and node.image:
            return node.image
        for linked_input in node.inputs:
            stack.extend(link.from_node for link in linked_input.links)
    return None


def _SplitByColor(part, image, metallic=False):
    """把一份 bmesh 按漫反射采样色拆成 (steel, wood)。

    只用来喂"整枪只有一张贴图"的模型：木器在贴图里是棕的（r 明显大于 b），
    钢件是灰/蓝灰（r≈b）。采样的是 Blender 导入后的图像与 UV，双向一致，
    不需要额外翻转。tile 模式下 UV 会越界（>1 或 <0），取模到 [0,1)。
    """
    if image is None or image.size[0] < 1 or image.size[1] < 1:
        return part, None
    pixel_count = image.size[0] * image.size[1]
    pixels = image.pixels[:] or [0.0] * (pixel_count * 4)
    uv_layer = part.loops.layers.uv.active
    w, h = image.size
    steel = bmesh.new()
    wood = bmesh.new()
    steel_verts = {}
    wood_verts = {}

    def Target(bm, map_v, face):
        return (bm, map_v)

    for face in part.faces:
        if uv_layer is None:
            bucket = "steel"
        else:
            u = v = 0.0
            base = (0, 0)
            for loop in face.loops:
                u += loop[uv_layer].uv.x
                v += loop[uv_layer].uv.y
            u /= len(face.loops)
            v /= len(face.loops)
            x = min(w - 1, int((u % 1.0) * w))
            y = min(h - 1, int((v % 1.0) * h))
            idx = (y * w + x) * 4
            r, g, b = pixels[idx], pixels[idx + 1], pixels[idx + 2]
            if metallic:
                # glTF metallic-roughness 的 B 通道：非金属握把约 0，钢件约 1。
                bucket = "wood" if b < 0.45 else "steel"
            else:
                # 木色：红通道明显高于蓝，且红>绿>蓝的整体趋势
                bucket = "wood" if (r - b) > 0.05 and (r - g) > 0.015 else "steel"
        bm, remap = Target(wood if bucket == "wood" else steel,
                           wood_verts if bucket == "wood" else steel_verts, face)
        verts = [remap.setdefault(v.index, bm.verts.new(v.co)) for v in face.verts]
        try:
            new_f = bm.faces.new(verts)
            new_f.smooth = face.smooth
        except ValueError:
            pass  # 重复面：丢
    part.free()
    if not wood.faces:
        wood.free()
        wood = None
    if not steel.faces:
        steel.free()
        steel = None
    return steel, wood


def _WeldDistance(diagonal):
    """收料时的焊接距离。**按模型自己的尺度取，不许写死一个绝对值。**

    源模的单位五花八门 —— 三八式进来是 4747 单位长、大刀第二式样 2100、大刀 5.07、
    驳壳枪 6.75、汉阳造 3.02；真按米作者化的只有 Poly Haven 那两支（中正式 1.25、
    手枪 0.22）与三十年式刺刀（0.54）。统一缩放到史实全长是 `_Place` 的事，
    发生在这一步之后。所以同一个 1.5 mm 对四千单位长的模型等于「一点都不焊」，
    对 0.222 m 的手枪却是把 8224 个顶点焊成 2008 个：套筒、击锤、扳机、准星
    全糊进机匣，后面的倒角再把这坨糊涂几何炸成两万面、减面又把它压回六千 ——
    加载画面上那把认不出来的枪就是这么来的。

    取对角线的 0.15%（一米长的枪 = 1.5 mm，与历史值一致）。保留 1.5 的绝对上限，
    是为了让单位巨大的那几支一字节不变：它们今天拿到的就是「不焊」。真受影响的
    只有两支米制的小件 —— 手枪（这次要修的）与三十年式刺刀（收料面数不变，
    只多留下四个原本被并掉的接缝顶点；倒角跟着改了拓扑，成品 1344 → 1338 三角）。
    """
    return min(0.0015, max(1e-6, diagonal) * 0.0015)


def _Collect(mat_index=None, skip=(), name_bucket=None, mat_name=None, color_split=False,
             metal_split=False, metal_image=None, source_normals=False):
    """把场景里的网格按 steel/wood 收成两个 bmesh。跳过 skip 里的对象名。"""
    skip = {s.lower() for s in skip}
    buckets = {"steel": [], "wood": []}
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH":
            continue
        stem = obj.name.split(".")[0].lower()
        if obj.name.lower() in skip or stem in skip:
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        raw = bmesh.new()
        raw.from_mesh(mesh)
        if source_normals:
            authored = raw.loops.layers.float_vector.new(AUTHORED_NORMAL_LAYER)
            raw.faces.ensure_lookup_table()
            for polygon in mesh.polygons:
                face = raw.faces[polygon.index]
                for loop, loop_index in zip(face.loops, polygon.loop_indices):
                    loop[authored] = mesh.corner_normals[loop_index].vector
        TransformMatrix(raw, evaluated.matrix_world)
        evaluated.to_mesh_clear()
        raw.faces.ensure_lookup_table()
        forced = _ObjectBucket(obj, name_bucket)
        if color_split or metal_split:
            image = None
            if obj.material_slots and obj.material_slots[0].material:
                material = obj.material_slots[0].material
                image = (metal_image or _ImageUpstream(material, "Metallic") if metal_split
                         else _BaseColorImage(material))
            steel_part, wood_part = _SplitByColor(raw, image, metallic=metal_split)
            for bucket, part in (("steel", steel_part), ("wood", wood_part)):
                if part is not None and part.faces:
                    buckets[bucket].append(part)
            continue
        by_slot = {}
        for face in raw.faces:
            by_slot.setdefault(face.material_index, []).append(face)
        slots = obj.material_slots
        for slot_i, faces in by_slot.items():
            slot_name = ""
            if slot_i < len(slots) and slots[slot_i].material:
                slot_name = slots[slot_i].material.name
            material = _GuessMaterial(slot_name, slot_i, mat_index, mat_name, forced)
            part = raw.copy()
            drop = [f for f in part.faces if f.material_index != slot_i]
            bmesh.ops.delete(part, geom=drop, context="FACES")
            loose = [v for v in part.verts if not v.link_faces]
            if loose:
                bmesh.ops.delete(part, geom=loose, context="VERTS")
            if part.faces:
                buckets[material].append(part)
            else:
                part.free()
        raw.free()
    out = {}
    for material, parts in buckets.items():
        if not parts:
            continue
        out[material] = Join(*parts)
    # 导入模常有「枪管正好贴在机匣前脸」的共面缝，焊掉让审计当成一整块。
    # 距离对全部材质桶取同一个值（钢件和木件是同一把枪，不该有两套公差）。
    lo, hi = _Aabb(list(out.values()))
    dist = _WeldDistance((hi - lo).length)
    for joined in out.values():
        bmesh.ops.remove_doubles(joined, verts=joined.verts[:], dist=dist)
        joined.normal_update()
    return out


def _Aabb(bms):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for bm in bms:
        for vert in bm.verts:
            lo.x, lo.y, lo.z = min(lo.x, vert.co.x), min(lo.y, vert.co.y), min(lo.z, vert.co.z)
            hi.x, hi.y, hi.z = max(hi.x, vert.co.x), max(hi.y, vert.co.y), max(hi.z, vert.co.z)
    return lo, hi


def _Xform(bms, matrix):
    for bm in bms:
        TransformMatrix(bm, matrix)


def _AlignLongAxisToZ(bms, roll=1.0):
    lo, hi = _Aabb(bms)
    span = hi - lo
    axis = max(range(3), key=lambda i: span[i])
    if axis == 0:
        rot = Matrix.Rotation(-math.pi * 0.5, 4, "Y")
    elif axis == 1:
        rot = Matrix.Rotation(math.pi * 0.5, 4, "X")
    else:
        rot = Matrix.Identity(4)
    _Xform(bms, rot)
    # 长轴落位后，剩下两轴里跨度大的是「上下」。Sketchfab 的 Z-up 导出（没带
    # -90° 旋转包装）会把高度留在 X 上，枪就侧躺 —— 绕 Z 转 90° 放回 Y。
    # 方向由 roll（±1）控制，装进 SOURCES 便于按模型订正。
    lo, hi = _Aabb(bms)
    span = hi - lo
    if span[0] > span[1]:
        _Xform(bms, Matrix.Rotation(math.pi * 0.5 * roll, 4, "Z"))


def _FlipIfGripIsAbove(bms, wood, steel):
    """木握把 / 枪托腹应当在膛线轴下方。驳壳枪的扫帚柄尤其明显。"""
    if wood is None or steel is None or not wood.verts or not steel.verts:
        return
    wood_y = sum(v.co.y for v in wood.verts) / len(wood.verts)
    steel_y = sum(v.co.y for v in steel.verts) / len(steel.verts)
    if wood_y > steel_y:
        _Xform(bms, Matrix.Rotation(math.pi, 4, "Z"))


def _SlabStats(bms, z0, z1):
    """z0..z1 这一薄片的横截面外框面积与平均高度。判「哪头是枪口」用。"""
    lo_x = lo_y = 1e9
    hi_x = hi_y = -1e9
    total_y = 0.0
    count = 0
    for bm in bms:
        for vert in bm.verts:
            if z0 <= vert.co.z <= z1:
                lo_x = min(lo_x, vert.co.x); hi_x = max(hi_x, vert.co.x)
                lo_y = min(lo_y, vert.co.y); hi_y = max(hi_y, vert.co.y)
                total_y += vert.co.y
                count += 1
    if not count:
        return 0.0, 0.0
    return (hi_x - lo_x) * (hi_y - lo_y), total_y / count


def _OrientAllSteelFirearm(bms, slab=0.12):
    """没有木件的枪靠几何定向。

    `_FlipIfStockIsForward` / `_FlipIfGripIsAbove` 两条都拿木料当路标 ——
    枪托在 +Z、握把在膛线下方。Poly Haven 那支全钢手枪一块木头也没有，两条
    全走空，于是它在规范系里枪口朝 +Z、握把朝上，整整差一个绕 X 的 180°：
    `muzzle` 挂点落到握把底下，开火时枪焰从握把里喷、刺刀往后长。

    换两条不看材质的判据（对任何枪都成立，冷兵器除外，所以只在 kind != melee 调）：
      · 两端各取 12% 的薄片，横截面小的那头是枪管，它必须在 -Z；
      · 定完前后，枪口那片的中心必须**高于**全模中心 —— 膛线在上、握把在下。
    """
    lo, hi = _Aabb(bms)
    span = hi.z - lo.z
    if span <= 1e-6:
        return
    front_area, _ = _SlabStats(bms, lo.z, lo.z + span * slab)
    back_area, _ = _SlabStats(bms, hi.z - span * slab, hi.z)
    if front_area > back_area:
        _Xform(bms, Matrix.Rotation(math.pi, 4, "Y"))

    lo, hi = _Aabb(bms)
    span = hi.z - lo.z
    _, muzzle_y = _SlabStats(bms, lo.z, lo.z + span * slab)
    _, whole_y = _SlabStats(bms, lo.z, hi.z)
    if muzzle_y < whole_y:
        _Xform(bms, Matrix.Rotation(math.pi, 4, "Z"))


def _FlipIfStockIsForward(bms, wood):
    """木料重心应当靠近枪托（+Z）。驳壳枪的木握把也在后端。"""
    if wood is None or not wood.verts:
        return
    centroid = Vector((0.0, 0.0, 0.0))
    for vert in wood.verts:
        centroid += vert.co
    centroid /= len(wood.verts)
    if centroid.z < 0.0:
        _Xform(bms, Matrix.Rotation(math.pi, 4, "Y"))


def _SymmetryPlaneX(steel, lo, hi, kind):
    """量这把枪的**对称面**在 x 上的位置（膛线、前后照门都长在这个面上）。

    事故（2026-08-26）：这里原本是 `0.5 * (lo.x + hi.x)` —— 整模包围盒的中点。
    枪不是左右对称的：拉机柄只长在右边，汉阳造那根伸出 40 mm。包围盒中点因此被
    往右带，对中时整支枪反被推到左边。实测左移量：汉阳造 22.7 mm、三八式 27.4 mm、
    中正式 8.2 mm、捷克式 1.6 mm（驳壳枪与外购九毫米没有外露机柄，本来就是 0）。

    这不是"模型歪了一点点"：第一人称开镜是把 `sight` 挂点解到屏幕正中，而挂点
    钉在 x = 0。枪管真身在 x = -22.7 mm、离眼 0.30 m，开镜 FOV 只有 40.7° ——
    枪就整个挂在准星左边，玩家报的"放大以后枪靠左"就是这个数。第三人称同理：
    枪按 gripR(x=0) 塞进手里，枪身也跟着偏出手掌。

    对齐 y 的那一段（上面的 barrel_y）早就懂这个道理：它量的是**枪口那一段的
    钢件**，不是包围盒。x 照抄同一招 —— 枪口前 5% 只有枪管、准星（护翼）与前箍，
    这几样严格绕膛线轴对称，取它们 x 跨度的中点就是对称面。取中点而不是均值：
    准星护翼一边厚一边薄这种建模噪音会拉偏均值，跨度中点不受影响。

    冷兵器没有膛线也没有机柄（大刀本来就左右对称，实测中点 0.00 mm），
    仍走包围盒中点，不去动已经对的东西。
    """
    if kind == "melee" or steel is None or not steel.verts:
        return 0.5 * (lo.x + hi.x)
    cut = lo.z + (hi.z - lo.z) * 0.05
    xs = [v.co.x for v in steel.verts if v.co.z < cut]
    if len(xs) < 24:
        return 0.5 * (lo.x + hi.x)
    return 0.5 * (min(xs) + max(xs))


def _Place(bms, steel, wood, length_m, kind):
    lo, hi = _Aabb(bms)
    current = hi.z - lo.z
    if current < 1e-4:
        raise RuntimeError("导入的枪模厚度为零")
    _Xform(bms, Matrix.Diagonal((length_m / current, length_m / current, length_m / current, 1.0)))
    lo, hi = _Aabb(bms)

    if kind == "melee":
        rear_z = MELEE_REAR_Z
    elif kind == "rifle":
        rear_z = BUTT_Z
    else:
        rear_z = PISTOL_REAR_Z
    shift_z = rear_z - hi.z

    if kind == "melee":
        # 刀没有膛线轴，对齐的是**握把**：柄心落在 y=0，gripR/gripL 才不会悬在
        # 刀身外面。刀身自己的下沉弯度原样保留 —— 刀尖因此低于握把轴线，
        # `muzzle` 挂点跟着量出来的刀尖走，不硬钉回 0。
        grip = wood if (wood is not None and wood.verts) else steel
        shift_y = -sum(v.co.y for v in grip.verts) / len(grip.verts)
    else:
        barrel_y = BORE
        if steel is not None and steel.verts:
            muzzle_cut = lo.z + (hi.z - lo.z) * 0.12
            ys = [v.co.y for v in steel.verts if v.co.z < muzzle_cut]
            if ys:
                barrel_y = sum(ys) / len(ys)
        shift_y = BORE - barrel_y
    shift_x = -_SymmetryPlaneX(steel, lo, hi, kind)
    _Xform(bms, Matrix.Translation((shift_x, shift_y, shift_z)))


def _SplitIslands(bm):
    """按顶点连通把一张 bmesh 拆成若干独立 bmesh（原 bm 不动）。

    有些来源模型是几百个小壳体叠出来的 —— 全局 DECIMATE 的 ratio 是「总面数
    比例」，单壳体反复碰撞误差后整体根本减不动（捷克式实测卡在 0.70 上限）。
    逐个壳体减面才能真的到比例。
    """
    bm.verts.index_update()
    parent = list(range(len(bm.verts)))

    def Find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for edge in bm.edges:
        a, b = Find(edge.verts[0].index), Find(edge.verts[1].index)
        if a != b:
            parent[a] = b
    groups = {}
    for face in bm.faces:
        groups.setdefault(Find(face.verts[0].index), []).append(face)
    out = []
    for faces in groups.values():
        part = bm.copy()
        part.faces.index_update()
        keep = {f.index for f in faces}
        drop = [f for f in part.faces if f.index not in keep]
        bmesh.ops.delete(part, geom=drop, context="FACES")
        loose_v = [v for v in part.verts if not v.link_faces]
        if loose_v:
            bmesh.ops.delete(part, geom=loose_v, context="VERTS")
        loose_e = [e for e in part.edges if not e.link_faces]
        if loose_e:
            bmesh.ops.delete(part, geom=loose_e, context="EDGES")
        if part.faces:
            out.append(part)
    return out


def _DecimateToBudget(bms, budget=BUDGET):
    # OBJ 的面可能是四边，WriteTzm 会三角化；按 max(len(f.verts)-2, 1) 估三角数
    def Est(list_):
        return sum(sum(max(len(f.verts) - 2, 1) for f in bm.faces) for bm in list_)

    if Est(bms) <= budget:
        return None

    # 1) 按连通岛逐个减面。多壳体来源（Sketchfab 拆件模型 = 一两百个独立壳体）
    #    的全局 collapse 减到一半就停（捷克式实测卡在 0.70），因为壳与壳之间的
    #    互相穿插让 quadric 无处下手；**在干净的原始网格上**逐个壳体减才能到比例
    #    —— 顺序必须是先分岛、后全局，反过来（先全局后分岛）只会拿到被揉坏的网格。
    islands = []          # (bucketIndex, bmesh)
    for idx, bm in enumerate(bms):
        islands.extend((idx, part) for part in _SplitIslands(bm))
    movable = [(idx, part) for idx, part in islands if Est([part]) > 12]
    total = sum(Est([part]) for _, part in movable)
    if total > budget * 0.92:
        per_ratio = max(0.12, 0.85 * (budget * 0.92) / float(total))
        done = []
        for idx, part in islands:
            if Est([part]) <= 12:
                done.append((idx, part))
                continue
            reduced = Decimate(part, per_ratio)
            part.free()
            done.append((idx, reduced))
        buckets = {}
        for idx, part in done:
            buckets.setdefault(idx, []).append(part)
        merged = []
        for idx in sorted(buckets):
            merged.append(Join(*buckets[idx]))
        if Est(merged) <= budget:
            return merged
        # 分岛减面没达标也要**用这份结果**继续跑全局（不能 free 了再回头引用）
    else:
        merged = [bm for _, bm in islands]

    # 2) 兜底：全局 collapse 数轮（DECIMATE 的 ratio 按**面数**实现、预算按三角数，
    #    四边折算留 0.85 余量；减不动就收下这份结果，不硬压到塌质量）。
    replaced = list(merged)
    for _ in range(3):
        estimated = Est(replaced)
        if estimated <= budget:
            break
        ratio = max(0.12, 0.85 * (budget * 0.92) / float(estimated))
        prev_faces = sum(len(bm.faces) for bm in replaced)
        next_ = []
        for bm in replaced:
            decimated = Decimate(bm, ratio)
            bm.free()
            next_.append(decimated)
        unchanged = sum(len(bm.faces) for bm in next_) >= prev_faces
        replaced = next_
        if unchanged:
            break
    return replaced


def _AutoSmooth(bms, limit_deg):
    """按夹角重设逐面 smooth 标志 —— 来源模常常整件都是 smooth。

    源模靠自带的 4K 法线贴图撑硬表面细节，而本管线**丢掉源贴图**、只绑共享
    steel/wood PBR；继承过来的全 smooth 于是把刀背棱、护手边、刀尖斜切全部
    抹平：`TzmCore._ExtractLoops` 会把相邻 smooth 面的法线一并累加，刀身
    读起来就是一根糊掉的黑影，而不是"背厚刃薄"的楔子。

    TZM 只有逐面的 smooth，没有逐边锐边，所以判据是"**任何一条边**超过阈值
    这个面就转 flat"。阈值走 spec 的 autoSmooth，不开就不动 —— 已经调好的
    几把枪不跟着变字节。
    """
    limit = math.radians(limit_deg)
    for bm in bms:
        bm.normal_update()
        for face in bm.faces:
            sharp = False
            for edge in face.edges:
                if len(edge.link_faces) != 2:
                    continue
                if edge.calc_face_angle(0.0) > limit:
                    sharp = True
                    break
            face.smooth = not sharp


def _BevelForFirstPerson(bms):
    """Give hard-surface imports a real highlight roll instead of razor edges."""
    for bm in bms:
        candidates = []
        for edge in bm.edges:
            if len(edge.link_faces) != 2:
                continue
            if edge.calc_face_angle(0.0) > math.radians(28.0):
                candidates.append(edge)
        if not candidates:
            continue
        try:
            bmesh.ops.bevel(bm, geom=candidates, offset=0.00075, segments=2, affect="EDGES")
            bm.normal_update()
        except Exception as error:
            print("[ImportWeapons] bevel skipped: %s" % error)


def _AddJacket(steel, length_m):
    """汉阳造的套筒：φ32 薄壁，从机匣插到枪口附近。"""
    from BuildWeapons import TubeAlongZ
    muzzle_z = -(length_m - BUTT_Z)
    jacket = TubeAlongZ(-0.100, muzzle_z + 0.055, 0.0162, 0.0158, segments=10)
    steel = Join(steel, jacket)
    bmesh.ops.remove_doubles(steel, verts=steel.verts[:], dist=1e-4)
    steel.normal_update()
    return steel


def _AddHistoricalDetails(name, steel, wood, length_m):
    """Layer the recognisable service features onto the license-safe base meshes.

    The donor Kar98k has the right Mauser family proportions but omits the small
    parts which make a close-up read as a Zhongzheng rather than a generic game
    rifle.  These additions are deliberately separate, slightly embedded meshes:
    they keep the source licence boundary clean while giving the first-person
    silhouette real bands, guides and hardware.
    """
    from BuildWeapons import TubeAlongZ

    muzzle_z = -(length_m - BUTT_Z)
    steel_parts = []

    def SteelBox(w, h, d, *, x=0.0, y=0.0, z=0.0, rz=0.0):
        part = Box(w, h, d, bevel=0.0012, segments=2)
        Transform(part, x=x, y=y, z=z, rz=rz)
        steel_parts.append(part)

    if name == "ZhongZheng":
        # Clip guide and the two wide barrel bands identify the Mauser-standard
        # Chinese rifle in close view; a thin cleaning rod completes the fore-end.
        SteelBox(0.028, 0.008, 0.050, y=BORE + 0.028, z=-0.046)
        for z in (-0.315, -0.585):
            steel_parts.append(TubeAlongZ(z + 0.007, z - 0.007, 0.0172, 0.0172,
                                          segments=12, y=BORE))
        steel_parts.append(TubeAlongZ(-0.250, muzzle_z + 0.085, 0.0018, 0.0018,
                                      segments=8, y=BORE - 0.022))

    elif name == "HanYang":
        # The Gewehr-88-pattern jacket gets stepped retaining collars.  The
        # exposed cleaning rod and clip-guide stop the long rifle reading as an
        # up-scaled Kar98k.
        SteelBox(0.028, 0.008, 0.050, y=BORE + 0.028, z=-0.046)
        for z in (-0.345, -0.720):
            steel_parts.append(TubeAlongZ(z + 0.008, z - 0.008, 0.0176, 0.0176,
                                          segments=12, y=BORE))
        steel_parts.append(TubeAlongZ(-0.250, muzzle_z + 0.095, 0.0018, 0.0018,
                                      segments=8, y=BORE - 0.022))

    elif name == "Mauser96":
        # C96: long right-side extractor, rear sight base and lanyard boss.  The
        # source model has the major silhouette; these small forms supply the
        # recognisable machined planes at first-person distance.
        SteelBox(0.006, 0.006, 0.072, x=0.014, y=BORE + 0.024, z=-0.090)
        SteelBox(0.022, 0.012, 0.020, y=BORE + 0.022, z=-0.042)
        SteelBox(0.012, 0.010, 0.012, y=-0.082, z=0.018)
        if wood is not None:
            panels = []
            for side in (-1.0, 1.0):
                panel = Box(0.0038, 0.056, 0.060, bevel=0.0010, segments=2)
                Transform(panel, x=side * 0.0185, y=-0.042, z=-0.010, rz=0.10)
                panels.append(panel)
            wood = Join(wood, *panels)

    if steel_parts:
        steel = Join(steel, *steel_parts)
        bmesh.ops.remove_doubles(steel, verts=steel.verts[:], dist=1e-4)
        steel.normal_update()
    if wood is not None:
        bmesh.ops.remove_doubles(wood, verts=wood.verts[:], dist=1e-4)
        wood.normal_update()
    return steel, wood


def _TipY(steel, lo, hi):
    """量刀尖所在的高度：取最前 4% 那一段刀身顶点的平均 y。

    大刀的刃线是外鼓弧、刀背末段斜切，刀尖**不在握把轴线上**（程序化那把是
    y = -0.068）。近战判定和第一人称深度预算都读 `muzzle`，钉回 0 会让判定
    点浮在刀背上方，看起来砍到了其实没碰到。
    """
    if steel is None or not steel.verts:
        return 0.0
    cut = lo.z + (hi.z - lo.z) * 0.04
    ys = [v.co.y for v in steel.verts if v.co.z < cut]
    return sum(ys) / len(ys) if ys else 0.0


def _Mounts(node, length_m, kind, lo, hi, spec, steel=None):
    """挂空节点。默认值沿用历史枪模的通用配方；spec["mounts"] 里的键可逐项覆盖
    （muzzleZ / gripZ / sightX / sightY / sightZ / magY / magZ），
    与程序化 BuildWeapons.Mounts 对齐。

    **sightX / sightY 必须逐枪量，别信默认值**（2026-08-25）。第一人称开镜是把
    sight 挂点解到屏幕正中，于是它就是玩家的瞄准线；而通用值 BORE+0.020 只是
    "膛线上方 20 mm" 的一句猜测，跟每支模型照门实际在哪没有关系。
    量法：真开镜、抬头对着天光，数屏幕正中 41×41 里有多少像素是枪
    （Script_AdsSightTest.mjs 干的就是这件事）。改前实测：
    中正式 1528、驳壳枪 1209、汉阳造 136、三八式 42（唯一及格的，之前单独修过）。
    **换了模型源就要重量一次** —— 这些数是量某一份几何量出来的，不是通用常数。"""
    if kind == "melee":
        # 刀只有三个挂点：刀尖 + 双手。sight / magazine 对冷兵器没有意义，不挂。
        # gripR/gripL 的 z 抄程序化大刀（吞口之后 30 mm 与 155 mm），
        # 拳头不啃进护手，双手间距也够抡。
        defaults = {"muzzleZ": lo.z + 0.004, "gripRZ": 0.030, "gripLZ": 0.155}
        cfg = dict(defaults)
        cfg.update(spec.get("mounts") or {})
        muzzle_y = cfg.get("muzzleY")
        if muzzle_y is None:
            muzzle_y = _TipY(steel, lo, hi)
        node.Child("muzzle", t=(0.0, muzzle_y, cfg["muzzleZ"]))
        node.Child("gripR", t=(0.0, 0.0, cfg["gripRZ"]))
        node.Child("gripL", t=(0.0, 0.0, cfg["gripLZ"]))
        return

    muzzle_z = lo.z - 0.006
    if kind == "rifle":
        defaults = {"muzzleZ": muzzle_z, "gripZ": muzzle_z * 0.58,
                    "sightZ": -0.165 * (length_m / 1.110),
                    "magY": BORE - 0.045, "magZ": -0.055,
                    "sightX": 0.0, "sightY": BORE + 0.020}
    else:
        defaults = {"muzzleZ": muzzle_z, "gripZ": -0.055,
                    "sightZ": -0.078, "magY": BORE - 0.040, "magZ": -0.062,
                    "sightX": 0.0, "sightY": BORE + 0.020}
    cfg = dict(defaults)
    cfg.update(spec.get("mounts") or {})
    node.Child("muzzle", t=(0.0, BORE, cfg["muzzleZ"]))
    node.Child("gripR", t=(0.0, 0.0, 0.0))
    node.Child("gripL", t=(0.0, -0.012, cfg["gripZ"]))
    node.Child("sight", t=(cfg["sightX"], cfg["sightY"], cfg["sightZ"]))
    node.Child("magazine", t=(0.0, cfg["magY"], cfg["magZ"]))


def _SplitAdsNear(bm, cut_z):
    """Split faces behind ``cut_z`` into an ADS-only hide node.

    Imported rifles arrive as one bmesh per material.  At ADS the camera is
    intentionally aligned to the sight, so the rear receiver/stock straddles
    its near plane.  Keeping those faces in the normal body mesh produces a
    large clipped rectangle.  A face-level split retains the full asset for
    world/hip views and gives the first-person rig a precise hide target.
    """
    body = bm.copy()
    near = bm.copy()
    for part, want_near in ((body, False), (near, True)):
        drop = []
        for face in part.faces:
            center_z = sum(vertex.co.z for vertex in face.verts) / len(face.verts)
            is_near = center_z > cut_z
            if is_near != want_near:
                drop.append(face)
        if drop:
            bmesh.ops.delete(part, geom=drop, context="FACES")
        loose = [vertex for vertex in part.verts if not vertex.link_faces]
        if loose:
            bmesh.ops.delete(part, geom=loose, context="VERTS")
        part.normal_update()
    return body, near


def BuildImported(name):
    spec = SOURCES[name]
    path = _Src(spec["file"], spec.get("external", False))
    if not os.path.isfile(path):
        raise FileNotFoundError(path)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _ImportFile(path)
    metal_image = None
    if spec.get("metalMask"):
        metal_image = bpy.data.images.load(_Src(spec["metalMask"]), check_existing=True)
    buckets = _Collect(spec.get("matIndex"), spec.get("skip", ()),
                       name_bucket=spec.get("nameBucket"),
                       mat_name=spec.get("matName"),
                       color_split=spec.get("colorSplit", False),
                       metal_split=spec.get("metalSplit", False),
                       metal_image=metal_image,
                       source_normals=spec.get("sourcePbr", False))
    if "steel" not in buckets:
        raise RuntimeError("%s 导入后没有钢件" % name)
    wood = buckets.get("wood")
    steel = buckets["steel"]
    bms = [bm for bm in (steel, wood) if bm is not None]
    _AlignLongAxisToZ(bms, spec.get("roll", 1.0))
    if spec.get("flipForward"):
        _Xform(bms, Matrix.Rotation(math.pi, 4, "Y"))
    _FlipIfStockIsForward(bms, wood)
    if spec["kind"] != "melee":
        # 刀的木件是握把，本来就骑在刀身轴线上，没有"握把该在膛线下方"这回事；
        # 让这条启发式跑，它会绕 Z 转 180° 把刃口翻上天。刃口朝向交给 roll。
        _FlipIfGripIsAbove(bms, wood, steel)
        if wood is None or not wood.verts:
            # 全钢枪：上面两条定向都拿不到路标，换几何判据。
            _OrientAllSteelFirearm(bms)
    _Place(bms, steel, wood, spec["lengthM"], spec["kind"])
    if not spec.get("noBevel"):
        _BevelForFirstPerson(bms)
    if spec.get("jacket") and steel is not None:
        steel = _AddJacket(steel, spec["lengthM"])
        bms = [bm for bm in (steel, wood) if bm is not None]
    if not spec.get("noDetails"):
        steel, wood = _AddHistoricalDetails(name, steel, wood, spec["lengthM"])
    bms = [bm for bm in (steel, wood) if bm is not None]
    decimated = _DecimateToBudget(bms)
    if decimated is not None:
        steel = decimated[0]
        wood = decimated[1] if len(decimated) > 1 else None
        bms = [bm for bm in (steel, wood) if bm is not None]
    if spec.get("autoSmooth"):
        # 放在减面之后：减面会重排拓扑，先标好的 smooth 标志会被揉乱。
        _AutoSmooth(bms, spec["autoSmooth"])
    lo, hi = _Aabb(bms)
    root = Node("root")
    body = root.Child("body")
    cut_z = spec.get("adsNearZ")
    if cut_z is not None:
        steel, near_steel = _SplitAdsNear(steel, cut_z)
        if wood is not None:
            wood, near_wood = _SplitAdsNear(wood, cut_z)
        else:
            near_wood = None
        ads_near = root.Child("adsNear")
        if near_wood is not None and near_wood.faces:
            ads_near.Add("wood", near_wood, tile=T_WOOD)
        elif near_wood is not None:
            near_wood.free()
        if near_steel.faces:
            ads_near.Add("steel", near_steel, tile=T_STEEL)
        else:
            near_steel.free()
    if spec.get("sourcePbr"):
        # 原包是一张完整 UV atlas：钢件和缠柄必须采样同一套贴图。材质桶合成
        # 一个 draw call，但仍让减面阶段按部件分开，避免小圆环先被大刀面吃掉预算。
        if wood is not None:
            body.Add("dadao", wood, tile="sourceUv")
        body.Add("dadao", steel, tile="sourceUv")
    else:
        if wood is not None:
            body.Add("wood", wood, tile=T_WOOD)
        body.Add("steel", steel, tile=T_STEEL)
    _Mounts(body, spec["lengthM"], spec["kind"], lo, hi, spec, steel)
    return root


def BuilderFor(name):
    spec = SOURCES.get(name)
    if not spec:
        return None
    if not os.path.isfile(_Src(spec["file"], spec.get("external", False))):
        return None

    def _Build():
        return BuildImported(name)
    _Build.__name__ = "BuildImported_%s" % name
    _Build.imported = True
    return _Build
