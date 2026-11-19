import * as THREE from 'three';
import { FrameDebugMesh } from './Script_FrameDebugMesh.mjs';
import { EnumName, Primitives, RenderStateRows, ApiCall } from './Script_FrameDebugGl.mjs';

const CSS = `
:root { color-scheme: dark; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
html, body { height: 100%; }
body.edThemedSurface {
  --surface: #191c22;
  --surface-raised: #22262e;
  --surface-hover: #292e37;
  --stage: #111318;
  --line: #363b45;
  --line-soft: #2c313a;
  --edge: #454c57;
  --text: #edf0f4;
  --muted: #b8bfc9;
  --dim: #929caa;
  --accent: var(--ed-gold, #edca83);
  --selection: #373022;
  --good: #a9c49a;
  --error: #ffada0;
  --mono: "Cascadia Mono", Consolas, monospace;
  --font: "Segoe UI", "Microsoft YaHei UI", system-ui, sans-serif;
  margin: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--surface);
  color: var(--text);
  font: 14px/1.45 var(--font);
  scrollbar-color: #525966 transparent;
  scrollbar-width: thin;
}
button, select, input { font: inherit; color: inherit; }
button, select, input[type="search"], input[type="number"] {
  min-height: 32px;
  padding: 4px 9px;
  border: 1px solid var(--edge);
  border-radius: 6px;
  background: var(--surface-raised);
}
button, select { cursor: pointer; }
button { white-space: nowrap; }
button:hover:not(:disabled), select:hover:not(:disabled) {
  background: var(--surface-hover);
  border-color: var(--dim);
}
button:disabled, select:disabled { color: var(--dim); opacity: .64; cursor: default; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
input[type="checkbox"], input[type="range"] { accent-color: var(--accent); }
input[type="checkbox"] { margin: 0; }
input[type="number"] { min-width: 0; font-variant-numeric: tabular-nums; }
label { display: inline-flex; align-items: center; gap: 6px; }
a { color: var(--accent); }
small, .muted { color: var(--muted); }
.mono { font-family: var(--mono); }
.spacer { flex: 1; }
.toolbar { display: flex; align-items: center; gap: 7px; }
.masthead {
  min-height: 61px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 7px 16px;
  background: var(--surface-raised);
  border-bottom: 1px solid var(--line);
}
.brand { display: flex; align-items: center; flex-wrap: wrap; gap: 3px 13px; min-width: 0; }
h1 { margin: 0; font-size: 21px; font-weight: 650; line-height: 1.2; letter-spacing: .1px; white-space: nowrap; }
.source { color: var(--muted); font-size: 13px; white-space: nowrap; }
.stats { display: flex; align-items: center; flex-shrink: 0; }
.stat { display: grid; gap: 1px; padding: 0 15px; border-left: 1px solid var(--line); }
.stat:last-child { padding-right: 0; }
.stat span { color: var(--muted); font-size: 11.5px; white-space: nowrap; }
.stat b { color: var(--text); font: 600 16px/1.22 var(--mono); white-space: nowrap; }
.stat.timing b { color: var(--accent); }
.bar {
  min-height: 47px;
  padding: 6px 14px;
  border-bottom: 1px solid var(--line);
  background: var(--surface);
}
.captureTools, .steps { display: flex; align-items: center; gap: 7px; min-width: 0; }
.captureTools { flex: none; padding-right: 11px; border-right: 1px solid var(--line); }
.steps { flex: 1; }
#target { max-width: 187px; }
button.primary {
  border-color: var(--accent);
  background: var(--accent);
  color: #241d13;
  font-weight: 700;
}
button.primary:hover:not(:disabled) { background: #ffe1a9; border-color: #ffe1a9; }
.step {
  display: grid;
  place-items: center;
  flex: none;
  width: 32px;
  padding: 0;
}
.step::before, .caret::before, .adjustSummary::after {
  content: "";
  display: block;
  width: 6px;
  height: 6px;
  border: solid currentColor;
  border-width: 0 1.5px 1.5px 0;
}
#previous::before { transform: rotate(135deg); }
#next::before { transform: rotate(-45deg); }
#scrubber {
  appearance: none;
  flex: 1;
  min-width: 40px;
  height: 26px;
  margin: 0 3px;
  background: transparent;
  cursor: pointer;
}
#scrubber::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 4px;
  background: linear-gradient(to right, var(--accent) var(--position, 0%), #474e59 var(--position, 0%));
}
#scrubber::-webkit-slider-thumb {
  appearance: none;
  width: 12px;
  height: 12px;
  margin-top: -4px;
  border-radius: 50%;
  border: 2px solid var(--stage);
  background: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}
#scrubber:disabled { cursor: default; opacity: .5; }
#index { width: 59px; }
#index::-webkit-inner-spin-button { appearance: none; }
#count { min-width: 34px; white-space: nowrap; font: 12px var(--mono); }
#save { margin-left: 6px; }
main {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, var(--aside, clamp(350px, 31vw, 490px))) 5px minmax(0, 1fr);
}
aside {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--surface);
  container: tree-pane / inline-size;
}
.asideHead { flex: none; padding: 10px 12px 0; background: var(--surface); }
.treeTools { gap: 5px; }
.treeTools h2 { flex: 1; min-width: max-content; margin: 0; font-size: 14px; font-weight: 650; }
.treeTools button, .treeTools select { min-height: 28px; padding: 3px 6px; font-size: 12px; }
.searchBox { display: flex; position: relative; margin: 8px 0 6px; }
.searchBox::before, .searchBox::after {
  content: "";
  position: absolute;
  top: 10px;
  left: 11px;
  pointer-events: none;
}
.searchBox::before { width: 8px; height: 8px; border: 1.5px solid var(--dim); border-radius: 50%; }
.searchBox::after { top: 20px; left: 20px; width: 5px; height: 1.5px; background: var(--dim); transform: rotate(45deg); }
#search {
  width: 100%;
  padding-left: 32px;
  background: var(--stage);
  font-size: 13px;
}
#search::placeholder { color: var(--dim); }
.legend, .row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 37px 60px 69px;
  align-items: center;
}
.legend {
  flex: none;
  min-height: 28px;
  color: var(--dim);
  border-bottom: 1px solid var(--line);
  background: var(--surface);
  font-size: 11.5px;
}
.legend span { padding-right: 9px; text-align: right; white-space: nowrap; }
.legend span:first-child { padding-left: 12px; text-align: left; }
#splitter { position: relative; z-index: 1; cursor: col-resize; background: var(--stage); touch-action: none; }
#splitter:hover, #splitter.drag { background: var(--accent); }
#events { flex: 1; min-height: 0; overflow: auto; padding-bottom: 10px; scrollbar-gutter: stable; }
.legend { scrollbar-gutter: stable; overflow: hidden; }
.row {
  min-height: 28px;
  border-left: 2px solid transparent;
  cursor: pointer;
  user-select: none;
}
.row:hover, .row:focus-visible { background: var(--surface-hover); }
.row:focus-visible { outline-offset: -2px; }
.row .name {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding-left: calc(6px + min(var(--depth, 0), 7) * 10px);
}
.row .label, .row .sub { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row .label { font-size: 13.5px; }
.row .sub { flex: 0 1 auto; color: var(--dim); font-size: 12px; }
.row .num { padding-right: 9px; text-align: right; white-space: nowrap; color: var(--muted); font: 12.5px/1.3 var(--mono); }
.row .idx { flex: 0 0 auto; min-width: 24px; color: var(--dim); text-align: right; font: 11.5px var(--mono); }
.row.pass { min-height: 30px; font-weight: 650; background: #20242b; border-top: 1px solid var(--line-soft); }
.row.pass.viewport { min-height: 32px; background: var(--surface-raised); }
.row.pass.inside { background: #292e36; }
.row.pass:hover { background: var(--surface-hover); }
.row.on, .row.pass.on { border-left-color: var(--accent); background: var(--selection); }
.row.on .label, .row.on .idx { color: var(--accent); }
.row .gpu {
  position: relative;
  color: var(--text);
}
.gpu::after {
  content: "";
  position: absolute;
  top: calc(100% + 2px);
  right: 9px;
  width: calc((100% - 13px) * var(--share, 0));
  height: 1.5px;
  border-radius: 1px;
  background: #a78b56;
}
.caret {
  display: grid;
  place-items: center;
  flex: 0 0 16px;
  width: 16px;
  height: 21px;
  min-height: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--muted);
}
.caret::before { transform: rotate(45deg) translate(-1px, -1px); }
.closed > .row .caret::before { transform: rotate(-45deg); }
.icon {
  display: inline-grid;
  place-items: center;
  flex: 0 0 20px;
  height: 17px;
  border-radius: 4px;
  background: #303641;
  color: #d0d7e0;
  font: 600 10px/1 var(--mono);
}
.icon.draw, .icon.inst, .icon.batch, .icon.proc { background: #293d39; color: #b5dbc9; }
.icon.full, .icon.blit, .icon.copy { background: #393245; color: #dbc9ec; }
.node.closed > .kids { display: none; }
.empty { padding: 14px; color: var(--muted); }
.right {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  container: inspector / inline-size;
}
.eventHead {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px 14px;
  flex: none;
  padding: 9px 14px;
  background: var(--surface);
}
.eventIdentity { min-width: 0; }
.titleRow { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
#eventId { color: var(--accent); font: 600 12px var(--mono); white-space: nowrap; }
.titleRow h2 { min-width: 0; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 18px; line-height: 1.3; font-weight: 650; }
.crumbs { display: flex; align-items: center; min-width: 0; gap: 5px; margin-top: 3px; color: var(--muted); font-size: 12px; }
.crumbs span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.crumbs button {
  min-width: 0;
  min-height: 0;
  padding: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  border: 0;
  background: none;
  color: var(--muted);
}
.crumbs button:hover:not(:disabled) { background: none; color: var(--text); text-decoration: underline; }
.chips { display: flex; align-items: center; gap: 11px; white-space: nowrap; }
.chip { display: grid; gap: 1px; align-items: baseline; border-left: 1px solid var(--line); padding-left: 10px; font-size: 11.5px; }
.chip b { color: var(--text); font: 600 13px var(--mono); }
.chip.hot b { color: var(--accent); }
.previewBar {
  flex-wrap: wrap;
  flex: none;
  min-height: 39px;
  padding: 3px 12px;
  background: var(--surface-raised);
  border-top: 1px solid var(--line-soft);
}
.previewBar button, .previewBar select { min-height: 29px; padding: 3px 8px; font-size: 12px; }
#attachment { width: clamp(118px, 20cqw, 205px); }
.tabs { display: flex; flex: none; align-items: stretch; align-self: stretch; gap: 2px; }
.tabs button {
  border: 1px solid transparent;
  background: transparent;
  color: var(--muted);
  padding: 3px 11px;
  border-radius: 4px;
}
.tabs button.on { color: var(--accent); background: #332d23; }
.tabs button:hover:not(:disabled) { color: var(--text); }
.seg { display: inline-flex; flex: none; border: 1px solid var(--edge); border-radius: 5px; padding: 2px; gap: 1px; }
.seg button { min-height: 23px; min-width: 23px; padding: 1px 5px; border: 0; border-radius: 3px; background: transparent; color: var(--muted); font-size: 11.5px; }
.seg button.on { color: var(--accent); background: var(--selection); }
.adjustments { position: relative; z-index: 4; }
.adjustSummary, .adjustFields {
  border: 1px solid var(--edge);
  border-radius: 6px;
  background: var(--surface-raised);
}
.adjustSummary {
  display: flex;
  gap: 8px;
  align-items: center;
  min-height: 29px;
  padding: 3px 8px;
  list-style: none;
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
}
.adjustSummary::-webkit-details-marker { display: none; }
.adjustSummary::after { transform: rotate(45deg) translateY(-1px); }
.adjustments[open] .adjustSummary { color: var(--accent); }
.adjustFields {
  position: absolute;
  right: 0;
  top: calc(100% + 5px);
  padding: 9px 10px;
  display: grid;
  gap: 7px;
  box-shadow: 0 7px 20px #0008;
}
.adjustFields label { justify-content: space-between; min-width: 143px; color: var(--muted); font-size: 13px; }
.adjustFields input { width: 77px; background: var(--stage); }
.appActions { gap: 7px; color: var(--muted); font-size: 12px; }
.appActions button, .copyAction { min-height: 24px; padding: 2px 6px; font-size: 12px; }
dd .copyAction { margin-left: 6px; }
h4 .copyAction { margin-left: auto; }
#meshControls { min-height: 35px; color: var(--muted); font-size: 13px; }
.preview {
  position: relative;
  flex: none;
  container-type: size;
  height: clamp(150px, 31vh, 530px);
  min-height: 100px;
  max-height: max(150px, calc(100vh - 340px));
  padding: 9px 12px;
  background: var(--stage);
  overflow: hidden;
  display: grid;
  place-items: center;
}
#output {
  width: min(100cqw, calc(100cqh * var(--image-aspect, 1)));
  height: auto;
  background: repeating-conic-gradient(#232833 0% 25%, #1a1f28 0% 50%) 0 / 16px 16px;
}
#output.emptyImage { visibility: hidden; }
.preview.zoom { overflow: auto; display: block; }
.preview.zoom #output { width: auto; image-rendering: pixelated; }
#mesh { display: none; touch-action: none; cursor: grab; max-width: 100%; max-height: 100%; object-fit: contain; }
.previewInfo {
  min-height: 26px;
  flex: none;
  padding: 4px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  background: #181b21;
  border-bottom: 1px solid var(--line);
  color: var(--muted);
  font: 11.5px/1.35 var(--mono);
}
.tag { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#previewGrip {
  display: grid;
  place-items: center;
  width: 33px;
  min-height: 17px;
  padding: 0;
  border-color: transparent;
  background: transparent;
  cursor: row-resize;
  touch-action: none;
}
#previewGrip::before {
  content: "";
  width: 14px;
  height: 4px;
  border-block: 1px solid var(--dim);
}
#previewError { flex: none; color: var(--error); padding: 4px 12px; background: var(--stage); }
#previewError:empty { display: none; }
.inspector {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  min-width: 0;
}
.propertyTabs {
  align-self: auto;
  flex: none;
  min-height: 37px;
  padding: 0 12px;
  border-bottom: 1px solid var(--line);
  background: var(--surface);
}
.propertyTabs button {
  border: 0;
  border-radius: 0;
  padding-inline: 12px;
  font-weight: 600;
  color: var(--muted);
}
.propertyTabs button.on { background: transparent; box-shadow: inset 0 -2px var(--accent); }
#properties { flex: 1; min-height: 0; overflow: auto; scrollbar-gutter: stable; }
details.fold { border-bottom: 1px solid var(--line-soft); }
details.fold > summary {
  min-height: 33px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 14px;
  color: var(--text);
  font-weight: 600;
  font-size: 13px;
  list-style: none;
  user-select: none;
  cursor: pointer;
}
details.fold > summary:focus-visible { outline-offset: -2px; }
details.fold > summary::before { content: '›'; font-size: 16px; color: var(--muted); }
details.fold[open] > summary::before { transform: rotate(90deg); }
details.fold > summary::-webkit-details-marker { display: none; }
details.fold > summary:hover { background: var(--surface-hover); }
details.fold > summary .count { color: var(--dim); font: 12px var(--mono); }
details.fold > summary .tools { margin-left: auto; display: flex; gap: 6px; font-weight: 400; }
.fold.emptyFold > summary { color: var(--dim); cursor: default; }
.fold.emptyFold > summary:hover { background: none; }
.foldBody { padding: 3px 14px 10px; overflow: auto; }
.detailContent { padding: 10px 14px 16px; }
.cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 18px; }
.card { min-width: 0; }
.card h3 {
  margin: 0;
  padding: 3px 0 5px;
  border-bottom: 1px solid var(--line);
  color: var(--text);
  font-size: 13px;
  font-weight: 650;
}
dl.kv { display: grid; grid-template-columns: minmax(91px, max-content) minmax(0, 1fr); gap: 0 10px; margin: 0; }
dl.kv dt, dl.kv dd { min-width: 0; margin: 0; padding-block: 4px; border-bottom: 1px solid var(--line-soft); }
dl.kv dt { color: var(--muted); font-size: 12.5px; }
dl.kv dd { overflow-wrap: anywhere; color: var(--text); font: 12.5px/1.5 var(--mono); }
.off { color: var(--dim); }
.on-val { color: var(--good); }
.hint { color: var(--muted); font: 12px var(--font); margin-left: 6px; }
table { width: 100%; border-collapse: collapse; font: 12px/1.5 var(--mono); }
th { text-align: left; color: var(--muted); font: 600 12px var(--font); padding: 5px 6px; border-bottom: 1px solid var(--line); }
td { padding: 5px 6px; border-bottom: 1px solid var(--line-soft); vertical-align: top; overflow-wrap: anywhere; }
tr:hover td { background: var(--surface-raised); }
td.k, td.t { white-space: nowrap; }
td.t { color: var(--dim); }
h4 { margin: 6px 0 4px; font-size: 13px; color: var(--text); display: flex; gap: 7px; }
h4 .count { color: var(--dim); font-weight: 400; }
.thumbButton { padding: 0; border: 0; cursor: zoom-in; }
.thumb { width: 44px; height: 44px; border: 1px solid var(--edge); background: var(--stage); display: block; object-fit: contain; }
.thumb.none { display: grid; place-items: center; color: var(--muted); }
.swatch { display: inline-block; width: 12px; height: 12px; border: 1px solid #0008; border-radius: 2px; vertical-align: -1px; margin-right: 5px; }
.matrix { display: grid; gap: 0 10px; font: 12px var(--mono); }
.matrix span { text-align: right; }
.keywords { display: flex; flex-wrap: wrap; gap: 5px; padding: 5px 0; }
.kw { padding: 2px 5px; border: 1px solid var(--edge); border-radius: 3px; background: var(--surface-raised); font: 12px var(--mono); }
.kw i { font-style: normal; color: var(--muted); }
.kw.v { border-color: #59776d; }
.kw.f { border-color: #806a97; }
.code {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  max-height: 540px;
  overflow: auto;
  background: var(--stage);
  border: 1px solid var(--line);
  border-radius: 4px;
  font: 12px/1.55 var(--mono);
}
.code .ln { color: var(--dim); text-align: right; padding: 0 8px; user-select: none; border-right: 1px solid var(--line); white-space: pre; }
.code .src { white-space: pre; padding: 0 10px; }
.code .pp { color: var(--accent); }
.code .cm { color: var(--muted); }
.filter { width: 164px; min-height: 23px !important; padding: 2px 6px !important; font-size: 12px; }
pre.json { white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.55 var(--mono); margin: 0; }
#status {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 27px;
  padding: 3px 13px;
  background: #171a20;
  color: var(--muted);
  border-top: 1px solid var(--line);
  font-size: 12px;
}
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--dim); flex: none; }
.dot.frozen, .dot.armed { background: var(--accent); }
.dot.error { background: var(--error); }
@container tree-pane (max-width: 365px) {
  .legend, .row { grid-template-columns: minmax(0, 1fr) 32px 53px 61px; }
  .row .name { gap: 4px; padding-left: calc(5px + min(var(--depth, 0), 6) * 8px); }
  .row .sub { display: none; }
}
@container tree-pane (max-width: 310px) {
  .legend, .row { grid-template-columns: minmax(0, 1fr) 32px 62px; }
  .legend > :nth-child(3), .row > :nth-child(3) { display: none; }
}
@container inspector (max-width: 590px) {
  .eventHead { gap: 6px 9px; }
  .chips { gap: 5px; }
  .chip { padding-left: 5px; }
  .cards { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 920px) {
  main { grid-template-columns: minmax(0, var(--aside, 320px)) 5px minmax(0, 1fr); }
  .stat { padding-inline: 8px; }
  .stat.memory { display: none; }
}
@media (max-width: 720px) {
  main { grid-template-columns: 43% 4px minmax(0, 1fr); }
  .bar { flex-wrap: wrap; }
  .captureTools { padding-right: 0; border-right: 0; }
  .steps { flex: 1 1 100%; }
  .source { display: none; }
}
`;

const Ms = value => value == null ? '—' : value < 0.001 ? '<.001' : value.toFixed(3);
const Count = value => value == null ? '—' : Number(value).toLocaleString('en-US');
const Num = value => {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value !== 'number') return String(value);
  if (Number.isInteger(value)) return String(value);
  const abs = Math.abs(value);
  return abs >= 1e5 || abs < 1e-4 ? value.toExponential(3) : value.toFixed(abs >= 100 ? 2 : 4).replace(/\.?0+$/, '');
};
// FLOAT_VEC3 → vec3, UNSIGNED_INT_SAMPLER_2D → usampler2D: what the shader source says.
const GlslType = type => {
  const text = String(type), sampler = text.match(/^(INT_|UNSIGNED_INT_)?SAMPLER_(.+)$/);
  if (sampler) return `${sampler[1] === 'INT_' ? 'i' : sampler[1] ? 'u' : ''}sampler${sampler[2].split('_').map(part => ({ SHADOW: 'Shadow', CUBE: 'Cube', ARRAY: 'Array' })[part] || part).join('')}`;
  const match = text.match(/^(FLOAT|INT|UNSIGNED_INT|BOOL)(?:_(VEC|MAT)(\w+))?$/);
  if (!match) return text;
  if (!match[2]) return { FLOAT: 'float', INT: 'int', UNSIGNED_INT: 'uint', BOOL: 'bool' }[match[1]];
  return match[2] === 'MAT' ? `mat${match[3]}` : `${{ FLOAT: '', INT: 'i', UNSIGNED_INT: 'u', BOOL: 'b' }[match[1]]}vec${match[3]}`;
};
const THREE_NAMES = { format: new Map(), type: new Map(), blending: new Map() };
for (const [key, value] of Object.entries(THREE)) {
  if (typeof value !== 'number') continue;
  if (/Format$/.test(key)) THREE_NAMES.format.set(value, key.replace(/_?Format$/, ''));
  else if (/^(Unsigned|Byte|Short|Int|Float|HalfFloat)\w*Type$/.test(key)) THREE_NAMES.type.set(value, key.replace(/Type$/, ''));
  else if (/Blending$/.test(key) && value <= 6) THREE_NAMES.blending.set(value, key.replace(/Blending$/, ''));
}
const ICONS = { 'Draw Mesh': ['draw', 'D'], 'Draw Mesh Instanced': ['inst', 'I'], 'Draw Batched': ['batch', 'B'], 'Draw Fullscreen': ['full', 'F'],
  'Draw Procedural': ['proc', 'P'], Canvas2D: ['full', '2D'], Clear: ['clear', 'C'], Blit: ['blit', '⇢'], 'Generate Mips': ['copy', 'M'], 'Copy Texture': ['copy', 'T'] };

export class FrameDebuggerEditor {
  static id = 'frameDebugger';
  static label = 'Frame Debugger';
  static hint = '独立窗口：冻结一帧、逐 DC / Pass 回放、CPU / GPU 耗时、渲染靶 / 网格 / Shader 检查';
  static keepOnClose = true;
  constructor(host, popup = null) {
    this.host = host; this.debugger = host.game.FrameDebugger; this.win = popup; this.mesh = null; this.lastRevision = -1; this.captureId = null;
    this.treeKey = ''; this.filter = ''; this.sort = 'order'; this.channel = 'rgba'; this.open = new Set(); this.folds = new Map();
    this.selectedPass = null; this.textureView = null; this.view = 'output'; this.propertyView = 'details';
  }
  Enter() {
    this.win ??= window.open('', this.debugger.windowName, 'width=1440,height=980,menubar=no,toolbar=no');
    if (!this.win) throw new Error('Frame Debugger 独立窗口被浏览器拦截，请允许弹窗后重试');
    const doc = this.win.document; this.doc = doc;
    doc.open(); doc.write('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>台儿庄 · Frame Debugger</title></head><body></body></html>'); doc.close();
    doc.body.className = 'edThemedSurface';
    for (const source of document.querySelectorAll('link[data-interface-theme],link[href*="Style_Editor.css"]')) {
      const theme = doc.createElement('link'); theme.rel = 'stylesheet'; theme.href = source.href; doc.head.append(theme);
    }
    const style = doc.createElement('style'); style.textContent = CSS; doc.head.append(style);
    doc.body.innerHTML = `
      <header class="masthead">
        <div class="brand"><h1>Frame Debugger</h1><span class="source">台儿庄 1938</span></div>
        <div id="stats" class="stats"></div>
      </header>
      <div class="toolbar bar">
        <div class="captureTools">
          <select id="target" aria-label="捕获目标"><option>当前游戏</option></select>
          <button id="capture" class="primary" aria-label="捕获当前帧">捕获当前帧</button>
          <button id="resume">继续运行</button>
        </div>
        <div class="steps">
          <button id="previous" class="step" aria-label="上一事件" title="上一事件 (←，Shift ×10)"></button>
          <input id="scrubber" aria-label="渲染事件" type="range" min="0" max="0" value="0">
          <button id="next" class="step" aria-label="下一事件" title="下一事件 (→，Shift ×10)"></button>
          <input id="index" aria-label="事件编号" type="number" min="1" value="1"><span id="count" class="muted">/ 0</span>
        </div>
        <button id="save">导出报告</button>
      </div>
      <main>
        <aside>
          <div class="asideHead">
            <div class="toolbar treeTools">
              <h2 id="treeHeading">渲染事件</h2>
              <select id="sort" aria-label="排序"><option value="order">事件顺序</option><option value="gpu">GPU 降序</option><option value="cpu">CPU 降序</option></select>
              <button id="expand" aria-label="展开全部" title="展开全部">展开</button>
              <button id="collapse" aria-label="折叠全部" title="折叠全部">折叠</button>
            </div>
            <div class="searchBox"><input id="search" type="search" aria-label="搜索渲染事件" placeholder="搜索事件、Pass 或 Shader" title="Pass、对象、材质、Shader、#编号"></div>
          </div>
          <div class="legend"><span id="treeInfo">名称</span><span>DC</span><span>CPU ms</span><span id="gpuColumn">GPU ms</span></div>
          <div id="events" role="tree" aria-labelledby="treeHeading"></div>
        </aside>
        <div id="splitter" title="拖动调整宽度"></div>
        <section id="right" class="right" aria-label="事件检查">
          <div class="eventHead">
            <div class="eventIdentity">
              <div class="titleRow"><span id="eventId" hidden></span><h2 id="selected">尚未捕获</h2></div>
              <div id="crumbs" class="crumbs"></div>
            </div>
            <div id="chips" class="chips"></div>
          </div>
          <div class="toolbar previewBar">
            <span id="viewModes" class="tabs" role="group" aria-label="预览模式"></span>
            <select id="attachment" aria-label="渲染目标附件"></select>
            <span id="channel" class="seg" role="group" aria-label="颜色通道"></span>
            <details id="adjustments" class="adjustments" hidden>
              <summary class="adjustSummary">色阶</summary>
              <div class="adjustFields">
                <label>黑场<input id="black" type="number" value="0" step=".01"></label>
                <label>白场<input id="white" type="number" value="1" step=".01"></label>
                <label>曝光 EV<input id="exposure" type="number" value="0" step=".5"></label>
              </div>
            </details>
            <span class="spacer"></span>
            <button id="zoom" title="适应窗口 / 快照像素" aria-pressed="false">适应</button>
            <button id="png">保存 PNG</button>
          </div>
          <div id="meshControls" class="toolbar previewBar" hidden>
            <select id="meshMode" aria-label="网格模式"><option value="shaded">着色</option><option value="uvChecker">UV 棋盘</option><option value="uvLayout">UV 展开</option><option value="vertexColor">顶点色</option><option value="normals">法线</option><option value="tangents">切线</option><option value="blendshapes">形变</option></select>
            <label><input id="wireframe" type="checkbox"> 线框</label>
            <label>形变 <input id="morph" type="range" min="0" max="1" step=".01" value="1"></label>
          </div>
          <div id="preview" class="preview"><canvas id="output" class="emptyImage"></canvas><canvas id="mesh"></canvas></div>
          <div class="previewInfo">
            <span id="previewLabel" class="tag" hidden></span><span class="spacer"></span><span id="pixel" class="tag" hidden></span>
            <button id="previewGrip" aria-label="调整预览高度" title="拖动调整预览高度，也可用方向键"></button>
          </div>
          <div id="previewError" role="status"></div>
          <section class="inspector" aria-label="事件属性">
            <div class="toolbar tabs propertyTabs" id="propertyTabs" role="group" aria-label="属性视图"></div>
            <div id="properties" tabindex="0"></div>
          </section>
        </section>
      </main>
      <footer id="status" role="status">
        <span id="stateDot" class="dot"></span><span id="statusText"></span><span class="spacer"></span>
        <div id="appActions" class="toolbar appActions">
          <label><input id="syncView" type="checkbox" checked> 同步游戏画面</label>
          <button id="locate" title="在控制台定位源对象">定位对象</button>
        </div>
      </footer>`;
    this.ui = Object.fromEntries([...doc.querySelectorAll('[id]')].map(el => [el.id, el]));
    const ui = this.ui;
    if (this.host.preview) {
      doc.title = 'Encounter Designer 编辑器预览 · Frame Debugger';
      doc.querySelector('.source').textContent = 'Encounter Designer';
      ui.target.options[0].textContent = '可见编辑器视口';
      ui.gpuColumn.textContent = 'GPU ms ≈'; ui.gpuColumn.title = '逐命令 GPU 查询';
      ui.resume.textContent = '清除捕获';
      ui.appActions.hidden = true; ui.syncView.checked = false;
    }
    for (const [value, label] of [['output', '输出'], ['mesh', '网格'], ['texture', '纹理']]) {
      const button = this.El('button', label); button.dataset.value = value;
      button.onclick = () => { this.view = value; this.DrawPreview(); };
      ui.viewModes.append(button);
    }
    for (const [value, text] of [['rgba', 'RGBA'], ['rgb', 'RGB'], ['r', 'R'], ['g', 'G'], ['b', 'B'], ['a', 'A']]) {
      const button = this.El('button', text); button.dataset.value = value;
      button.onclick = () => { this.channel = value; this.DrawPreview(); };
      ui.channel.append(button);
    }
    for (const [value, text] of [['details', '详情'], ['shader', 'Shader 属性'], ['raw', '原始数据']]) {
      const button = this.El('button', text); button.dataset.value = value;
      button.onclick = () => this.ShowProperties(value);
      ui.propertyTabs.append(button);
    }
    ui.capture.onclick = () => {
      if (this.host.preview) this.debugger.RequestCapture(ui.target.selectedIndex > 0 ? Number(ui.target.value) : null);
      else this.debugger.RequestCapture();
      this.Update();
    };
    ui.resume.onclick = () => { this.debugger.Resume(); this.Update(); };
    ui.previous.onclick = () => this.Select(this.debugger.selected - 1);
    ui.next.onclick = () => this.Select(this.debugger.selected + 1);
    ui.scrubber.oninput = () => this.Select(Number(ui.scrubber.value));
    ui.index.onchange = () => this.Select(Number(ui.index.value) - 1);
    ui.search.oninput = () => { this.filter = ui.search.value.trim().toLowerCase(); this.BuildTree(); };
    ui.sort.onchange = () => { this.sort = ui.sort.value; this.BuildTree(); };
    ui.expand.onclick = () => { for (const pass of this.debugger.capture?.passes || []) this.open.add(pass.path); this.BuildTree(true); };
    ui.collapse.onclick = () => { this.open.clear(); this.BuildTree(true); };
    ui.events.onclick = event => this.TreeClick(event);
    ui.events.ondblclick = event => { const node = event.target.closest('.row.pass')?.parentElement; if (node) this.Toggle(node); };
    for (const id of ['attachment', 'black', 'white', 'exposure', 'meshMode', 'wireframe', 'morph']) ui[id].onchange = () => this.DrawPreview();
    ui.syncView.onchange = () => { if (!ui.syncView.checked) this.debugger.Present(); else this.DrawPreview(); };
    ui.zoom.onclick = () => {
      const actualSize = ui.preview.classList.toggle('zoom');
      ui.zoom.textContent = actualSize ? '1:1' : '适应';
      ui.zoom.setAttribute('aria-pressed', actualSize);
    };
    const ResizePreview = height => { ui.preview.style.height = `${Math.max(100, height)}px`; };
    ui.previewGrip.onpointerdown = event => {
      const start = event.clientY, height = ui.preview.offsetHeight;
      ui.previewGrip.setPointerCapture(event.pointerId);
      ui.previewGrip.onpointermove = move => ResizePreview(height + move.clientY - start);
    };
    ui.previewGrip.onlostpointercapture = () => { ui.previewGrip.onpointermove = null; };
    ui.previewGrip.onkeydown = event => {
      if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      ResizePreview(ui.preview.offsetHeight + (event.key === 'ArrowDown' ? 16 : -16));
      event.preventDefault(); event.stopPropagation();
    };
    doc.addEventListener('pointerdown', event => {
      if (!ui.adjustments.contains(event.target)) ui.adjustments.open = false;
    });
    ui.save.onclick = () => this.Download(new Blob([JSON.stringify(this.debugger.Inspect(), null, 2)], { type: 'application/json' }), `FrameCapture_${this.debugger.capture?.id || 0}.json`);
    ui.png.onclick = () => (this.view === 'mesh' ? ui.mesh : ui.output).toBlob(blob => { if (blob) this.Download(blob, `FrameCapture_Event${this.debugger.selected + 1}.png`); });
    ui.locate.onclick = () => this.Locate();
    ui.output.onmousemove = event => this.Pixel(event);
    ui.output.onmouseleave = () => { ui.pixel.hidden = true; };
    ui.output.onclick = event => this.PixelHistoryAt(event);
    if (!this.host.preview) ui.output.title = '单击查看像素历史';
    ui.splitter.onpointerdown = event => {
      ui.splitter.setPointerCapture(event.pointerId); ui.splitter.classList.add('drag');
      ui.splitter.onpointermove = move => doc.body.style.setProperty('--aside', `${Math.max(255, Math.min(this.win.innerWidth - 335, move.clientX))}px`);
      ui.splitter.onlostpointercapture = () => { ui.splitter.onpointermove = null; ui.splitter.classList.remove('drag'); };
    };
    doc.addEventListener('keydown', event => {
      if (event.key === 'Escape' && ui.adjustments.open) { ui.adjustments.open = false; event.preventDefault(); return; }
      if (event.ctrlKey && event.key.toLowerCase() === 'f') { ui.search.focus(); event.preventDefault(); return; }
      if (event.key !== 'Escape' && event.target.closest('#properties')) return;
      if (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName) && event.target.type !== 'range') return;
      const delta = event.shiftKey ? 10 : 1;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') this.Select(this.debugger.selected - delta);
      else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') this.Select(this.debugger.selected + delta);
      else if (event.key === 'Home') this.Select(0);
      else if (event.key === 'End') this.Select(this.debugger._events.length - 1);
      else if (event.key === 'Escape') { this.debugger.Resume(); this.Update(); }
      else return;
      event.preventDefault();
    });
    this.timer = setInterval(() => this.Update(), 100);
    this.Update(); return this;
  }
  El(tag, text = '', className = '') { const el = this.doc.createElement(tag); if (text !== '') el.textContent = text; if (className) el.className = className; return el; }
  Stat(label, value, title = '', type = '') { const box = this.El('div', '', `stat ${type}`); box.append(this.El('span', label), this.El('b', value)); if (title) box.title = title; return box; }
  Update() {
    if (!this.win || this.win.closed) { this.host.CloseFrameDebugger(); return; }
    this.debugger.Poll();
    if (this.host.preview && this.host.CaptureTargets) {
      const targets = this.host.CaptureTargets(), key = JSON.stringify(targets);
      if (key !== this.targetKey) {
        this.targetKey = key;
        const value = this.ui.target.value;
        this.ui.target.options.length = 1;
        for (const [id, name] of targets) {
          const option = this.El('option', name); option.value = id; this.ui.target.append(option);
        }
        this.ui.target.value = targets.some(([id]) => String(id) === value) ? value : this.ui.target.options[0].value;
      }
    }
    if (this.lastRevision === this.debugger.revision) return;
    this.lastRevision = this.debugger.revision;
    const capture = this.debugger.capture, ui = this.ui, ready = this.debugger.frozen;
    for (const id of ['save', 'previous', 'next', 'scrubber', 'index', 'png', 'locate']) ui[id].disabled = !ready;
    ui.resume.disabled = !ready && this.debugger.state !== 'armed';
    ui.capture.disabled = this.debugger.state === 'armed' || this.debugger.state === 'capturing';
    ui.capture.textContent = ready ? '重新捕获' : '捕获当前帧';
    ui.stateDot.className = `dot ${ready ? 'frozen' : this.debugger.state === 'armed' || this.debugger.state === 'capturing' ? 'armed' : this.debugger.state === 'error' ? 'error' : 'live'}`;
    if (!capture || !ready) {
      ui.statusText.textContent = this.debugger.error || (ui.capture.disabled ? '正在捕获…' : '就绪');
      if (!capture) {
        ui.events.replaceChildren();
        this.propertyEvent = null; this.propertyBuilders = null; this.ShowProperties('details');
        ui.selected.textContent = '尚未捕获'; ui.selected.removeAttribute('title'); ui.eventId.hidden = true;
        ui.crumbs.replaceChildren(); ui.chips.replaceChildren(); ui.stats.replaceChildren();
        ui.treeInfo.textContent = '名称'; ui.previewLabel.hidden = ui.pixel.hidden = true; ui.previewError.textContent = '';
        ui.attachment.replaceChildren(); ui.attachment.disabled = ui.zoom.disabled = true; ui.count.textContent = '/ 0';
        ui.scrubber.max = ui.scrubber.value = '0'; ui.scrubber.style.setProperty('--position', '0%'); ui.index.value = '1'; ui.meshControls.hidden = true;
        ui.mesh.style.display = 'none'; ui.output.style.display = ''; ui.output.width = ui.output.height = 1; ui.output.classList.add('emptyImage');
        this.view = 'output'; this.textureView = null;
        this.mesh?.Clear(); this.UpdatePreviewModes(null);
      }
      this.captureId = null; this.treeKey = ''; return;
    }
    const statuses = { ready: 'GPU 就绪', pending: 'GPU 查询中', unavailable: 'GPU 不可用', disjoint: 'GPU 时钟失效', timeout: 'GPU 查询超时' };
    const draws = capture.events.filter(event => event.draw).length;
    const target = this.host.preview ? `${capture.passes.filter(pass => pass.viewport).length} 个视口`
      : `${capture.width}×${capture.height} · ${Count(capture.commandCount)} 条 GL 命令`;
    ui.statusText.textContent = `帧 #${capture.id} · ${target} · ${statuses[capture.gpuStatus]}`;
    const gpuLabel = this.host.preview ? 'GPU ms ≈' : 'GPU ms';
    const gpuTitle = this.host.preview ? '逐命令 GPU 查询；不含命令间的 GPU 工作。' : '冻结帧独立回放的 GPU 时间。';
    ui.stats.replaceChildren(this.Stat('DC', Count(draws)), this.Stat('事件', Count(capture.events.length)), this.Stat('CPU ms', Ms(capture.cpuMs)),
      this.Stat(gpuLabel, Ms(capture.gpuMs), gpuTitle, 'timing'), this.Stat('捕获内存', `${(capture.bytes / 1048576).toFixed(1)} MiB`, '', 'memory'));
    const key = `${capture.id}:${capture.gpuStatus}`;
    if (key !== this.treeKey) {
      const firstView = this.host.preview ? capture.passes.find(pass => pass.viewport) : null;
      if (firstView && !this.hasCaptured) {
        this.open.add(firstView.path);
        for (const pass of capture.passes) if (pass.parent === firstView.id && pass.name === '主场景') this.open.add(pass.path);
        this.hasCaptured = true;
      }
      this.treeKey = key; this.BuildTree();
      if (this.captureId !== capture.id) {
        this.captureId = capture.id; this.selectedPass = null; this.textureView = null; this.pixelHistory = null;
        this.Select(firstView?.last ?? capture.events.length - 1, firstView?.id ?? null);
      }
      else { const event = this.debugger._events[this.debugger.selected]; this.Header(event); if (event) this.Properties(event); }
    }
  }
  // ---------------------------------------------------------------- tree
  Match(event) {
    if (!this.filter) return true;
    const d = event.details || {};
    return `#${event.index + 1} ${event.kind} ${event.label} ${event.path} ${event.target} ${event.phase || ''} ${d.material || ''} ${d.shader || ''} ${event.shaderName || ''} ${d.geometry || ''} ${d.path || ''}`.toLowerCase().includes(this.filter);
  }
  EventRow(event, depth, flat = false) {
    const row = this.El('div', '', 'row ev'); row.dataset.event = event.index; row.style.setProperty('--depth', depth);
    const [iconClass, glyph] = ICONS[event.kind] || ['draw', '?'];
    const name = this.El('span', '', 'name'), icon = this.El('span', glyph, `icon ${iconClass}`); icon.title = event.kind;
    const d = event.details;
    name.append(this.El('span', String(event.index + 1), 'idx'), icon, this.El('span', event.label || event.kind, 'label'));
    const secondary = flat ? event.path : d?.material;
    if (secondary && secondary !== event.label) name.append(this.El('span', secondary, 'sub'));
    const gpu = this.El('span', Ms(event.gpuMs), 'num gpu'); gpu.style.setProperty('--share', Math.min(1, (event.gpuMs || 0) / this.maxEventGpu));
    row.append(name, this.El('span', event.draw ? '1' : '', 'num'), this.El('span', Ms(event.cpuMs), 'num'), gpu);
    row.title = `#${event.index + 1} ${event.kind} ${event.label}\n${event.path} → ${event.target}${d ? `\n${d.path}\n材质 ${d.material} · ${event.shaderName || d.shader}` : ''}`;
    if (event.index === this.debugger.selected && this.selectedPass == null) row.classList.add('on');
    return row;
  }
  PassNode(pass, depth, filtered) {
    const node = this.El('div', '', 'node'); node.dataset.pass = pass.id; node.dataset.path = pass.path;
    const row = this.El('div', '', `row pass${pass.viewport ? ' viewport' : ''}`); row.style.setProperty('--depth', depth);
    const name = this.El('span', '', 'name'), caret = this.El('button', '', 'caret'); caret.tabIndex = -1; caret.dataset.toggle = '1';
    const expanded = filtered || this.open.has(pass.path);
    caret.setAttribute('aria-label', expanded ? '折叠' : '展开'); caret.setAttribute('aria-expanded', expanded);
    name.append(caret, this.El('span', pass.name, 'label'));
    const total = this.debugger.capture.gpuMs, gpu = this.El('span', Ms(pass.gpuMs), 'num gpu');
    gpu.style.setProperty('--share', total ? Math.min(1, (pass.gpuMs || 0) / total) : 0);
    row.append(name, this.El('span', Count(pass.draws), 'num'), this.El('span', Ms(pass.cpuMs), 'num'), gpu);
    row.title = `${pass.path}\n事件 #${pass.first + 1} – #${pass.last + 1} · ${pass.draws} DC${total && pass.gpuMs != null ? ` · 占 GPU 帧 ${(pass.gpuMs / total * 100).toFixed(1)}%` : ''}\n单击：看此组结束时的画面 · 双击 / ▾：展开折叠`;
    node.classList.toggle('closed', !expanded);
    if (this.selectedPass === pass.id) row.classList.add('on');
    const kids = this.El('div', '', 'kids'); node.append(row, kids);
    return node;
  }
  BuildTree(keepSelectionInView = false) {
    const capture = this.debugger.capture; if (!capture || !this.debugger.frozen) return;
    const root = this.ui.events, scroll = root.scrollTop, fragment = this.doc.createDocumentFragment();
    this.maxEventGpu = Math.max(1e-6, ...capture.events.map(event => event.gpuMs || 0));
    let shown = 0;
    if (this.sort !== 'order' && !capture.passes.some(pass => pass.viewport)) {
      const key = `${this.sort}Ms`;
      for (const event of [...capture.events].filter(event => this.Match(event)).sort((a, b) => (b[key] ?? -1) - (a[key] ?? -1))) { fragment.append(this.EventRow(event, 0, true)); shown++; }
    } else {
      const passes = capture.passes, children = new Map();
      for (const pass of passes) if (pass.last >= pass.first) (children.get(pass.parent) || children.set(pass.parent, []).get(pass.parent)).push({ at: pass.first, pass });
      for (const event of capture.events) (children.get(`e${event.pass}`) || children.set(`e${event.pass}`, []).get(`e${event.pass}`)).push({ at: event.index, event });
      const Visible = new Map();
      const Has = pass => {
        if (Visible.has(pass.id)) return Visible.get(pass.id);
        const value = !this.filter || pass.name.toLowerCase().includes(this.filter) || (children.get(`e${pass.id}`) || []).some(item => this.Match(item.event)) || (children.get(pass.id) || []).some(item => Has(item.pass));
        Visible.set(pass.id, value); return value;
      };
      const Add = (parentId, container, depth, forced, viewport = false) => {
        const sortKey = viewport && this.sort !== 'order' ? `${this.sort}Ms` : null;
        const items = [...(children.get(parentId) || []), ...(children.get(`e${parentId}`) || [])].sort((left, right) =>
          (sortKey ? ((right.pass || right.event)[sortKey] ?? -1) - ((left.pass || left.event)[sortKey] ?? -1) : 0)
          || left.at - right.at || (left.pass ? -1 : 1));
        for (const item of items) {
          if (item.pass) {
            const passMatch = this.filter && item.pass.name.toLowerCase().includes(this.filter);
            if (!forced && !Has(item.pass)) continue;
            const node = this.PassNode(item.pass, depth, !!this.filter); container.append(node);
            Add(item.pass.id, node.lastChild, depth + 1, forced || passMatch, viewport || !!item.pass.viewport);
          } else if (forced || this.Match(item.event)) { container.append(this.EventRow(item.event, depth)); shown++; }
        }
      };
      Add(null, fragment, 0, false);
    }
    root.replaceChildren(fragment);
    if (!shown && !root.childElementCount) root.append(this.El('div', '没有匹配的事件', 'empty'));
    this.ui.treeInfo.textContent = this.filter ? `${shown} 项匹配` : '名称';
    root.scrollTop = scroll;
    this.MarkSelection(keepSelectionInView);
  }
  Toggle(node, open = node.classList.contains('closed')) {
    node.classList.toggle('closed', !open);
    const caret = node.querySelector(':scope>.row .caret');
    caret.setAttribute('aria-label', open ? '折叠' : '展开'); caret.setAttribute('aria-expanded', open);
    if (open) this.open.add(node.dataset.path); else this.open.delete(node.dataset.path);
  }
  TreeClick(event) {
    const row = event.target.closest('.row'); if (!row) return;
    if (row.classList.contains('pass')) {
      const node = row.parentElement;
      if (event.target.dataset.toggle) { this.Toggle(node); return; }
      const pass = this.debugger.capture.passes[Number(node.dataset.pass)];
      this.Select(pass.last, pass.id);
    } else this.Select(Number(row.dataset.event));
  }
  MarkSelection(scroll = true) {
    const root = this.ui.events, index = this.debugger.selected;
    root.querySelectorAll('.row.on,.row.inside').forEach(el => el.classList.remove('on', 'inside'));
    let row = this.selectedPass != null ? root.querySelector(`.node[data-pass="${this.selectedPass}"]>.row`) : root.querySelector(`[data-event="${index}"]`);
    const event = this.debugger._events[index];
    if ((this.sort === 'order' || this.debugger.capture.passes.some(pass => pass.viewport)) && event) {
      // Open the chain down to the selection (Unity keeps the selected event visible).
      const chain = [];
      for (let id = this.selectedPass != null ? this.debugger.capture.passes[this.selectedPass].parent : event.pass; id != null; id = this.debugger.capture.passes[id].parent) chain.push(id);
      for (const id of chain) { const node = root.querySelector(`.node[data-pass="${id}"]`); if (node) { if (node.classList.contains('closed')) this.Toggle(node, true); node.firstChild.classList.add('inside'); } }
      row ??= root.querySelector(`[data-event="${index}"]`);
    }
    row?.classList.add('on');
    if (scroll) row?.scrollIntoView({ block: 'nearest' });
  }
  // ---------------------------------------------------------------- selection
  Select(index, passId = null) {
    if (!this.debugger.frozen) return;
    this.debugger.selected = Math.max(0, Math.min(index, this.debugger._events.length - 1));
    this.selectedPass = passId;
    const event = this.debugger._events[this.debugger.selected]; if (!event) return;
    const ui = this.ui;
    ui.scrubber.max = this.debugger._events.length - 1; ui.scrubber.value = event.index;
    ui.scrubber.style.setProperty('--position', `${event.index / Math.max(1, Number(ui.scrubber.max)) * 100}%`);
    ui.index.max = this.debugger._events.length; ui.index.value = event.index + 1; ui.count.textContent = `/ ${this.debugger._events.length}`;
    ui.previous.disabled = event.index === 0; ui.next.disabled = event.index === this.debugger._events.length - 1;
    const previous = ui.attachment.selectedOptions[0]?.dataset.name;
    ui.attachment.replaceChildren();
    event._target.attachments.forEach((attachment, i) => {
      const option = this.El('option', attachment.name);
      option.title = `${EnumName(this.debugger.gl, attachment.format)} · ${attachment.width} × ${attachment.height}`;
      option.value = i; option.dataset.name = attachment.name; option.disabled = attachment.stencil; ui.attachment.append(option);
    });
    const matching = event._target.attachments.findIndex(attachment => attachment.name === previous && !attachment.stencil);
    if (this.host.preview && event.kind === 'Clear') ui.attachment.value = event._target.defaultAttachment;
    else if (matching >= 0) ui.attachment.value = matching;
    const hasMesh = !!(event._object || event._geometry);
    if (this.textureView?.index !== event.index) this.textureView = null;
    if (this.view === 'texture' && !this.textureView) this.view = 'output';
    if ((!hasMesh || passId != null) && this.view === 'mesh') this.view = 'output';
    const attributes = event._object?.geometry.attributes || {};
    for (const [mode, enabled] of Object.entries({ uvChecker: !!attributes.uv, uvLayout: !!attributes.uv,
      vertexColor: !!attributes.color || event._geometry?.stride >= 6, normals: !!attributes.normal || !!event._geometry, tangents: !!attributes.tangent,
      blendshapes: !!event._object?.object.morphTargetInfluences?.length })) ui.meshMode.querySelector(`[value=${mode}]`).disabled = !enabled;
    if (ui.meshMode.selectedOptions[0]?.disabled) ui.meshMode.value = 'shaded';
    this.MarkSelection(); this.Header(event); this.DrawPreview(); this.Properties(event);
  }
  Header(event) {
    if (!event) return;
    const ui = this.ui, capture = this.debugger.capture, pass = this.selectedPass != null ? capture.passes[this.selectedPass] : null;
    ui.eventId.hidden = !!pass; ui.eventId.textContent = `#${event.index + 1}`;
    ui.selected.textContent = pass?.name ?? (event.draw ? event.label : `${event.kind} ${event.label}`.trim());
    ui.selected.title = ui.selected.textContent;
    ui.crumbs.replaceChildren();
    const chain = [];
    for (let id = pass ? pass.parent : event.pass; id != null; id = capture.passes[id].parent) chain.unshift(capture.passes[id]);
    chain.forEach((row, i) => {
      if (i) ui.crumbs.append(this.El('span', '›'));
      const button = this.El('button', row.name); button.title = `选中 ${row.path}（跳到其最后一个事件）`; button.onclick = () => this.Select(row.last, row.id); ui.crumbs.append(button);
    });
    if (chain.length) ui.crumbs.append(this.El('span', '→'));
    const targetName = this.El('span', event.target); targetName.title = event.target; ui.crumbs.append(targetName);
    const Chip = (label, value, hot = false) => { const chip = this.El('span', '', `chip${hot ? ' hot' : ''}`); chip.append(this.El('span', label, 'muted'), this.El('b', value)); return chip; };
    const target = pass || event, share = capture.gpuMs && target.gpuMs != null ? target.gpuMs / capture.gpuMs : 0;
    const gpu = Chip(this.host.preview ? 'GPU ms ≈' : 'GPU ms', Ms(target.gpuMs), true);
    if (share) gpu.title = `占帧 GPU 耗时 ${(share * 100).toFixed(1)}%`;
    ui.chips.replaceChildren(Chip('CPU ms', Ms(target.cpuMs)), gpu);
    if (pass) ui.chips.prepend(Chip('DC', Count(pass.draws)));
    else if (event.drawInfo) ui.chips.prepend(Chip(event.drawInfo.topology === 'TRIANGLES' ? '三角形' : '图元', Count(Primitives(event.drawInfo))));
  }
  Locate() {
    const event = this.debugger._events[this.debugger.selected], ref = event?._object;
    if (!ref) { this.ui.previewError.textContent = '此事件没有 three.js 源对象（Clear / Blit / 原始 GL 调用）。'; return; }
    console.info('[Frame Debugger] Captured source object', ref.object, ref.geometry, ref.material);
    this.debugger.selection = { object: ref.object, geometry: ref.geometry, material: ref.material };
    this.ui.previewError.textContent = '已在游戏控制台定位对象';
  }
  // ---------------------------------------------------------------- preview
  UpdatePreviewModes(event) {
    const ui = this.ui, view = this.view;
    const output = view === 'output';
    const attachment = event?._target.attachments[Number(ui.attachment.value)];
    const texture = event?.textures?.[this.textureView?.binding];
    const scalar = output ? attachment?.depth || attachment?.scalar : texture?.scalar;
    const canAdjust = view !== 'mesh' && !!(output ? attachment && !attachment.previewError : texture && !texture.previewError);
    for (const button of ui.viewModes.children) {
      const value = button.dataset.value, active = !!event && view === value;
      button.disabled = !event || (value === 'mesh' && !(event._object || event._geometry)) || (value === 'texture' && !this.textureView);
      button.classList.toggle('on', active); button.setAttribute('aria-pressed', active);
    }
    for (const button of ui.channel.children) {
      const active = canAdjust && !scalar && this.channel === button.dataset.value;
      button.disabled = !canAdjust || scalar;
      button.classList.toggle('on', active); button.setAttribute('aria-pressed', active);
    }
    ui.channel.hidden = !canAdjust || !!scalar;
    ui.adjustments.hidden = !canAdjust;
    if (!canAdjust) ui.adjustments.open = false;
    ui.attachment.hidden = !output && !!event; ui.attachment.disabled = !attachment;
    ui.zoom.disabled = !canAdjust;
    ui.locate.disabled = !event?._object;
  }

  DrawPreview() {
    if (!this.debugger.frozen) return;
    const ui = this.ui; ui.previewError.textContent = '';
    const index = this.debugger.selected, event = this.debugger._events[index];
    const view = this.view, isMesh = view === 'mesh';
    this.UpdatePreviewModes(event);
    ui.output.width = ui.output.height = 1; ui.output.classList.add('emptyImage'); ui.png.disabled = true; this.previewSource = null;
    ui.pixel.hidden = ui.previewLabel.hidden = true;
    ui.output.style.display = isMesh ? 'none' : ''; ui.mesh.style.display = isMesh ? 'block' : 'none'; ui.meshControls.hidden = !isMesh;
    ui.preview.classList.toggle('zoom', !isMesh && ui.zoom.getAttribute('aria-pressed') === 'true');
    ui.wireframe.disabled = ui.meshMode.value === 'uvLayout';
    ui.morph.closest('label').hidden = ui.meshMode.value !== 'blendshapes';
    const options = { channel: this.channel, black: Number(ui.black.value), white: Number(ui.white.value), exposure: Number(ui.exposure.value) };
    try {
      const attachment = event?._target.attachments[Number(ui.attachment.value)];
      const output = view !== 'texture' && (!isMesh || ui.syncView.checked) ? this.debugger.Preview(index, Number(ui.attachment.value), { ...options, width: attachment?.width || 1920 }) : null;
      if (output && ui.syncView.checked) this.debugger.Present(output);
      let shown = output, label = attachment ? `${attachment.name} · ${EnumName(this.debugger.gl, attachment.format)} · ${attachment.width}×${attachment.height}` : '';
      let previewError = attachment?.previewError;
      if (attachment?.previewSize && attachment.previewSize.join() !== [attachment.width, attachment.height].join()) label += ` · 预览 ${attachment.previewSize.join('×')}`;
      if (view === 'texture' && this.textureView) {
        const texture = event.textures[this.textureView.binding];
        shown = this.debugger.TexturePreview(index, this.textureView.binding, { ...options, width: Math.min(2048, texture.width || 1024) });
        label = `${texture.name} · ${texture.width ?? '?'}×${texture.height ?? '?'}`;
        previewError = texture.previewError;
      }
      this.previewSource = shown ? { width: view === 'texture' ? event.textures[this.textureView.binding].width || shown.width : attachment?.width || shown.width,
        height: view === 'texture' ? event.textures[this.textureView.binding].height || shown.height : attachment?.height || shown.height } : null;
      ui.previewLabel.hidden = !label || (!isMesh && !shown); ui.previewLabel.textContent = label;
      if (isMesh) {
        this.mesh ??= new FrameDebugMesh(ui.mesh);
        this.mesh.SetEvent(event, ui.meshMode.value, !ui.wireframe.disabled && ui.wireframe.checked, Number(ui.morph.value));
        ui.previewLabel.textContent = event._geometry?.name || event.details?.geometry || '网格';
        ui.previewLabel.hidden = false; ui.png.disabled = false;
      } else if (shown) {
        ui.output.width = shown.width; ui.output.height = shown.height;
        ui.output.classList.remove('emptyImage');
        ui.output.style.setProperty('--image-aspect', shown.width / shown.height);
        const context = ui.output.getContext('2d', { willReadFrequently: true }), data = context.createImageData(shown.width, shown.height); data.data.set(shown.pixels); context.putImageData(data, 0, 0);
        ui.png.disabled = false;
      } else ui.previewError.textContent = previewError || '无预览';
    } catch (error) { ui.previewError.textContent = String(error.message || error); }
    this.lastRevision = this.debugger.revision;
  }
  SourcePixel(event) {
    const canvas = this.ui.output, rect = canvas.getBoundingClientRect(); if (!this.previewSource || !rect.width) return null;
    const x = Math.floor((event.clientX - rect.left) / rect.width * this.previewSource.width), y = Math.floor((event.clientY - rect.top) / rect.height * this.previewSource.height);
    return x < 0 || y < 0 || x >= this.previewSource.width || y >= this.previewSource.height ? null : [x, y];
  }
  // Same call agents use (Tengxian.FrameDebug.PixelHistory); shown at the top of the properties.
  PixelHistoryAt(mouse) {
    const at = !this.host.preview && this.view === 'output' && this.SourcePixel(mouse); if (!at) return;
    const event = this.debugger._events[this.debugger.selected];
    try { this.pixelHistory = this.debugger.PixelHistory(at[0], at[1], { event: event.index, attachment: Number(this.ui.attachment.value) || 0 }); }
    catch (error) { this.ui.previewError.textContent = String(error.message || error); return; }
    this.folds.set('pixel', true); this.propertyView = 'details'; this.Properties(event); this.lastRevision = this.debugger.revision;
    this.ui.properties.scrollTop = 0;
  }
  PixelHistoryFold(root) {
    const history = this.pixelHistory, Value = value => { const span = this.El('span'); span.append(this.Swatch(value), this.El('span', `(${value.map(Num).join(', ')})`)); return span; };
    this.Fold(root, 'pixel', `Pixel History · (${history.x}, ${history.y}) · ${history.target}/${history.attachment}`, `${history.writes} 次改写`, (body, tools) => {
      const all = this.El('label'); const box = this.El('input'); box.type = 'checkbox'; box.checked = !!this.pixelHistoryAll; all.append(box, ' 显示未改值的事件');
      all.onclick = click => click.stopPropagation(); tools.append(all);
      const content = this.El('div'); body.append(content);
      const Draw = () => {
        content.replaceChildren();
        const cards = this.El('div', '', 'cards'); content.append(cards);
        this.Card(cards, 'Pixel', [['坐标', `(${history.x}, ${history.y})，左上为原点`], ['格式', history.format], ['帧起始', Value(history.initial)], ['截至 #' + (history.event + 1), Value(history.final)]]);
        const rows = history.history.filter(item => item.changed || this.pixelHistoryAll);
        this.Table(content, ['#', '事件', 'Pass', '写后原始值', ''], rows.map(item => {
          const link = this.El('a', `${item.kind} ${item.label}`); link.href = '#'; link.onclick = click => { click.preventDefault(); this.Select(item.index); };
          return [String(item.index + 1), link, item.path, Value(item.value), item.changed ? '改写' : '未变'];
        }));
      };
      box.onchange = () => { this.pixelHistoryAll = box.checked; Draw(); };
      Draw();
    }, true);
  }
  Pixel(event) {
    const canvas = this.ui.output, rect = canvas.getBoundingClientRect(); if (!this.previewSource || !rect.width) return;
    const x = Math.floor((event.clientX - rect.left) / rect.width * canvas.width), y = Math.floor((event.clientY - rect.top) / rect.height * canvas.height);
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
    const [r, g, b, a] = canvas.getContext('2d', { willReadFrequently: true }).getImageData(x, y, 1, 1).data;
    const sx = Math.floor(x * this.previewSource.width / canvas.width), sy = Math.floor(y * this.previewSource.height / canvas.height);
    this.ui.pixel.hidden = false; this.ui.pixel.textContent = `(${sx}, ${sy}) 显示值 ${[r, g, b, a].map(v => (v / 255).toFixed(3)).join(' ')}`;
  }
  ShowTexture(binding) {
    const event = this.debugger._events[this.debugger.selected], texture = event.textures[binding];
    this.textureView = { binding, index: event.index, uniform: texture.uniform, arrayIndex: texture.arrayIndex };
    this.view = 'texture';
    this.DrawPreview();
  }
  // ---------------------------------------------------------------- properties
  Fold(root, key, title, count, Build, open = false) {
    const box = this.El('details', '', 'fold'); box.open = this.folds.has(key) ? this.folds.get(key) : open;
    const summary = this.El('summary'); summary.append(this.El('span', title));
    if (count != null) summary.append(this.El('span', String(count), 'count'));
    if (count === 0) {
      box.open = false; box.classList.add('emptyFold'); summary.setAttribute('aria-disabled', 'true');
      summary.onclick = event => event.preventDefault();
      box.append(summary); root.append(box); return box;
    }
    const tools = this.El('span', '', 'tools'); summary.append(tools); box.append(summary);
    const body = this.El('div', '', 'foldBody'); box.append(body);
    let built = false;
    const Render = () => { if (built || !box.open) return; built = true; try { Build(body, tools); } catch (error) { body.append(this.El('div', String(error.message || error), 'error')); } };
    box.ontoggle = () => { this.folds.set(key, box.open); Render(); };
    root.append(box); Render();
    return box;
  }
  Card(root, title, rows) {
    const card = this.El('div', '', 'card'); card.append(this.El('h3', title));
    const list = this.El('dl', '', 'kv');
    for (const [key, value, hint] of rows) {
      if (value === undefined) continue;
      const dd = this.El('dd');
      if (value instanceof this.win.Node) dd.append(value); else dd.textContent = value == null || value === '' ? '—' : String(value);
      if (value === 'Off' || value === false || value === 'false') dd.classList.add('off');
      if (hint) dd.append(this.El('span', hint, 'hint'));
      list.append(this.El('dt', key), dd);
    }
    card.append(list); root.append(card); return card;
  }
  Table(root, columns, rows) {
    const table = this.El('table'), head = this.El('tr');
    for (const column of columns) head.append(this.El('th', column));
    table.append(head);
    for (const cells of rows) {
      const tr = this.El('tr');
      cells.forEach((value, i) => {
        const td = this.El('td');
        if (value instanceof this.win.Node) td.append(value); else td.textContent = value == null ? '—' : String(value);
        if (i === 0) td.className = 'k'; tr.append(td);
      });
      table.append(tr);
    }
    root.append(table); return table;
  }
  Swatch(values) {
    const span = this.El('span', '', 'swatch'), [r, g, b, a = 1] = values.map(value => Math.max(0, Math.min(1, value)));
    span.style.background = `rgba(${r * 255 | 0},${g * 255 | 0},${b * 255 | 0},${a})`; return span;
  }
  UniformValue(uniform) {
    const Format = value => {
      if (!Array.isArray(value)) return Num(value);
      const matrix = uniform.type.match(/MAT([234])(?:x([234]))?/);
      if (matrix) {
        const columns = Number(matrix[1]), rows = Number(matrix[2] || matrix[1]), grid = this.El('div', '', 'matrix');
        grid.style.gridTemplateColumns = `repeat(${columns}, max-content)`;
        for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) grid.append(this.El('span', Num(value[c * rows + r])));
        return grid;
      }
      const text = `(${value.map(Num).join(', ')})`;
      if (/VEC[34]$/.test(uniform.type) && /col|tint|albedo|diffuse|emissive|fog|sky|sun|light/i.test(uniform.name) && value.every(v => v >= 0 && v <= 4)) {
        const span = this.El('span'); span.append(this.Swatch(value), this.El('span', text)); return span;
      }
      return text;
    };
    if (uniform.size <= 1) return Format(uniform.value);
    const box = this.El('details'); box.append(this.El('summary', `[${uniform.size}] ${Array.isArray(uniform.value) ? `${String(this.Plain(Format(uniform.value[0])))} …` : ''}`));
    const list = this.El('div');
    uniform.value.forEach((element, i) => { const line = this.El('div'); line.append(this.El('span', `[${i}] `, 'muted')); const value = Format(element); line.append(value instanceof this.win.Node ? value : this.El('span', value)); list.append(line); });
    box.append(list); return box;
  }
  Plain(value) { return value instanceof this.win.Node ? value.textContent : value; }
  Properties(event) {
    const scrollTop = this.propertyEvent === event ? this.ui.properties.scrollTop : 0;
    this.propertyEvent = event;
    this.propertyBuilders = {
      details: root => this.DetailProperties(root, event),
      shader: event.draw ? root => this.ShaderProperties(root, event) : null,
      raw: root => this.RawJson(root, event),
    };
    this.ShowProperties(this.propertyView);
    this.ui.properties.scrollTop = scrollTop;
  }
  ShowProperties(view) {
    const ui = this.ui, builders = this.propertyBuilders;
    this.propertyView = builders?.[view] ? view : 'details';
    for (const button of ui.propertyTabs.children) {
      const value = button.dataset.value, active = value === this.propertyView;
      button.disabled = !builders?.[value];
      button.classList.toggle('on', active); button.setAttribute('aria-pressed', active);
    }
    ui.properties.replaceChildren();
    builders?.[this.propertyView]?.(ui.properties);
    ui.properties.scrollTop = 0;
  }
  DetailProperties(root, event) {
    const d = event.details, capture = this.debugger.capture, gl = this.debugger.gl;
    const pass = this.selectedPass != null ? capture.passes[this.selectedPass] : null;
    if (this.pixelHistory) this.PixelHistoryFold(root);
    if (pass) this.Fold(root, 'group', '分组统计', null, body => {
      const cards = this.El('div', '', 'cards'); body.append(cards);
      this.Card(cards, '分组', [['路径', pass.path], ['类型', pass.viewport ? '视口' : pass.synthetic ?? 'Pass'], ['事件', `#${pass.first + 1} – #${pass.last + 1}`],
        ['Draw Calls', Count(pass.draws)], ['CPU', `${Ms(pass.cpuMs)} ms`], ['GPU', `${Ms(pass.gpuMs)} ms`], [this.host.preview ? '渲染事件' : 'GL 命令', Count(pass.commandEnd - pass.commandStart)]]);
      const top = capture.events.slice(pass.first, pass.last + 1).filter(item => item.draw && item.gpuMs != null).sort((a, b) => b.gpuMs - a.gpuMs).slice(0, 8);
      if (top.length) {
        const card = this.El('div', '', 'card'); card.append(this.El('h3', '最耗 GPU 的 DC'));
        this.Table(card, ['#', '事件', 'GPU ms'], top.map(item => { const link = this.El('a', `${item.kind} ${item.label}`); link.href = '#'; link.onclick = click => { click.preventDefault(); this.Select(item.index); }; return [String(item.index + 1), link, Ms(item.gpuMs)]; }));
        cards.append(card);
      }
    });
    const cards = this.El('div', '', 'cards detailContent'); root.append(cards);
    this.Card(cards, '事件', [['类型', event.kind], ['API', ApiCall(gl, event)],
      ['Pass', event.path], ['CPU', `${Ms(event.cpuMs)} ms`, event.draw && event.cpuMs !== event.cpuSubmitMs ? `GL 提交 ${Ms(event.cpuSubmitMs)} ms` : ''],
      [this.host.preview ? 'GPU ≈' : 'GPU', `${Ms(event.gpuMs)} ms`],
      ['Batch cause', event.batchCause ?? undefined]]);
    if (event.drawInfo) {
      const info = event.drawInfo, primitives = Primitives(info);
      this.Card(cards, '绘制', [['拓扑', info.topology], ['索引类型', info.indexed ? info.indexType : '—'], ['元素', Count(info.elements)],
        ['图元', Count(Math.round(primitives))], ['实例', Count(info.parts.reduce((sum, part) => sum + part.instances, 0))], ['子绘制', info.batch ? Count(info.subDraws) : undefined],
        ['合并几何块', info.geometryBatches ? Count(info.geometryBatches) : undefined],
        ['Vertices (buffer)', d ? Count(d.vertices) : undefined], ['Indices (buffer)', d?.indices ? Count(d.indices) : undefined],
        ['Draw range', d ? `${d.drawRange.start}, ${d.drawRange.count === Infinity ? '∞' : d.drawRange.count}` : undefined],
        ['Group', d?.group ? `start ${d.group.start} · count ${d.group.count} · material ${d.group.materialIndex}` : undefined]]);
      if (info.parts.length > 1) {
        const card = this.El('div', '', 'card'); card.append(this.El('h3', `Sub-draws (${info.parts.length})`));
        this.Table(card, ['#', info.indexed ? 'Offset bytes' : 'First', 'Count', 'Instances'], info.parts.slice(0, 256).map((part, i) => [String(i), Count(info.indexed ? part.offsetBytes : part.first), Count(part.count), Count(part.instances)]));
        cards.append(card);
      }
    }
    if (d) {
      const path = this.El('span'); path.append(this.El('span', d.path));
      const copy = this.El('button', '复制', 'copyAction'); copy.onclick = () => this.win.navigator.clipboard?.writeText(d.path); path.append(copy);
      const flags = d.materialFlags;
      this.Card(cards, '网格与对象', [['显示名', d.name, `来自 ${d.nameSource}`], ['Object', `${d.object} · ${d.objectType} #${d.objectId}`], ['层级路径', path],
        ['Geometry', `${d.geometry} · ${d.geometryType} #${d.geometryId}`], ['Material', `${d.material} · ${d.shader} #${d.materialId}`],
        ['Shader', event.shaderName || d.shader, event.shaderName ? 'SHADER_NAME' : 'material.type'], ['Camera', d.camera], ['渲染队列', `${d.phase} · renderOrder ${d.renderOrder}`],
        ['Material flags', flags ? `${flags.transparent ? 'Transparent' : 'Opaque'} · ${flags.side} · Blending ${THREE_NAMES.blending.get(flags.blending) ?? flags.blending} · depthTest ${flags.depthTest ? 'On' : 'Off'} · depthWrite ${flags.depthWrite ? 'On' : 'Off'}${flags.alphaTest ? ` · alphaTest ${Num(flags.alphaTest)}` : ''}${flags.opacity !== 1 ? ` · opacity ${Num(flags.opacity)}` : ''}` : undefined],
        ['Shadows', `cast ${d.castShadow ? 'On' : 'Off'} · receive ${d.receiveShadow ? 'On' : 'Off'} · frustumCulled ${d.frustumCulled ? 'On' : 'Off'}`],
        ['Instances (object)', d.instances > 1 ? Count(d.instances) : undefined], ['Source', d.source ?? undefined]]);
    } else if (event.draw && (event._geometry || event.shaderName)) {
      this.Card(cards, '网格与程序', [['网格', event._geometry?.name], ['Shader', event.shaderName ?? undefined]]);
    }
    if (event.api === 'clearBufferfv' && this.host.preview) {
      this.Card(cards, 'Clear', [['附件', event.label], ['值', event.args[2].map(Num).join(', ')]]);
    } else if (event.kind === 'Clear' && event.state) {
      const s = event.state, color = this.El('span'); color.append(this.Swatch(s.COLOR_CLEAR_VALUE), this.El('span', `(${s.COLOR_CLEAR_VALUE.map(Num).join(', ')})`));
      this.Card(cards, 'Clear', [['Buffers', event.label.replace(/[()]/g, '')], ['Color', color], ['Depth', Num(s.DEPTH_CLEAR_VALUE)], ['Stencil', String(s.STENCIL_CLEAR_VALUE)]]);
    }
    const target = event._target, card = this.Card(cards, '渲染目标', [['名称', target.name], ['尺寸', `${target.width} × ${target.height}`],
      ['Initial action', target.initialAction ?? undefined]]);
    this.Table(card, ['Attachment', 'Format', 'Size', 'MSAA', 'Level/Face/Layer'], target.attachments.map(attachment => [attachment.name, String(EnumName(gl, attachment.format)),
      `${attachment.width}×${attachment.height}`, attachment.samples ? `×${attachment.samples}` : 'Off', `${attachment.level || 0} / ${attachment.face ? EnumName(gl, attachment.face) : 0} / ${attachment.layer || 0}`]));
    if (event.state) this.Card(cards, '渲染状态', RenderStateRows(event.state, Num));
  }
  ShaderProperties(root, event) {
    const d = event.details, program = this.debugger.capture.programs[event.programId];
    const defines = new Map();
    for (const source of program?.sources || []) for (const match of source.source?.matchAll(/^\s*#define\s+(\w+)(?:[ \t]+(.+))?$/gm) || []) {
      const entry = defines.get(match[1]) || { value: (match[2] || '').trim(), stages: new Set() }; entry.stages.add(source.stage[0]); defines.set(match[1], entry);
    }
    const materialDefines = Object.entries(d?.keywords || {});
    this.Fold(root, 'keywords', 'Keywords', defines.size + materialDefines.length, body => {
      if (materialDefines.length) {
        body.append(this.El('h4', 'Material defines'));
        const list = this.El('div', '', 'keywords'); for (const [name, value] of materialDefines) list.append(this.Keyword(name, value, '')); body.append(list);
      }
      if (materialDefines.length && defines.size) body.append(this.El('h4', 'GLSL #define'));
      const list = this.El('div', '', 'keywords');
      for (const [name, entry] of [...defines].sort((a, b) => a[0].localeCompare(b[0]))) list.append(this.Keyword(name, entry.value, entry.stages.size === 1 ? [...entry.stages][0] : ''));
      body.append(list);
    });
    const textures = event.textures || [];
    this.PropertyFold(root, 'Textures', textures.length, (body, keep) => this.TextureTable(body, event, textures, keep));
    for (const group of ['Ints', 'Floats', 'Vectors', 'Matrices']) {
      const rows = event.uniforms.filter(uniform => uniform.group === group);
      this.PropertyFold(root, group, rows.length, (body, keep) =>
        this.Table(body, ['Name', 'Value', 'Type'], rows.filter(uniform => keep(uniform.name)).map(uniform =>
          [uniform.name.replace(/\[0\]$/, ''), this.UniformValue(uniform), `${GlslType(uniform.type)}${uniform.size > 1 ? `[${uniform.size}]` : ''}`])));
    }
    this.Fold(root, 'buffers', 'Buffers', d?.attributes.length ?? event.buffers?.length ?? 0, body => {
      if (d) {
        body.append(this.El('h4', 'Vertex attributes'));
        this.Table(body, ['Name', 'Components', 'Type', 'Normalized', 'Count', 'Bytes', 'Divisor'], d.attributes.map(a => [a.name, String(a.itemSize), a.type, a.normalized ? 'Yes' : 'No', Count(a.count), Count(a.bytes), String(a.divisor)]));
        body.append(this.El('h4', 'Index buffer'));
        this.Table(body, ['Type', 'Indices', 'Instances'], [[event.drawInfo?.indexType || 'Non-indexed', Count(d.indices), Count(d.instances)]]);
      } else this.Table(body, ['Name', 'Location', 'Components', 'Type', 'Stride', 'Offset'], event.buffers.map(attribute =>
        [attribute.name, String(attribute.location), String(attribute.size), attribute.type, Count(attribute.stride), Count(attribute.offset)]));
    });
    const blocks = event.blocks || [];
    this.Fold(root, 'constantBuffers', 'Constant Buffers', blocks.length, body =>
      this.Table(body, ['Block', 'Binding', 'Bytes'], blocks.map(block => [block.name, String(block.binding), Count(block.bytes)])));
    this.Fold(root, 'shader', 'GLSL 源码', program?.sources.length ?? 0, body => {
      for (const source of program?.sources || []) {
        const lines = (source.source || '').split('\n'), header = this.El('h4', `${source.stage} shader`);
        const copy = this.El('button', '复制', 'copyAction'); copy.onclick = () => this.win.navigator.clipboard?.writeText(source.source || ''); header.append(copy);
        body.append(header, this.Code(lines));
      }
    });
  }
  Keyword(name, value, stage) {
    const chip = this.El('span', name, `kw${stage === 'V' ? ' v' : stage === 'F' ? ' f' : ''}`);
    if (value !== '' && value != null) chip.append(this.El('i', ` = ${String(value).slice(0, 40)}`));
    if (stage) chip.append(this.El('i', ` ${stage}`));
    chip.title = `${name}${value !== '' ? ` ${value}` : ''}${stage ? `\n只出现在 ${stage === 'V' ? 'Vertex' : 'Fragment'} shader` : ''}`;
    return chip;
  }
  PropertyFold(root, group, count, build) {
    this.Fold(root, group, group, count, (body, tools) => {
      const filter = this.El('input'); filter.type = 'search'; filter.className = 'filter'; filter.placeholder = '筛选属性';
      filter.setAttribute('aria-label', `筛选 ${group}`); filter.onclick = click => click.stopPropagation();
      const content = this.El('div'); body.append(content);
      const Update = () => {
        content.replaceChildren();
        const query = filter.value.trim().toLowerCase();
        build(content, name => name.toLowerCase().includes(query));
      };
      if (count > 8) { tools.append(filter); filter.oninput = Update; }
      Update();
    });
  }
  TextureTable(root, event, textures, keep) {
    const rows = textures.map((texture, i) => ({ texture, i })).filter(({ texture }) => keep(`${texture.uniform} ${texture.name}`));
    this.Table(root, ['', 'Name', 'Unit', 'Sampler', 'Texture', 'Size', 'Format'], rows.map(({ texture, i }) => {
      const thumb = this.Thumbnail(event, texture, i);
      const name = this.El('span', texture.name);
      if (texture.source) {
        try {
          const url = new URL(texture.source, location.href);
          if (['http:', 'https:', 'blob:'].includes(url.protocol) || /^data:image\//i.test(url.href)) { const link = this.El('a', ' ↗'); link.href = url.href; link.target = '_blank'; link.rel = 'noopener'; link.title = url.href; name.append(link); }
        } catch { /* ignore invalid source */ }
      }
      const format = texture.format == null ? '—' : [THREE_NAMES.format.get(texture.format) ?? texture.format,
        THREE_NAMES.type.get(texture.type) ?? texture.type].filter(value => value != null).join(' · ');
      return [thumb, `${texture.uniform.replace(/\[0\]$/, '')}${texture.arrayIndex || /\[0\]$/.test(texture.uniform) ? `[${texture.arrayIndex}]` : ''}`, String(texture.unit),
        GlslType(texture.sampler), name, texture.width ? `${texture.width}×${texture.height}${texture.depth > 1 ? `×${texture.depth}` : ''}` : '—', `${format}${texture.colorSpace && texture.colorSpace !== 'NoColorSpace' && texture.colorSpace !== '' ? ` · ${texture.colorSpace}` : ''}`];
    }));
  }
  Thumbnail(event, texture, binding) {
    if (!/^SAMPLER_2D(_SHADOW)?$/.test(texture.sampler) || texture.name === 'Unbound' || (this.host.preview && !texture.previewSize)) {
      const none = this.El('span', '—', 'thumb none'); none.title = texture.previewError || texture.sampler; return none;
    }
    const canvas = this.El('canvas', '', 'thumb');
    const button = this.El('button', '', 'thumbButton'); button.title = `预览 ${texture.uniform}`; button.append(canvas);
    button.onclick = () => this.ShowTexture(binding);
    // Each thumbnail is a GPU readback; fill them after the step so holding → stays fluid.
    (this.thumbJobs ??= []).push(() => {
      if (!this.debugger.frozen || this.debugger.selected !== event.index || !canvas.isConnected) return;
      try {
        const image = this.debugger.TexturePreview(event.index, binding, { width: 88 });
        canvas.width = image.width; canvas.height = image.height;
        const context = canvas.getContext('2d'), data = context.createImageData(image.width, image.height); data.data.set(image.pixels); context.putImageData(data, 0, 0);
      } catch (error) { canvas.title = String(error.message || error); }
      this.lastRevision = this.debugger.revision;
    });
    this.win.clearTimeout(this.thumbTimer);
    this.thumbTimer = this.win.setTimeout(() => { const jobs = this.thumbJobs; this.thumbJobs = []; jobs.forEach(Job => Job()); }, 120);
    return button;
  }
  Code(lines) {
    const box = this.El('div', '', 'code'), numbers = this.El('div', '', 'ln'), source = this.El('div', '', 'src');
    numbers.textContent = lines.map((_, i) => i + 1).join('\n');
    for (const [i, line] of lines.entries()) {
      const trimmed = line.trimStart();
      const span = this.El('span', line, trimmed.startsWith('#') ? 'pp' : trimmed.startsWith('//') ? 'cm' : '');
      source.append(span, i < lines.length - 1 ? '\n' : '');
    }
    box.append(numbers, source); return box;
  }
  RawJson(root, event) {
    const { _target, _object, _geometry, _textureHandles, textures, uniforms, ...rest } = event;
    root.append(this.El('pre', JSON.stringify({ ...rest, uniforms: uniforms.length, textures: textures?.map(({ _handle, ...texture }) => texture) }, null, 2), 'json detailContent'));
  }
  Download(blob, name) {
    const url = URL.createObjectURL(blob), link = this.El('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  Exit() { clearInterval(this.timer); this.debugger.Resume(); this.mesh?.Dispose(); this.mesh = null; if (this.win && !this.win.closed) this.win.close(); this.win = null; }
}
