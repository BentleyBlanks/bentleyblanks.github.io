# Gen3D — 《血战台儿庄》3D 资产生成管线（图生3D + 骨骼动画）

本目录是「ImageGen 参考图 → 混元3D 图生3D → glb → TZM → 游戏」的端到端
生成与验证工具集。目标是把**人物 + 枪械**的图片，自动变成能跑在
《血战台儿庄》既有渲染/动画管线里的 3D 角色，并证明**逐关节骨骼动画**
在该游戏范式（禁用 `SkinnedMesh`，动画靠运行时写关节 `rotation`）下成立。

## 为什么是 TZM，而不是直接吃 glTF

`Script_MeshLoad.mjs` 写在石头上的三条硬约束（错一条画面立刻出事）：

1. **不许 SkinnedMesh。** 深度/法线预通道用 `scene.overrideMaterial` 覆盖全场，
   蒙皮网格在那一 pass 会塌到原点。所以本管线**不产出蒙皮网格**。
2. **不许自己造材质。** 材质名（`uniform`/`skin`/`steel`/`shoe`/…）是 key，
   值由上层 `ActorMaterials` 注入。
3. **加载失败返回 null + console.warn，不抛。**

混元3D 给的是带 `skin` 的 glb。本管线把它拆成**关节刚体块**：每个关节一份
`Object3D`，它名下的三角面落到该关节的局部坐标系；运行时旋转关节即带动
对应几何——等价于「骨骼动画」但完全不用蒙皮。

## 目录文件

| 文件 | 角色 |
| --- | --- |
| `1938_Taierzhuang_battle__Chine_2026-08-19T14-07-10.png` | ImageGen 生成的参考图（1938 国军步兵持中正式步枪全身正面像），作为图生3D 的输入 |
| `BuddyCloud3dPatched.py` | 混元3D 生成客户端补丁版：在官方 `buddy-cloud.py` 基础上新增 `--image-file`（读本地图自动 base64，绕开 Windows 命令行长度上限），仅用图片提交图生3D |
| `GeneratedSoldier_20260819_223107.tzm.json` | **游戏可直接吃的产物**：1362 三角面、25 节点、24 网格块，含人形关节层级 |
| `Script_GlbToTzm.py` | 核心转换器：纯 Python（无 numpy）解析 glb → 按身高比例生成与 `Script_Actor` 对齐的骨架 → 按「三角面出现最多关节」归属 → 顶点落关节局部系 → 量化导出 TZM |
| `Script_GlbToTzm_SmokeTest.mjs` | 转换产物校验：format / 节点拓扑序 / 必需关节 / 解码无 NaN / 三角 ≤1800 / bounds 有限 |
| `Demo_TzmAnimation.html` | **骨骼动画演示**：用游戏真实 `LoadModel` 加载 tzm，运行时逐帧写关节 `rotation`，演示 Idle / Walk / Aim Rifle 三态；鼠标拖拽环绕、滚轮缩放 |
| `GeneratedSoldier_20260819_223107_viewer.html` | 用 `<model-viewer>` 预览原始 glb（需本地保留 `.glb`，见下方 .gitignore 说明） |

> 大体积二进制（`.glb` 约 29MB、`_obj.zip` 约 22MB、预览图）可被 `Script_GlbToTzm.py`
> 从 `.glb` 重新生成，故被本目录 `.gitignore` 排除，不入库。

## 关节骨架（与 Script_Actor Dimensions 对齐）

转换器按身高比例生成如下节点（`make_humanoid_skeleton`）：

```
root → body → hips → chest → neck → head → eyes
                    ├── shoulderL → elbowL → handL → gripL
                    ├── shoulderR → elbowR → handR → gripR
                    │              ├── weaponMount
                    │              └── slingBack
                    ├── thighL → calfL → footL → kneeL
                    └── thighR → calfR → footR → kneeR
```

带 `joint:true` 的节点（hips/chest/neck/shoulderL/R/elbowL/R/thighL/R/calfL/R）
是动画驱动点；挂点（`gripL/R`、`weaponMount`、`eyes`、`kneeL/R`）只进树、不单独
驱动，枪口/握把/视线靠它们定位。Demo 与游戏上层都通过
`built.nodes.get("hips").rotation.y = …` 这类逐关节写法播放动画。

## 材质分配（启发式）

转换阶段按关节区域给材质名（须落在游戏白名单内）：

- `gripL/gripR/weaponMount/slingBack` → `steel`（枪械金属段）
- `head/handL/handR` → `skin`（脸/手）
- `footL/footR` → `shoe`（鞋）
- 其余 → `uniform`（军装）

无法可靠区分枪托木/枪管钢，整段武器挂点统一按 `steel`。这些值都已被游戏
材质库识别（`Script_MeshLoad` 的 `materials` 传入约定）。

## 三角预算与约束

- soldier ≤ 1800（当前产物 1362）。`--target-tris` 按比例把预算分配到各关节，
  再分别顶点聚类减面。
- 坐标系 Y-up，`-Z` 朝前（转换器默认 `--face-negative-z` 把 glTF 常见的
  `+Z` 朝前翻 180° 到 `-Z`）。
- 节点顺序严格父在前、子在后（拓扑序），否则 `InstantiateModel` 构建层级会乱。

## 重新生成（端到端）

```bash
# 1) 图生3D（混元3D）—— 用补丁版客户端，传本地参考图
python3 BuddyCloud3dPatched.py 3d \
    --image-file 1938_Taierzhuang_battle__Chine_2026-08-19T14-07-10.png \
    --token-stdin < YOUR_TOKEN   # token 走stdin，避免出现在进程列表

# 2) glb 落地后转 TZM（默认 1800 三角预算，朝 -Z）
python3 Script_GlbToTzm.py GeneratedSoldier_XXXX.glb \
    GeneratedSoldier_XXXX.tzm.json --name GeneratedSoldier --target-tris 1800

# 3) 校验产物
node Script_GlbToTzm_SmokeTest.mjs GeneratedSoldier_XXXX.tzm.json
```

> 原版官方 `buddy-cloud.py` 同时传 `prompt` + `image` 会报「参数不合法」，
> 图生3D 模式**只传图片**即可。`--image-file` 是补丁新增，官方版仅支持
> `--image-url`/`--image-base64`（base64 在 Windows 易超命令行长度上限）。

## 本地预览

`Demo_TzmAnimation.html` 与 `Script_MeshLoad.mjs` 共用 `../vendor/three`
（游戏自带 vendored three，**不依赖 CDN、不依赖 node_modules**）。需从
`Taierzhuang1938/` 目录起一个静态服务（ES module + fetch 不能用 file://）：

```bash
cd Taierzhuang1938
python3 -m http.server 18899
# 浏览器打开 http://127.0.0.1:18899/Gen3D/Demo_TzmAnimation.html
```

打开后点 Idle / Walk / Aim Rifle 切换姿态；鼠标拖拽环绕、滚轮缩放。
`GeneratedSoldier_..._viewer.html` 同理，但它需要同目录保留 `.glb`（被
`.gitignore` 排除，需本地留存或重新生成）。

## 接入游戏

上层拿到 `LoadModel` 返回后：

```js
const built = await LoadModel("./Gen3D/GeneratedSoldier_XXXX.tzm.json",
  { materials: factory.ActorMaterials("nra", rnd) });
if (built) {
  scene.add(built.root);
  built.nodes.get("chest").rotation.y = 0.2;   // 逐帧改关节，无 SkinnedMesh
}
```

动画系统与 `Script_Actor` 现有的逐关节写法完全兼容——本 Demo 的
`poseIdle/poseWalk/poseAim` 就是可直接搬进 Actor 状态机的参考实现。

## 已知限制

- **材质是启发式**：靠关节归属上色， rifle 若被归到手臂关节会是 `uniform`
  而非 `steel`；若要精确木/钢分区，需后续按网格标签细分。
- **减面会吞细节**：步枪等细件在高减面比下几何损失明显；要保枪械细节可单独
  生成武器、提高 `--target-tris` 或拆分人物/武器两次转换再挂载到 `gripL`。
- **无蒙皮**：肢体是刚体块，关节处会有轻微硬折；这是游戏硬约束下的取舍，
  不是 bug。
- 大二进制（`.glb`/`_obj.zip`）不入 git，靠上面命令可随时重建。
