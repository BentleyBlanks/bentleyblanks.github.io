import { Section, ButtonRow, Toggle, Slider, Note, Row } from "./Script_EditorUi.mjs";
import { WHITEBOX_CONTROLS, WHITEBOX_DEFAULTS, WhiteboxPassPlan } from "./Data_Tuning_Whitebox.mjs";
import { LoadWhiteboxConfig, SaveWhiteboxConfig } from "./Script_GraphicsProfile.mjs";

export function BuildWhiteboxQualityUi(settings, body) {
  const profile = settings.gfx.profile || settings.host.post?.quality || "high";
  const section = Section(body, "画质预设");
  Note(section, profile === "whitebox" ? "当前：白盒画质 · 下方可编辑并保存配置"
    : `当前：${profile} · 美术渲染`);
  ButtonRow(section, [
    { label: "白盒（默认）", cls: profile === "whitebox" ? "on" : "", onClick: () => settings.Reload("whitebox") },
    ...["low", "medium", "high", "ultra"].map((quality) => ({
      label: quality, cls: profile === quality ? "on" : "", onClick: () => settings.Reload(quality),
    })),
  ]);
  Note(section, "切换预设会刷新页面。美术迭代时选择 high / ultra；白盒配置会单独保留。");
  const editor = document.createElement("div");
  editor.hidden = true;
  editor.dataset.whiteboxEditor = "true";
  let built = false;
  ButtonRow(section, [{ label: "编辑白盒画质", onClick: () => {
    if (!built) { Build(); built = true; }
    editor.hidden = !editor.hidden;
  } }]);
  section.appendChild(editor);
  let draft = LoadWhiteboxConfig();
  const status = document.createElement("p");
  status.className = "edNote"; status.setAttribute("role", "status");
  const plan = document.createElement("p"); plan.className = "edNote";
  const Changed = () => {
    plan.textContent = `配置允许的 Pass：${WhiteboxPassPlan(draft).join(" → ")}`;
    status.textContent = "修改尚未应用；保存并应用后刷新生效。";
  };
  const Build = () => {
    editor.replaceChildren();
    Note(editor, "默认只运行主场景与基础输出。需要高级效果时逐项开启；所需预通道会自动接入。阴影 / GI / 簇光会使用关卡灯光，SSIL / 室内遮蔽依赖 GTAO。");
    for (const group of new Set(WHITEBOX_CONTROLS.map(([, , name]) => name))) {
      const box = Section(editor, group);
      for (const [key, label, name] of WHITEBOX_CONTROLS) {
        if (name !== group) continue;
        const row = document.createElement("div"); row.className = "edBtns"; box.appendChild(row);
        const toggle = Toggle(row, label, draft[key], (on) => { draft[key] = on; Changed(); });
        toggle.root.dataset.whiteboxOption = key;
      }
    }
    const appearance = Section(editor, "基础外观");
    for (const [key, label] of [["surfaceColor", "白盒表面色"], ["backgroundColor", "背景色"]]) {
      const input = document.createElement("input"); input.type = "color"; input.value = draft[key];
      input.setAttribute("aria-label", label);
      input.addEventListener("input", () => { draft[key] = input.value; Changed(); });
      Row(appearance, label, input);
    }
    Slider(appearance, { label: "渲染分辨率", min: 0.4, max: 1.6, step: 0.05, value: draft.renderScale,
      format: (v) => `${Math.round(v * 100)}%`, onInput: (v) => { draft.renderScale = v; Changed(); } });
    editor.append(plan);
    ButtonRow(editor, [
      { label: "保存并应用白盒", onClick: () => {
        if (!SaveWhiteboxConfig(draft)) { status.textContent = "浏览器未允许保存配置，请检查存储权限。"; return; }
        settings.Reload("whitebox");
      } },
      { label: "恢复白盒默认值", onClick: () => { draft = { ...WHITEBOX_DEFAULTS }; Build(); } },
      { label: "导出配置 JSON", onClick: () => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" }));
        const link = document.createElement("a"); link.href = url; link.download = "Data_WhiteboxQuality.json";
        link.click(); URL.revokeObjectURL(url);
      } },
    ]);
    editor.append(status); Changed();
  };
  if (profile === "whitebox") {
    settings.whiteboxReadout = document.createElement("p");
    settings.whiteboxReadout.className = "edNote";
    section.appendChild(settings.whiteboxReadout);
    const player = Section(body, "视场与内容");
    Slider(player, { label: "视野角度", min: 40, max: 90, step: 1, value: settings.gfx.fov,
      format: (v) => `${v.toFixed(0)}°`, onInput: (v) => { settings.gfx.fov = v; settings.Save(); } });
    Toggle(player, "断肢表现", settings.gfx.gore !== false, (on) => { settings.gfx.gore = on; settings.Apply(); });
    return true;
  }
  return false;
}
