# Taihang tile-model references

These reference boards were created before modeling so the Blender assets share one
historical and visual language. They are production references rather than textures
or final in-game renders.

## Reference boards

- `taihang-village-turnaround.png` — neutral village and headquarters village.
- `taihang-fortifications-turnaround.png` — completed pillbox, construction state,
  and compact county stronghold.
- `taihang-props-turnaround.png` — bandit stockade, railway module, locomotive, and
  mine-warning cluster.

The boards use the existing `taihang` winter concept art as their style reference.
They were generated with OpenAI's built-in image generation tool. The Blender models
should match their silhouettes, proportions, broad material blocks, and readable
details, while simplifying fine masonry and roof-tile detail into geometry/material
variation that survives a high tactical camera.

## Historical grounding

- China Military Network describes the North China occupation system as “railways as
  pillars, roads as chains, and blockhouses as locks,” which is why the pillbox,
  railway, and telegraph assets read as one modular system:
  <https://www.81.cn/js_208592/jdt_208593/16251125.html>
- Shanxi's traditional-village repair guidance notes that Taihang settlements commonly
  used local stone for courtyard and house walls, including dry masonry and overlapping
  stone-slab roofs. This drives the cold rubble-stone base and restrained roof palette:
  <https://www.lvliang.gov.cn/llxxgk/zfxxgk/xxgkml/gbmwj/zjj/fdzdgknr_55202/zcwjjjd_55206/202309/P020240527603371119741.pdf>
- The Ministry of Culture and Tourism highlights the regional identity of traditional
  stone houses in the southern Taihang Mountains:
  <https://zhuanti.mct.gov.cn/xcss2024_xcygj/henan/detail/7277.html>
- An official traditional-village overview records typical mountain construction using
  stone foundations and walls, timber upper structure, and small gray roof tiles:
  <https://www.hnls.gov.cn/contents/10422/445139.html>

## Modeling rules

- One Blender unit equals one current `render3d.mjs` world unit.
- Each exported asset root, including a complete village cluster, must remain below
  **2,000 evaluated triangles**.
- Geometry owns the long-range silhouette: roof pitch, courtyard wall, firing slits,
  scaffolding, crenellations, rails, and poles.
- Tiny masonry, snow, soot, and wear stay in material/color variation rather than dense
  geometry.
- Assets use Blender Z-up authoring and glTF Y-up export, with the origin centered at
  ground level.
- Final measured counts are written to `../models/polycounts.json`; numbers printed in
  a generated reference board are visual design annotations only.

## Target budgets

| Asset | Target triangles |
| --- | ---: |
| Neutral village | <= 1,800 |
| Headquarters village | <= 1,950 |
| Railway pillbox | <= 900 |
| Pillbox construction site | <= 1,100 |
| County stronghold | <= 1,800 |
| Bandit stockade | <= 1,700 |
| Railway module | <= 900 |
| Steam locomotive prop | <= 1,100 |
| Mine-warning cluster | <= 550 |
