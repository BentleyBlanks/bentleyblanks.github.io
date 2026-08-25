// 构件库预览器：把场景关卡编辑器能布设的每一种 Prop / 程序化构件 / tzm 模型
// 放进共用摄影棚逐项查看。预览走正片同一套 BuildSink 与模型实例化函数，不维护
// 第二份“预览专用”几何；这里不写关卡、不写地形，也不推进碰撞盒。

import * as THREE from "three";
import {
  Panel, Section, Chips, Toggle, ButtonRow, Facts, Note, ListBox,
  CameraProjectionControls,
} from "./Script_EditorUi.mjs";
import {
  PLACEABLE, PLACEABLE_CATEGORIES, MODEL_PLACEABLE, BuildPlaceableVisual,
} from "./Script_EditorScene.mjs";
import { MESHES, MeshUrl } from "./Data_Meshes.mjs";
import { LoadDocument } from "./Script_MeshLoad.mjs";
import { ExternalPropCatalog, InstantiateExternalProp } from "./Script_ExternalProps.mjs";

export class PropLibraryEditor {
  static id = "props";
  static label = "构件库预览";
  static hint = "逐项预览场景可布设的全部 Prop、构件与模型";

  constructor(host) {
    this.host = host;
    this.cameraMode = "studio";
    this.panel = null;
    this.externalCatalog = ExternalPropCatalog();
    this.entries = [
      // 持续烟火有自己的“特效预览”入口；构件摄影棚不驱动 VfxSystem，放进来只会空白。
      ...PLACEABLE.filter((entry) => !entry.effect),
      ...this.externalCatalog.map((entry) => ({
        id: `External_${entry.id}`, name: entry.label, cat: "外部道具",
        external: entry.id, url: entry.url, uses: [], defaults: {},
      })),
    ];
    this.categories = [...PLACEABLE_CATEGORIES.filter((category) => category !== "特效"), "外部道具"];
    this.cat = this.categories[0];
    this.paletteId = this.entries[0] ? this.entries[0].id : null;
    this.modelDocs = new Map();
    this.ownedGeometries = [];
    this.previewRoot = null;
    this.preview = null;
    this.previewToken = 0;
    this.disposed = false;
  }

  Enter(root) {
    this.disposed = false;
    this.host.studio.Open(this.host.hideInStudio || []);
    this.host.studio.SetGridVisible(true);
    this.host.SetViewmodelVisible(false);
    this.panel = Panel({
      title: "构件库预览器", sub: `${this.entries.length} 项 · 正片生成器`,
      variant: "work wide", onClose: () => this.host.Close(),
    });
    root.appendChild(this.panel.root);
    this.BuildUi(this.panel.body);
    this.ShowSelected();
    this.LoadModels();
    return this;
  }

  Exit() {
    this.disposed = true;
    this.ClearPreview();
    this.host.studio.Close();
    this.host.SetViewmodelVisible(true);
    if (this.panel) this.panel.root.remove();
    this.panel = null;
  }

  BuildUi(body) {
    const library = Section(body, "全部可布设构件");
    this.categoryChips = Chips(library, this.categories, this.cat,
      (value) => { this.cat = value; this.FillPalette(); });
    this.palette = ListBox(library, { height: 250, onPick: (id) => this.SetPalette(id) });
    this.FillPalette();
    Note(library, "这里展示的清单与场景关卡编辑器完全共用：程序化构件来自 Script_World，"
      + "模型来自 Data_Meshes；预览与实际布设不会分叉。");

    const camera = Section(body, "预览相机");
    this.gridToggle = Toggle(camera, "米格与地台", true,
      (on) => this.host.studio.SetGridVisible(on));
    this.projectionControls = CameraProjectionControls(camera, this.host.camera, {
      farMin: 30, farMax: 2000,
    });
    ButtonRow(camera, [
      { label: "上一个", onClick: () => this.StepSelection(-1) },
      { label: "下一个", onClick: () => this.StepSelection(1) },
      { label: "重新取景", onClick: () => this.FramePreview() },
    ]);

    const evidence = Section(body, "构件取证");
    this.facts = Facts(evidence);
    this.status = Note(evidence, "");
  }

  Entry(id) { return this.entries.find((entry) => entry.id === id) || null; }

  FillPalette() {
    const entries = this.entries.filter((entry) => entry.cat === this.cat);
    this.palette.Fill(entries.map((entry) => ({
      id: entry.id,
      name: entry.name,
      tail: entry.external ? "glb" : (entry.model ? "tzm" : "程序化"),
      title: entry.model && MESHES[entry.model] ? MESHES[entry.model].note : "",
    })));
    if (entries.length && !entries.some((entry) => entry.id === this.paletteId)) {
      this.paletteId = entries[0].id;
    }
    this.palette.Select(this.paletteId);
    this.ShowSelected();
  }

  SetPalette(id) {
    const entry = this.Entry(id);
    if (!entry) return;
    if (entry.cat !== this.cat) {
      this.cat = entry.cat;
      this.categoryChips.Set(this.cat);
      this.FillPalette();
    }
    this.paletteId = id;
    this.palette.Select(id);
    this.ShowSelected();
  }

  StepSelection(direction) {
    if (!this.entries.length) return;
    const current = Math.max(0, this.entries.findIndex((entry) => entry.id === this.paletteId));
    const next = (current + direction + this.entries.length) % this.entries.length;
    this.SetPalette(this.entries[next].id);
  }

  async LoadModels() {
    this.status.textContent = `模型载入中（${MODEL_PLACEABLE.length} 项）…`;
    await Promise.all(MODEL_PLACEABLE.map(async (id) => {
      const doc = await LoadDocument(MeshUrl(id));
      if (doc) this.modelDocs.set(id, doc);
    }));
    if (this.disposed) return;
    this.status.textContent = `已覆盖 ${this.entries.length} 项，其中 tzm 模型 `
      + `${this.modelDocs.size}/${MODEL_PLACEABLE.length}，外部 GLB ${this.externalCatalog.length}`;
    const entry = this.Entry(this.paletteId);
    if (entry && entry.model) this.ShowSelected();
  }

  ClearPreview() {
    for (const geometry of this.ownedGeometries) geometry.dispose();
    this.ownedGeometries.length = 0;
    if (this.previewRoot && this.previewRoot.parent) this.previewRoot.parent.remove(this.previewRoot);
    this.previewRoot = null;
    this.preview = null;
  }

  async ShowSelected() {
    if (!this.host.studio.Active) return;
    const token = ++this.previewToken;
    this.ClearPreview();
    const entry = this.Entry(this.paletteId);
    if (!entry) return;
    const item = {
      id: 0, type: entry.id, x: 0, z: 0, ry: 0, seed: `preview_${entry.id}`,
      ...(entry.defaults || {}),
    };
    const root = new THREE.Group();
    root.name = `PropLibrary_${entry.id}`;
    this.host.studio.stand.add(root);
    this.previewRoot = root;
    let built = null;
    if (entry.external) {
      this.status.textContent = `${entry.name} 载入中…`;
      const externalRoot = await InstantiateExternalProp(entry.external, this.host.library);
      if (this.disposed || token !== this.previewToken || !externalRoot) return;
      root.add(externalRoot);
      let meshes = 0;
      externalRoot.traverse((node) => { if (node.isMesh) meshes += 1; });
      built = { loaded: true, colliders: [], meshes };
      this.status.textContent = `${entry.name} · 带署名外部 GLB · 仅视觉`;
    } else {
      built = BuildPlaceableVisual(root, entry, item, {
        library: this.host.library,
        modelDocs: this.modelDocs,
        ownedGeometries: this.ownedGeometries,
      });
    }
    this.preview = built;

    if (!built.loaded) {
      this.status.textContent = `${entry.name} 的模型仍在载入`;
      this.RefreshFacts(entry, null);
      return;
    }
    const box = new THREE.Box3().setFromObject(root);
    if (!box.isEmpty()) {
      const center = box.getCenter(new THREE.Vector3());
      root.position.x -= center.x;
      root.position.z -= center.z;
      root.position.y -= box.min.y;
    }
    root.updateMatrixWorld(true);
    this.FramePreview();
    this.RefreshFacts(entry, new THREE.Box3().setFromObject(root));
  }

  FramePreview() {
    if (!this.previewRoot) return;
    const box = new THREE.Box3().setFromObject(this.previewRoot);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const height = Math.max(0.5, size.y);
    const span = Math.max(size.x, size.y, size.z, 1);
    this.host.studio.Frame(height, Math.max(2.4, span * 1.55));
  }

  RefreshFacts(entry, box) {
    if (!this.facts) return;
    const size = box && !box.isEmpty() ? box.getSize(new THREE.Vector3()) : null;
    this.facts.Set("构件", `${entry.id} · ${entry.name}`);
    this.facts.Set("类别", entry.cat);
    this.facts.Set("来源", entry.external ? entry.url
      : (entry.model ? `Model/${entry.model}.tzm.json` : "Script_World 程序化"));
    this.facts.Set("参数", (entry.uses || []).join(" / ") || "固定尺寸");
    this.facts.Set("网格", this.preview ? this.preview.meshes : 0);
    this.facts.Set("碰撞盒定义", this.preview ? this.preview.colliders.length : 0);
    this.facts.Set("包围尺寸", size
      ? `${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} m` : "载入中");
    this.facts.Set("库覆盖", `${this.entries.length} / ${this.entries.length}`, "good");
  }

  Update() {
    this.host.studio.ApplyCamera();
  }
}

export default PropLibraryEditor;
