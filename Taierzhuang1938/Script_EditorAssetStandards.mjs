// 资产规范只读编辑器：把源面数、实际面数、分类阈值、贴图策略与合规状态摆在同一张表。
// 不接管相机、不改运行时状态；数据来自 Data_AssetStandards + Data_Meshes。

import { Panel, Chips, Note, El } from "./Script_EditorUi.mjs";
import { MESHES } from "./Data_Meshes.mjs";
import {
  ASSET_STANDARD_GROUPS, ComplianceFor, EXTERNAL_GLB_STANDARDS, OTHER_ASSET_RULES,
  ReductionPercent, SOURCE_ASSET_STANDARDS, SPECIAL_TRIANGLE_TARGETS,
  ThresholdTriangleTarget, TRIANGLE_RULES,
} from "./Data_AssetStandards.mjs";

const Num = (value) => Number.isFinite(value) ? value.toLocaleString("en-US") : "—";

function ChangeLabel(source, actual) {
  const value = ReductionPercent(source, actual);
  if (value == null) return "—";
  if (value < -0.05) return `+${Math.abs(value).toFixed(1)}%（补件）`;
  return `${Math.max(0, value).toFixed(1)}%`;
}

function LimitLabel(id, record) {
  const special = SPECIAL_TRIANGLE_TARGETS[id];
  if (special != null) return `${Num(special)}（指定）`;
  const rule = record.group === "vehicle" ? TRIANGLE_RULES.vehicle : TRIANGLE_RULES.weapon;
  const target = ThresholdTriangleTarget(record.sourceTriangles, rule.limit);
  if (target === record.sourceTriangles && record.sourceTriangles > rule.limit) {
    return `${Num(target)}（5% 免减面）`;
  }
  return target < record.sourceTriangles
    ? `${Num(target)}（减面）` : `${Num(rule.limit)}（免减面）`;
}

function SourceRows(group) {
  return Object.entries(SOURCE_ASSET_STANDARDS)
    .filter(([, record]) => record.group === group)
    .map(([id, record]) => {
      const mesh = MESHES[id];
      const actual = mesh?.triangles ?? null;
      return {
        id, name: record.name, source: record.sourceTriangles, actual,
        limit: LimitLabel(id, record), change: ChangeLabel(record.sourceTriangles, actual),
        sourceTexture: record.sourceTexture, runtimeTexture: record.runtimeTexture,
        compliance: ComplianceFor(id, actual), note: record.note || "",
      };
    });
}

function ExternalRows() {
  return EXTERNAL_GLB_STANDARDS.map((record) => {
    const close = record.actualTriangles <= record.targetTriangles * 1.001
      && record.actualTriangles >= record.targetTriangles * 0.97;
    return {
      id: record.id, name: record.name, source: record.sourceTriangles,
      actual: record.actualTriangles,
      limit: record.policy === "source"
        ? `${Num(record.targetTriangles)}（原始拓扑）`
        : `${Num(record.targetTriangles)}（指定）`,
      change: ChangeLabel(record.sourceTriangles, record.actualTriangles),
      sourceTexture: record.sourceTexture, runtimeTexture: record.runtimeTexture,
      compliance: { label: close ? (record.policy === "source" ? "原始拓扑保留" : "指定目标达标") : "偏离登记目标", tone: close ? "good" : "bad" },
      note: `${record.pack}；${record.note}`,
    };
  });
}

function ProceduralRows() {
  return Object.entries(MESHES)
    .filter(([id]) => !SOURCE_ASSET_STANDARDS[id])
    .map(([id, mesh]) => {
      const limit = mesh.category === "soldier" ? 1800
        : mesh.category === "prop" ? 400
          : mesh.category === "vehicle" ? TRIANGLE_RULES.vehicle.limit : TRIANGLE_RULES.weapon.limit;
      return {
        id, name: id, source: null, actual: mesh.triangles,
        limit: `${Num(limit)}（分类）`, change: "—",
        sourceTexture: "不适用", runtimeTexture: "项目材质 / 资产登记材质",
        compliance: { label: mesh.triangles <= limit ? "分类预算内" : "超过分类预算", tone: mesh.triangles <= limit ? "good" : "bad" },
        note: mesh.note || "程序化 TZM，无外部原始模型可比。",
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function HeaderCell(text) {
  return El("th", "", text);
}

function RenderAssetTable(parent, rows) {
  const wrap = El("div", "edAssetTableWrap");
  const table = El("table", "edAssetTable");
  const head = El("thead");
  const header = El("tr");
  for (const label of ["资产", "原始面数", "实际面数", "限制 / 目标", "面数降幅", "自带贴图", "游戏内贴图", "状态"]) {
    header.appendChild(HeaderCell(label));
  }
  head.appendChild(header);
  table.appendChild(head);
  const body = El("tbody");
  for (const row of rows) {
    const tr = El("tr");
    tr.title = row.note;
    const asset = El("td", "asset");
    asset.appendChild(El("div", "name", row.name));
    asset.appendChild(El("div", "id", row.id));
    tr.appendChild(asset);
    tr.appendChild(El("td", "num", Num(row.source)));
    tr.appendChild(El("td", "num", Num(row.actual)));
    tr.appendChild(El("td", "num", row.limit));
    tr.appendChild(El("td", "num", row.change));
    tr.appendChild(El("td", "", row.sourceTexture));
    tr.appendChild(El("td", "", row.runtimeTexture));
    tr.appendChild(El("td", `status ${row.compliance.tone || ""}`, row.compliance.label));
    body.appendChild(tr);
  }
  table.appendChild(body);
  wrap.appendChild(table);
  parent.appendChild(wrap);
}

function RenderRuleCards(parent, group) {
  const cards = El("div", "edAssetRuleCards");
  for (const rule of OTHER_ASSET_RULES[group] || []) {
    const card = El("div", "edAssetRuleCard");
    card.appendChild(El("div", "title", rule.name));
    card.appendChild(El("div", "limit", rule.limit));
    card.appendChild(El("div", "texture", rule.texture));
    card.appendChild(El("div", "note", rule.note));
    cards.appendChild(card);
  }
  parent.appendChild(cards);
}

export class AssetStandardsEditor {
  static id = "assetStandards";
  static label = "资产规范";
  static hint = "原始/实际面数、减面阈值、目标、贴图策略与合规状态总表";

  constructor(host) {
    this.host = host;
    this.cameraMode = "none";
    this.group = "firearm";
    this.panel = null;
    this.content = null;
  }

  Enter(root) {
    this.panel = Panel({
      title: "资产规范与限制",
      sub: "只读 · Data_AssetStandards + Data_Meshes",
      variant: "work wide assetStandards",
      onClose: () => this.host.Close(),
    });
    root.appendChild(this.panel.root);
    this.content = this.panel.body;
    Chips(this.content, ASSET_STANDARD_GROUPS.map((entry) => ({ value: entry.id, label: entry.label })),
      this.group, (value) => { this.group = value; this.Render(); });
    this.dynamic = El("div");
    this.content.appendChild(this.dynamic);
    this.Render();
  }

  Render() {
    this.dynamic.innerHTML = "";
    if (this.group === "texture") {
      RenderRuleCards(this.dynamic, this.group);
      return;
    }
    if (this.group === "external") {
      RenderRuleCards(this.dynamic, this.group);
      const rows = ExternalRows();
      Note(this.dynamic, `四套外部 GLB 共 ${rows.length} 个可审计资产；原始/实际/目标/降幅与贴图策略均按最近一次真实烘焙登记。`, false);
      RenderAssetTable(this.dynamic, rows);
      return;
    }
    if (this.group === "procedural") {
      Note(this.dynamic, "程序化资产没有外部原模，原始面数与降幅不适用；实际面数仍逐项展示。", false);
      RenderAssetTable(this.dynamic, ProceduralRows());
      return;
    }
    const rows = SourceRows(this.group);
    const bad = rows.filter((row) => row.compliance.tone === "bad").length;
    const rule = this.group === "vehicle" ? TRIANGLE_RULES.vehicle : TRIANGLE_RULES.weapon;
    Note(this.dynamic, `${rule.rule} 当前 ${rows.length} 件，${bad ? `${bad} 件需处理` : "全部合规"}。`, bad > 0);
    Note(this.dynamic, "原始面数只统计游戏选定几何；排除的展示件/重复壳不会因“恢复原模”重新加入。鼠标停在资产行可看处理说明。", false);
    RenderAssetTable(this.dynamic, rows);
  }

  Update() {}

  Exit() {
    if (this.panel?.root) this.panel.root.remove();
    this.panel = null;
    this.content = null;
    this.dynamic = null;
  }
}

export default AssetStandardsEditor;
