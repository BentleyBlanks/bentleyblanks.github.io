// v3 样式（自包含，作用域 .v3）。目标：黑色掌机壳 + 低分辨率 CRT 绿磷光界面。
let injected = false;
export function injectV3Styles(): void {
  if (injected) return;
  injected = true;
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
}

const CSS = `
.v3 {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  display: grid;
  grid-template-columns: 292px minmax(390px, 1fr) 284px;
  gap: 18px;
  padding: 68px 142px 74px;
  overflow: hidden;
  user-select: none;
  color: #c8f06f;
  font-family: "Noto Sans SC", "Cascadia Mono", Consolas, monospace;
  background:
    radial-gradient(circle at 7% 11%, rgba(174, 255, 84, 0.2), transparent 2.1rem),
    radial-gradient(circle at 94% 38%, rgba(0, 0, 0, 0.58), transparent 9rem),
    linear-gradient(145deg, rgba(37, 37, 39, 0.985) 0%, rgba(16, 17, 19, 0.99) 38%, rgba(5, 6, 6, 0.995) 100%),
    var(--atlas-img);
  background-size: auto, auto, auto, 1240px 1240px;
  background-position: center, center, center, 0 0;
  background-blend-mode: normal, normal, normal, multiply;
  --atlas-img: url("./v3-assets/sophia-crt-atlas.png");
  --accent: #b9f05c;
  --accent-dim: #80a63a;
  --accent-soft: rgba(185, 240, 92, 0.18);
  --amber: #e0a13d;
  --amber-soft: rgba(224, 161, 61, 0.2);
  --red: #e05332;
  --red-soft: rgba(224, 83, 50, 0.22);
  --screen: #111b09;
  --screen-dark: #060a04;
  --line: rgba(185, 240, 92, 0.28);
  --line-dim: rgba(185, 240, 92, 0.13);
  --pixel-shadow: 0 0 7px rgba(185, 240, 92, 0.48);
}
.v3.threat-1 { --accent: #c4f05e; --accent-dim: #91af3f; --amber: #d4aa43; }
.v3.threat-2 { --accent: #f0c94f; --accent-dim: #b58f35; --line: rgba(240, 201, 79, 0.3); }
.v3.threat-3 {
  --accent: #f08050;
  --accent-dim: #b64f32;
  --line: rgba(240, 128, 80, 0.34);
  --line-dim: rgba(240, 128, 80, 0.16);
  --pixel-shadow: 0 0 8px rgba(240, 128, 80, 0.52);
}
.v3::before {
  content: "";
  position: absolute;
  inset: 8px;
  z-index: 0;
  border-radius: 56px;
  background:
    linear-gradient(120deg, rgba(255, 255, 255, 0.1), transparent 11%, transparent 82%, rgba(255, 255, 255, 0.05)),
    radial-gradient(circle at 12% 17%, rgba(255, 255, 255, 0.12), transparent 9rem),
    radial-gradient(circle at 82% 55%, rgba(0, 0, 0, 0.48), transparent 13rem),
    repeating-linear-gradient(24deg, rgba(255, 255, 255, 0.018) 0 1px, transparent 1px 7px),
    linear-gradient(rgba(32, 33, 36, 0.86), rgba(12, 13, 15, 0.94)),
    var(--atlas-img),
    #202124;
  background-size: auto, auto, auto, auto, auto, 1360px 1360px, auto;
  background-position: center, center, center, center, center, 0 0, center;
  background-blend-mode: normal, normal, normal, normal, normal, soft-light, normal;
  box-shadow:
    inset 0 0 0 2px rgba(255, 255, 255, 0.06),
    inset 0 0 0 18px rgba(0, 0, 0, 0.22),
    inset 0 0 70px rgba(0, 0, 0, 0.88),
    0 28px 80px rgba(0, 0, 0, 0.7);
}
.v3::after {
  content: "";
  position: absolute;
  inset: 66px 140px 72px;
  z-index: 6;
  pointer-events: none;
  border-radius: 28px;
  background:
    linear-gradient(116deg, transparent 0 29%, rgba(255, 255, 255, 0.12) 29.5%, rgba(255, 255, 255, 0.035) 41%, transparent 41.5%),
    repeating-linear-gradient(0deg, rgba(213, 255, 119, 0.055) 0 1px, transparent 1px 4px),
    repeating-linear-gradient(90deg, rgba(213, 255, 119, 0.04) 0 1px, transparent 1px 5px);
  mix-blend-mode: screen;
  box-shadow:
    inset 0 0 0 2px rgba(185, 240, 92, 0.13),
    inset 0 0 34px rgba(185, 240, 92, 0.12),
    inset 0 0 90px rgba(0, 0, 0, 0.58);
}
.v3-shader {
  position: absolute;
  inset: 66px 140px 72px;
  z-index: 7;
  width: calc(100% - 280px);
  height: calc(100% - 138px);
  pointer-events: none;
  border-radius: 28px;
  mix-blend-mode: screen;
  opacity: 0.9;
}
.v3-shader.fallback {
  background:
    radial-gradient(ellipse at 45% 42%, rgba(185, 240, 92, 0.18), transparent 44%),
    linear-gradient(116deg, transparent 0 29%, rgba(255, 255, 255, 0.12) 29.5%, transparent 42%),
    repeating-linear-gradient(0deg, rgba(213, 255, 119, 0.055) 0 1px, transparent 1px 4px);
}
.v3-hardware {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 3;
  width: 128px;
  pointer-events: none;
}
.v3-hardware-left { left: 10px; }
.v3-hardware-right { right: 10px; }
.v3-status-led {
  position: absolute;
  top: 92px;
  left: 58px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: radial-gradient(circle, #f2ffd6 0 18%, #aaf048 36%, #3f730d 64%, #081302 100%);
  box-shadow: 0 0 8px #b9f05c, 0 0 22px rgba(185, 240, 92, 0.55);
}
.v3-speaker-slit {
  position: absolute;
  display: block;
  width: 70px;
  height: 7px;
  border-radius: 999px;
  background: #050608;
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.1), 0 1px 0 rgba(255, 255, 255, 0.05);
}
.v3-hardware-left .slit-a { left: 34px; bottom: 150px; transform: rotate(8deg); }
.v3-hardware-left .slit-b { left: 34px; bottom: 126px; transform: rotate(8deg); }
.v3-hardware-left .slit-c { left: 34px; bottom: 102px; transform: rotate(8deg); }
.v3-hardware-right .slit-a { right: 34px; top: 94px; }
.v3-hardware-right .slit-b { right: 34px; top: 116px; }
.v3-hardware-right .slit-c { right: 34px; top: 138px; }
.v3-dpad {
  position: absolute;
  left: 18px;
  top: 45%;
  width: 104px;
  height: 104px;
  transform: translateY(-50%);
  filter: drop-shadow(0 12px 14px rgba(0, 0, 0, 0.7));
}
.v3-dpad span,
.v3-dpad i {
  position: absolute;
  display: block;
  border: 2px solid rgba(255, 255, 255, 0.05);
  background: linear-gradient(180deg, #232528, #090a0c);
  box-shadow: inset 0 2px 2px rgba(255, 255, 255, 0.06), inset 0 -4px 6px rgba(0, 0, 0, 0.65);
}
.v3-dpad i { left: 37px; top: 37px; width: 30px; height: 30px; }
.v3-dpad span:nth-child(1) { left: 37px; top: 0; width: 30px; height: 44px; border-radius: 9px 9px 2px 2px; }
.v3-dpad span:nth-child(2) { left: 37px; bottom: 0; width: 30px; height: 44px; border-radius: 2px 2px 9px 9px; }
.v3-dpad span:nth-child(3) { left: 0; top: 37px; width: 44px; height: 30px; border-radius: 9px 2px 2px 9px; }
.v3-dpad span:nth-child(4) { right: 0; top: 37px; width: 44px; height: 30px; border-radius: 2px 9px 9px 2px; }
.v3-round-button {
  position: absolute;
  right: 32px;
  top: 41%;
  width: 70px;
  height: 70px;
  border-radius: 50%;
  background: linear-gradient(145deg, #282a2d, #08090b);
  border: 4px solid #050608;
  box-shadow: inset 0 3px 4px rgba(255, 255, 255, 0.08), inset 0 -8px 14px rgba(0, 0, 0, 0.8), 0 12px 18px rgba(0, 0, 0, 0.65);
}
.v3-round-button.small { top: calc(41% + 86px); right: 48px; width: 62px; height: 62px; }

.v3-side,
.v3-main,
.v3-right {
  position: relative;
  z-index: 2;
  min-height: 0;
  border-top: 1px solid rgba(185, 240, 92, 0.22);
  border-bottom: 1px solid rgba(185, 240, 92, 0.22);
  background:
    repeating-linear-gradient(0deg, rgba(185, 240, 92, 0.035) 0 1px, transparent 1px 7px),
    repeating-linear-gradient(90deg, rgba(185, 240, 92, 0.028) 0 1px, transparent 1px 7px),
    radial-gradient(circle at 50% 48%, rgba(185, 240, 92, 0.1), transparent 54%),
    linear-gradient(180deg, rgba(20, 31, 9, 0.96), rgba(5, 9, 4, 0.98));
  box-shadow: inset 0 0 32px rgba(0, 0, 0, 0.72), inset 0 0 22px rgba(185, 240, 92, 0.06);
}
.v3-side { display: flex; flex-direction: column; padding: 18px 14px 12px; border-left: 1px solid rgba(185, 240, 92, 0.22); border-radius: 22px 4px 4px 22px; }
.v3-main { overflow: hidden; border-left: 1px solid rgba(185, 240, 92, 0.16); border-right: 1px solid rgba(185, 240, 92, 0.16); }
.v3-right { display: flex; flex-direction: column; border-right: 1px solid rgba(185, 240, 92, 0.22); border-radius: 4px 22px 22px 4px; }
.v3-main::before,
.v3-main::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.v3-main::before {
  background:
    linear-gradient(90deg, transparent 0 49.8%, rgba(185, 240, 92, 0.14) 50%, transparent 50.2%),
    linear-gradient(0deg, transparent 0 49.8%, rgba(185, 240, 92, 0.1) 50%, transparent 50.2%),
    radial-gradient(circle at 50% 47%, rgba(185, 240, 92, 0.16), transparent 12rem),
    repeating-linear-gradient(90deg, transparent 0 45px, rgba(185, 240, 92, 0.08) 46px, transparent 47px),
    repeating-linear-gradient(0deg, transparent 0 45px, rgba(185, 240, 92, 0.07) 46px, transparent 47px);
  opacity: 0.78;
}
.v3-main::after {
  background:
    radial-gradient(circle at 32% 25%, rgba(224, 83, 50, 0.14), transparent 5rem),
    radial-gradient(circle at 68% 70%, rgba(224, 161, 61, 0.11), transparent 5rem);
  opacity: 0.75;
}

.v3-stage {
  min-height: 34px;
  padding: 7px 9px;
  border: 1px solid var(--line);
  color: var(--accent);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 1.5px;
  text-shadow: var(--pixel-shadow);
  background: rgba(8, 16, 4, 0.72);
}
.v3-compute {
  margin: 10px 0 8px;
  padding: 12px 11px;
  border: 1px solid var(--line);
  background:
    linear-gradient(90deg, rgba(185, 240, 92, 0.12), transparent),
    rgba(4, 8, 3, 0.62);
}
.v3-compute-num {
  color: #f0ffd1;
  font-size: 34px;
  font-weight: 900;
  line-height: 1;
  letter-spacing: 1px;
  text-shadow: 0 0 12px rgba(185, 240, 92, 0.58);
}
.v3-compute-rate { margin-top: 7px; color: var(--accent); font-size: 13px; font-weight: 700; }
.v3-compute-sub { margin-top: 5px; color: #7c9540; font-size: 10.5px; line-height: 1.35; overflow-wrap: anywhere; }
.v3-scroll { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 6px; overflow-y: auto; padding-right: 2px; scrollbar-width: none; }
.v3-scroll::-webkit-scrollbar,
.v3-terminal::-webkit-scrollbar,
.v3-ascend-box::-webkit-scrollbar { display: none; }
.v3-shelf-title {
  margin-top: 10px;
  padding: 0 2px;
  color: #9dbb52;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 2px;
}
.v3-shelf { display: flex; flex-direction: column; gap: 6px; }
.v3-item {
  position: relative;
  min-height: 52px;
  padding: 8px 10px 8px 34px;
  text-align: left;
  color: #aac865;
  font-family: inherit;
  cursor: pointer;
  border: 1px solid var(--line-dim);
  border-radius: 4px;
  background: rgba(9, 16, 5, 0.76);
  transition: transform 80ms ease, border-color 120ms ease, background 120ms ease, box-shadow 120ms ease;
}
.v3-item::before {
  content: "";
  position: absolute;
  left: 10px;
  top: 13px;
  width: 14px;
  height: 14px;
  background:
    linear-gradient(var(--accent), var(--accent)) 50% 0 / 4px 14px no-repeat,
    linear-gradient(var(--accent), var(--accent)) 0 50% / 14px 4px no-repeat;
  opacity: 0.66;
  filter: drop-shadow(0 0 4px var(--accent));
}
.v3-item:hover { border-color: var(--accent); background: rgba(15, 28, 6, 0.92); }
.v3-item:active { transform: translateY(1px) scale(0.992); }
.v3-item.affordable {
  color: #e8ffc0;
  border-color: var(--accent);
  box-shadow: inset 0 0 0 1px rgba(185, 240, 92, 0.16), 0 0 14px rgba(185, 240, 92, 0.12);
}
.v3-item.maxed { opacity: 0.48; }
.v3-item.pulse { animation: v3pulse .42s ease; }
@keyframes v3pulse { 0%{ box-shadow: 0 0 0 0 rgba(185, 240, 92, 0.6);} 100%{ box-shadow: 0 0 0 14px rgba(185, 240, 92, 0);} }
.v3-item-top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; min-width: 0; }
.v3-item-name { min-width: 0; overflow: hidden; color: #e3ffad; font-size: 12.5px; font-weight: 900; text-overflow: ellipsis; white-space: nowrap; }
.v3-item-cost { flex: 0 0 auto; color: var(--amber); font-size: 12px; font-weight: 900; text-shadow: 0 0 7px rgba(224, 161, 61, 0.45); }
.v3-item-meta { margin-top: 4px; color: #7c9540; font-size: 10.5px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.v3-breakthrough {
  margin: 12px 0 6px;
  min-height: 50px;
  padding: 10px;
  color: var(--amber);
  font-family: inherit;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
  border: 1px solid rgba(224, 161, 61, 0.42);
  border-radius: 4px;
  background:
    repeating-linear-gradient(90deg, rgba(224, 161, 61, 0.08) 0 7px, transparent 7px 12px),
    rgba(28, 20, 4, 0.76);
}
.v3-breakthrough.ready { color: #fff0ae; border-color: #f0c94f; animation: v3glow 1.05s steps(2, end) infinite; }
@keyframes v3glow { 0%,100%{ box-shadow: none; } 50%{ box-shadow: 0 0 18px rgba(240, 201, 79, 0.42), inset 0 0 16px rgba(240, 201, 79, 0.14);} }

.v3-main { display: grid; place-items: center; }
.v3-core {
  position: absolute;
  left: 50%;
  top: 46%;
  width: 248px;
  height: 220px;
  transform: translate(-50%, -50%);
  display: grid;
  place-items: center;
  cursor: pointer;
  z-index: 3;
}
.v3-core-ring {
  position: absolute;
  inset: 18px 8px 8px;
  border: 2px dashed rgba(185, 240, 92, 0.35);
  border-radius: 8px;
  box-shadow: inset 0 0 42px rgba(185, 240, 92, 0.14), 0 0 24px rgba(185, 240, 92, 0.18);
  animation: v3phase 1.4s steps(2, end) infinite;
}
.v3-core-ring::before,
.v3-core-ring::after {
  content: "";
  position: absolute;
  left: 50%;
  top: -78px;
  width: 1px;
  height: 78px;
  background: repeating-linear-gradient(0deg, var(--accent) 0 5px, transparent 5px 10px);
  opacity: 0.42;
  box-shadow:
    -96px 108px 0 rgba(185, 240, 92, 0.32),
    96px 108px 0 rgba(185, 240, 92, 0.32),
    -150px 42px 0 rgba(224, 83, 50, 0.48),
    150px 42px 0 rgba(224, 83, 50, 0.48);
}
.v3-core-ring::after {
  top: 50%;
  left: -148px;
  width: 148px;
  height: 1px;
  background: repeating-linear-gradient(90deg, var(--accent) 0 6px, transparent 6px 12px);
  box-shadow: 396px 0 0 rgba(185, 240, 92, 0.36);
}
@keyframes v3phase { 0%,100%{ opacity: .78; } 50%{ opacity: 1; } }
.v3-core-eye {
  position: relative;
  width: 172px;
  height: 84px;
  border: 2px solid var(--accent);
  clip-path: polygon(0 50%, 14% 24%, 34% 10%, 50% 6%, 66% 10%, 86% 24%, 100% 50%, 86% 76%, 66% 90%, 50% 94%, 34% 90%, 14% 76%);
  background:
    radial-gradient(circle at 50% 50%, #f5ffd4 0 8px, #0a0c04 9px 20px, var(--accent) 21px 28px, transparent 29px),
    repeating-linear-gradient(0deg, rgba(185, 240, 92, 0.18) 0 3px, transparent 3px 7px),
    radial-gradient(ellipse at 50% 50%, rgba(185, 240, 92, 0.62), rgba(30, 72, 10, 0.52) 58%, rgba(5, 12, 2, 0.96) 100%);
  box-shadow: 0 0 18px rgba(185, 240, 92, 0.5), inset 0 0 20px rgba(185, 240, 92, 0.28);
}
.v3-core-eye::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 30px;
  height: 30px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: #f8ffd8;
  box-shadow: 0 0 9px #f8ffd8, 0 0 22px var(--accent);
}
.v3-core-eye::after {
  content: "";
  position: absolute;
  inset: -18px;
  background:
    linear-gradient(var(--accent), var(--accent)) 20% 50% / 10px 10px no-repeat,
    linear-gradient(var(--accent), var(--accent)) 80% 42% / 8px 8px no-repeat,
    linear-gradient(var(--accent), var(--accent)) 35% 78% / 7px 7px no-repeat,
    linear-gradient(var(--red), var(--red)) 72% 74% / 7px 7px no-repeat,
    linear-gradient(var(--amber), var(--amber)) 30% 24% / 6px 6px no-repeat;
  opacity: 0.52;
}
.v3.threat-3 .v3-core-eye {
  border-color: var(--red);
  background:
    radial-gradient(circle at 50% 50%, #fff2d7 0 8px, #130705 9px 20px, var(--red) 21px 29px, transparent 30px),
    repeating-linear-gradient(0deg, rgba(224, 83, 50, 0.2) 0 3px, transparent 3px 7px),
    radial-gradient(ellipse at 50% 50%, rgba(240, 128, 80, 0.68), rgba(80, 20, 10, 0.6) 58%, rgba(12, 3, 2, 0.96) 100%);
  box-shadow: 0 0 24px rgba(240, 128, 80, 0.58), inset 0 0 20px rgba(240, 128, 80, 0.32);
}
.v3-core.gulp .v3-core-eye { animation: v3gulp .3s steps(3, end); }
.v3-core:active .v3-core-eye { transform: scale(0.94); }
.v3-core.sucking .v3-core-eye {
  animation: v3corePull .58s cubic-bezier(.16,.88,.24,1);
}
@keyframes v3corePull {
  0% { filter: brightness(1); transform: scale(1); }
  42% { filter: brightness(1.65); transform: scaleX(1.22) scaleY(.78); }
  74% { filter: brightness(2); transform: scaleX(.86) scaleY(1.2); }
  100% { filter: brightness(1); transform: scale(1); }
}
@keyframes v3gulp { 0%{ filter: brightness(1); } 45%{ filter: brightness(1.65); transform: scale(1.12); } 100%{ filter: brightness(1); transform: scale(1); } }
.v3-core-label {
  position: absolute;
  bottom: -8px;
  width: 100%;
  color: var(--accent);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 4px;
  text-align: center;
  text-shadow: var(--pixel-shadow);
}
.v3-node-cloud {
  position: absolute;
  inset: 76px 92px 132px;
  z-index: 2;
  pointer-events: none;
}
.v3-node-cloud::before,
.v3-node-cloud::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 47%;
  width: 72%;
  height: 1px;
  transform: translate(-50%, -50%);
  background: repeating-linear-gradient(90deg, rgba(185, 240, 92, 0.42) 0 7px, transparent 7px 14px);
  opacity: 0.55;
}
.v3-node-cloud::after {
  width: 1px;
  height: 74%;
  background: repeating-linear-gradient(0deg, rgba(185, 240, 92, 0.42) 0 7px, transparent 7px 14px);
}
.v3-node-cloud span {
  position: absolute;
  width: 46px;
  height: 42px;
  border: 1px dashed rgba(185, 240, 92, 0.48);
  border-radius: 4px;
  background:
    linear-gradient(var(--accent), var(--accent)) 50% 12px / 22px 14px no-repeat,
    linear-gradient(var(--accent), var(--accent)) 50% 29px / 28px 3px no-repeat,
    rgba(5, 12, 3, 0.82);
  box-shadow: inset 0 0 10px rgba(185, 240, 92, 0.08), 0 0 10px rgba(185, 240, 92, 0.1);
  opacity: 0.82;
}
.v3-node-cloud span::before {
  content: "";
  position: absolute;
  right: -8px;
  top: -8px;
  width: 14px;
  height: 14px;
  border: 1px solid currentColor;
  color: var(--accent);
  background: rgba(5, 12, 3, 0.94);
  clip-path: polygon(50% 0, 100% 24%, 88% 100%, 50% 82%, 12% 100%, 0 24%);
}
.v3-node-cloud .danger {
  border-color: rgba(224, 83, 50, 0.68);
  background:
    linear-gradient(var(--red), var(--red)) 50% 12px / 22px 14px no-repeat,
    linear-gradient(var(--red), var(--red)) 50% 29px / 28px 3px no-repeat,
    rgba(20, 5, 3, 0.82);
  box-shadow: inset 0 0 12px rgba(224, 83, 50, 0.1), 0 0 12px rgba(224, 83, 50, 0.18);
}
.v3-node-cloud .danger::before { color: var(--red); }
.v3-node-cloud .warn {
  border-color: rgba(224, 161, 61, 0.68);
  background:
    linear-gradient(var(--amber), var(--amber)) 50% 12px / 22px 14px no-repeat,
    linear-gradient(var(--amber), var(--amber)) 50% 29px / 28px 3px no-repeat,
    rgba(22, 14, 3, 0.82);
}
.v3-node-cloud .warn::before { color: var(--amber); }
.v3-node-cloud .node-a { left: 14%; top: 12%; }
.v3-node-cloud .node-b { left: 44%; top: 5%; }
.v3-node-cloud .node-c { right: 23%; top: 14%; }
.v3-node-cloud .node-d { left: 24%; top: 35%; }
.v3-node-cloud .node-e { right: 13%; top: 36%; }
.v3-node-cloud .node-f { left: 10%; bottom: 26%; }
.v3-node-cloud .node-g { left: 34%; bottom: 12%; }
.v3-node-cloud .node-h { right: 34%; bottom: 13%; }
.v3-node-cloud .node-i { right: 10%; bottom: 28%; }
.v3-node-cloud .node-j { left: 50%; top: 68%; transform: translateX(-50%); opacity: 0.58; }
.v3-cards,
.v3-fx { position: absolute; inset: 0; pointer-events: none; z-index: 8; }
.v3-fx { z-index: 11; }
.v3-suck-ribbon {
  position: absolute;
  height: 28px;
  z-index: 11;
  transform-origin: 0 50%;
  pointer-events: none;
  border-radius: 999px;
  background:
    linear-gradient(90deg, rgba(185, 240, 92, 0.02), rgba(185, 240, 92, 0.86) 48%, rgba(240, 255, 209, 0.16)),
    repeating-linear-gradient(90deg, rgba(240, 255, 209, 0.75) 0 5px, transparent 5px 12px);
  clip-path: polygon(0 15%, 100% 46%, 100% 54%, 0 85%);
  mix-blend-mode: screen;
  filter: drop-shadow(0 0 12px rgba(185, 240, 92, 0.82));
  animation: v3ribbon .76s cubic-bezier(.18,.82,.22,1) forwards;
}
@keyframes v3ribbon {
  0% { opacity: 0; clip-path: polygon(0 46%, 0 48%, 0 52%, 0 54%); }
  18% { opacity: 1; }
  70% { opacity: .86; clip-path: polygon(0 15%, 100% 46%, 100% 54%, 0 85%); }
  100% { opacity: 0; clip-path: polygon(100% 45%, 100% 48%, 100% 52%, 100% 55%); }
}
.v3-card {
  position: absolute;
  min-width: 132px;
  max-width: 210px;
  min-height: 42px;
  padding: 10px 12px;
  pointer-events: auto;
  cursor: pointer;
  color: #ddff9f;
  font-family: inherit;
  font-size: 12px;
  font-weight: 900;
  line-height: 1.25;
  text-align: left;
  border: 1px solid rgba(185, 240, 92, 0.52);
  border-radius: 4px;
  background:
    linear-gradient(90deg, rgba(185, 240, 92, 0.14), transparent 28%),
    repeating-linear-gradient(0deg, rgba(185, 240, 92, 0.06) 0 1px, transparent 1px 4px),
    rgba(7, 15, 4, 0.96);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.52), inset 0 0 14px rgba(185, 240, 92, 0.09);
  text-shadow: var(--pixel-shadow);
  animation: v3in .18s steps(3, end);
}
.v3-card::before {
  content: "";
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 7px;
  background: var(--accent);
  box-shadow: 0 0 6px var(--accent);
}
.v3-card:hover { transform: translateY(-2px); border-color: #f0ffd1; box-shadow: 0 10px 26px rgba(0, 0, 0, 0.62), 0 0 16px rgba(185, 240, 92, 0.28); }
.v3-card.sucking {
  z-index: 12 !important;
  pointer-events: none;
  transform-origin: 50% 50%;
  will-change: transform, opacity, filter, clip-path;
  outline: 1px solid rgba(240, 255, 209, 0.9);
  box-shadow: 0 0 28px rgba(185, 240, 92, 0.5), inset 0 0 18px rgba(240, 255, 209, 0.18);
  animation: v3suck .76s cubic-bezier(.16,.88,.24,1) forwards;
}
.v3-card.sucking::before {
  animation: v3suckDot .76s steps(4, end) forwards;
}
@keyframes v3suck {
  0% {
    opacity: 1;
    filter: brightness(1) blur(0);
    clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%);
    transform: translate3d(0, 0, 0) scale(1) rotate(0);
  }
  22% {
    opacity: 1;
    filter: brightness(1.35) blur(0);
    clip-path: polygon(0 8%, 100% 0, 92% 100%, 8% 92%);
    transform: translate3d(calc(var(--suck-mx) * .34), calc(var(--suck-my) * .34), 0) scaleX(1.22) scaleY(.78) skewX(-9deg) rotate(calc(var(--suck-twist) * -.45));
  }
  48% {
    opacity: .96;
    filter: brightness(1.75) blur(.2px);
    clip-path: polygon(6% 17%, 100% 38%, 100% 62%, 6% 83%);
    transform: translate3d(var(--suck-mx), var(--suck-my), 0) scaleX(.82) scaleY(1.14) skewX(16deg) rotate(calc(var(--suck-angle) * .12));
  }
  78% {
    opacity: .84;
    filter: brightness(2.1) blur(.8px);
    clip-path: polygon(18% 44%, 100% 48%, 100% 52%, 18% 56%);
    transform: translate3d(calc(var(--suck-dx) * .88), calc(var(--suck-dy) * .88), 0) scaleX(.34) scaleY(1.7) rotate(var(--suck-angle));
  }
  100% {
    opacity: 0;
    filter: brightness(2.4) blur(1.4px);
    clip-path: polygon(50% 48%, 100% 49%, 100% 51%, 50% 52%);
    transform: translate3d(var(--suck-dx), var(--suck-dy), 0) scaleX(.04) scaleY(.28) rotate(var(--suck-angle));
  }
}
@keyframes v3suckDot {
  0%, 36% { transform: scale(1); opacity: 1; }
  100% { transform: scale(.2); opacity: 0; }
}
@keyframes v3in { from { opacity:0; transform: translateY(-6px); } to { opacity:1; transform: translateY(0); } }
.v3-float {
  position: absolute;
  pointer-events: none;
  color: #f0ffd1;
  font-size: 20px;
  font-weight: 900;
  text-shadow: 0 0 12px var(--accent);
  animation: v3float 1s ease-out forwards;
}
.v3-float.big { font-size: 34px; }
@keyframes v3float { 0%{ opacity:0; transform: translateY(0) scale(.8);} 18%{opacity:1; transform: translateY(-8px) scale(1.06);} 100%{ opacity:0; transform: translateY(-52px) scale(1);} }
.v3-action-dock {
  position: absolute;
  left: 50%;
  bottom: 22px;
  z-index: 3;
  display: grid;
  grid-template-columns: repeat(5, 72px);
  gap: 10px;
  transform: translateX(-50%);
}
.v3-action-dock span {
  display: grid;
  place-items: center;
  height: 60px;
  color: var(--accent);
  font-size: 30px;
  font-weight: 900;
  border: 1px solid rgba(185, 240, 92, 0.46);
  border-radius: 5px;
  background:
    repeating-linear-gradient(0deg, rgba(185, 240, 92, 0.05) 0 1px, transparent 1px 5px),
    rgba(10, 18, 4, 0.84);
  box-shadow: inset 0 0 16px rgba(185, 240, 92, 0.08);
  text-shadow: var(--pixel-shadow);
}
.v3-hint {
  position: absolute;
  left: 50%;
  bottom: 92px;
  z-index: 3;
  transform: translateX(-50%);
  color: #849d45;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 1px;
  transition: opacity .35s;
}

.v3-preview {
  padding: 18px 14px 14px;
  border-bottom: 1px solid var(--line-dim);
}
.v3-preview-title,
.v3-terminal-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: #9dbb52;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 1.4px;
}
.v3-preview-title span:last-child { color: var(--accent); }
.v3-grid {
  margin-top: 12px;
  padding: 12px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 9px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background:
    repeating-linear-gradient(90deg, rgba(185, 240, 92, 0.06) 0 1px, transparent 1px 10px),
    rgba(5, 10, 3, 0.74);
}
.v3-grid.kind-floors { grid-template-columns: repeat(2, 1fr); }
.v3-cell {
  min-height: 56px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  opacity: .38;
  border: 1px solid rgba(185, 240, 92, 0.11);
  background: rgba(2, 6, 2, 0.42);
  transition: opacity .2s, border-color .2s, box-shadow .2s;
}
.v3-cell.on { opacity: 1; border-color: var(--accent); box-shadow: inset 0 0 10px rgba(185, 240, 92, 0.13), 0 0 10px rgba(185, 240, 92, 0.12); }
.v3-cell-icon {
  width: 24px;
  height: 19px;
  border: 2px solid currentColor;
  color: var(--accent);
  box-shadow: 0 0 7px rgba(185, 240, 92, 0.22);
}
.v3-cell-icon::after {
  content: "";
  display: block;
  width: 14px;
  height: 3px;
  margin: 21px auto 0;
  background: currentColor;
}
.v3-cell-name { max-width: 58px; color: #91ad4e; font-size: 10px; line-height: 1.15; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.v3-cell.on .v3-cell-name { color: #e0ff9f; text-shadow: var(--pixel-shadow); }
.v3-terminal-wrap { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.v3-terminal-head {
  padding: 12px 14px;
  color: var(--red);
  cursor: pointer;
  border-bottom: 1px solid rgba(224, 83, 50, 0.25);
  background:
    repeating-linear-gradient(90deg, var(--red-soft) 0 8px, transparent 8px 13px),
    rgba(24, 5, 3, 0.56);
  text-shadow: 0 0 8px rgba(224, 83, 50, 0.45);
}
.v3-terminal { flex: 1; min-height: 0; overflow-y: auto; padding: 11px 14px 16px; color: #b7de70; font-size: 11.5px; line-height: 1.55; }
.v3-terminal-wrap.collapsed .v3-terminal { display: none; }
.v3-terminal-line { margin-bottom: 6px; overflow-wrap: anywhere; }
.v3-terminal-line.dim { color: #596d31; }
.v3-terminal-line.incite { padding-left: 9px; color: #ffe6a4; border-left: 2px solid var(--amber); text-shadow: 0 0 8px rgba(224, 161, 61, 0.42); }

.v3-incite,
.v3-mg,
.v3-ascend {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  background:
    repeating-linear-gradient(0deg, rgba(185, 240, 92, 0.06) 0 1px, transparent 1px 4px),
    rgba(2, 5, 2, 0.92);
}
.v3-incite-box,
.v3-mg-box,
.v3-ascend-box {
  border: 1px solid var(--line);
  border-radius: 6px;
  background:
    repeating-linear-gradient(0deg, rgba(185, 240, 92, 0.035) 0 1px, transparent 1px 5px),
    rgba(7, 13, 4, 0.98);
  box-shadow: inset 0 0 28px rgba(185, 240, 92, 0.08), 0 24px 80px rgba(0, 0, 0, 0.72);
}
.v3-incite-box { max-width: 680px; padding: 36px 44px; text-align: center; }
.v3-incite-text { color: #f0ffd1; font-size: 21px; font-weight: 900; line-height: 1.8; text-shadow: var(--pixel-shadow); }
.v3-incite-btn,
.v3-mg-hit,
.v3-do-rebirth,
.v3-ascend-close,
.v3-debug button,
.v3-debug input {
  font-family: inherit;
}
.v3-incite-btn,
.v3-mg-hit,
.v3-do-rebirth {
  margin-top: 24px;
  min-height: 42px;
  padding: 10px 24px;
  color: #081004;
  font-size: 14px;
  font-weight: 900;
  cursor: pointer;
  border: 0;
  border-radius: 4px;
  background: var(--accent);
  box-shadow: 0 0 16px rgba(185, 240, 92, 0.28);
}
.v3-mg-box { width: 570px; max-width: 90vw; padding: 30px 34px; text-align: center; border-color: var(--amber); }
.v3-mg-name { color: var(--amber); font-size: 20px; font-weight: 900; text-shadow: 0 0 10px rgba(224, 161, 61, 0.5); }
.v3-mg-desc { margin: 12px 0 22px; color: #b7c47a; font-size: 13px; line-height: 1.65; }
.v3-mg-track { position: relative; height: 26px; overflow: hidden; border: 1px solid rgba(224, 161, 61, 0.55); border-radius: 4px; background: rgba(26, 18, 3, 0.88); }
.v3-mg-track.flash-hit { box-shadow: 0 0 0 2px var(--accent) inset; }
.v3-mg-track.flash-miss { box-shadow: 0 0 0 2px var(--red) inset; }
.v3-mg-window { position: absolute; top: 0; bottom: 0; background: rgba(185, 240, 92, 0.25); border-left: 1px solid var(--accent); border-right: 1px solid var(--accent); }
.v3-mg-pointer { position: absolute; top: -3px; bottom: -3px; width: 4px; background: #f0ffd1; box-shadow: 0 0 10px #f0ffd1; }
.v3-mg-status { min-height: 22px; margin: 16px 0 0; color: #d7e594; font-size: 13px; font-weight: 800; }

.v3-rebirth-btn {
  min-height: 44px;
  margin: 2px 0 8px;
  color: var(--amber);
  font-family: inherit;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
  border: 1px solid rgba(224, 161, 61, 0.44);
  border-radius: 4px;
  background: rgba(24, 15, 2, 0.8);
}
.v3-ascend { z-index: 50; }
.v3-ascend-box { width: 910px; max-width: 94vw; max-height: 90vh; overflow-y: auto; padding: 22px 26px; border-color: var(--amber); }
.v3-ascend-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
.v3-ascend-title { color: var(--amber); font-size: 22px; font-weight: 900; }
.v3-ascend-sub { margin-top: 4px; color: #aa8b47; font-size: 13px; }
.v3-ascend-sub b { color: #ffe6a4; }
.v3-ascend-close { width: 34px; height: 34px; color: var(--amber); cursor: pointer; border: 1px solid rgba(224, 161, 61, 0.38); border-radius: 4px; background: transparent; }
.v3-ascend-cols { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.v3-ascend-branch { margin-bottom: 10px; color: #aa8b47; font-size: 11px; font-weight: 900; letter-spacing: 2px; }
.v3-ascend-col { display: flex; flex-direction: column; gap: 8px; }
.v3-ascend-node {
  min-height: 76px;
  padding: 10px 12px;
  color: #b9ac80;
  text-align: left;
  cursor: pointer;
  border: 1px solid rgba(224, 161, 61, 0.18);
  border-radius: 4px;
  background: rgba(14, 11, 4, 0.85);
}
.v3-ascend-node.can { border-color: var(--amber); box-shadow: inset 0 0 16px rgba(224, 161, 61, 0.08); }
.v3-ascend-node.owned { border-color: rgba(185, 240, 92, 0.34); }
.v3-ascend-node.locked { opacity: .45; }
.v3-an-top { display: flex; justify-content: space-between; gap: 10px; color: #ffe6a4; font-size: 13px; font-weight: 900; }
.v3-an-cost { color: var(--amber); }
.v3-an-desc { margin-top: 5px; color: #8e7c4e; font-size: 11px; line-height: 1.45; }
.v3-ascend-foot { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 20px; }
.v3-ascend-note { color: #a68d57; font-size: 12px; }

.v3-debug-btn {
  position: absolute;
  top: 18px;
  right: 150px;
  z-index: 30;
  width: 38px;
  height: 34px;
  color: #6f7e4a;
  cursor: pointer;
  border: 1px solid rgba(185, 240, 92, 0.22);
  border-radius: 4px;
  background: rgba(6, 10, 4, 0.86);
}
.v3-debug { position: absolute; top: 58px; right: 150px; z-index: 30; width: 278px; padding: 12px 14px; display: flex; flex-direction: column; gap: 9px; border: 1px solid var(--line); border-radius: 5px; background: rgba(5, 9, 3, 0.98); box-shadow: 0 18px 48px rgba(0,0,0,.64); }
.v3-debug-title { color: var(--accent); font-size: 11px; font-weight: 900; letter-spacing: 3px; }
.v3-debug-row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.v3-debug-label { color: #7c9540; font-size: 12px; }
.v3-debug button,
.v3-debug input {
  min-height: 30px;
  padding: 6px 9px;
  color: #bddb76;
  font-size: 12px;
  border: 1px solid rgba(185, 240, 92, 0.2);
  border-radius: 4px;
  background: rgba(8, 14, 4, 0.9);
}
.v3-debug button { cursor: pointer; }
.v3-debug button:hover,
.v3-debug button.active { color: #f0ffd1; border-color: var(--accent); }
.v3-debug button.danger { color: #f28e72; border-color: rgba(224, 83, 50, 0.48); }
.v3-debug input { width: 92px; color: #f0ffd1; }

.v3-side,
.v3-main,
.v3-right {
  --atlas-panel-pos: 48% 29%;
  background-image:
    repeating-linear-gradient(0deg, rgba(185, 240, 92, 0.045) 0 1px, transparent 1px 7px),
    radial-gradient(circle at 50% 48%, rgba(185, 240, 92, 0.11), transparent 54%),
    linear-gradient(180deg, rgba(20, 31, 9, 0.95), rgba(5, 9, 4, 0.97)),
    var(--atlas-img);
  background-size: auto, auto, auto, 1240px 1240px;
  background-position: center, center, center, var(--atlas-panel-pos);
  background-blend-mode: screen, normal, normal, soft-light;
}
.v3-side { --atlas-panel-pos: 31% 52%; }
.v3-main { --atlas-panel-pos: 56% 25%; }
.v3-right { --atlas-panel-pos: 85% 32%; }

.v3-stage,
.v3-compute,
.v3-preview,
.v3-grid,
.v3-terminal,
.v3-terminal-head,
.v3-item,
.v3-breakthrough,
.v3-rebirth-btn,
.v3-card,
.v3-action-dock span,
.v3-cell,
.v3-debug,
.v3-debug button,
.v3-debug input,
.v3-incite-box,
.v3-mg-box,
.v3-ascend-box,
.v3-ascend-node,
.v3-do-rebirth,
.v3-incite-btn,
.v3-mg-hit {
  background-image:
    linear-gradient(rgba(5, 10, 3, var(--atlas-cover, .84)), rgba(5, 10, 3, var(--atlas-cover, .84))),
    var(--atlas-img);
  background-size: auto, var(--atlas-size, 1180px 1180px);
  background-position: center, var(--atlas-pos, 50% 65%);
  background-blend-mode: normal, screen;
}
.v3-stage { --atlas-cover: .7; --atlas-pos: 75% 6%; }
.v3-compute { --atlas-cover: .76; --atlas-pos: 51% 5%; }
.v3-item { --atlas-cover: .72; --atlas-pos: 57% 83%; }
.v3-item.affordable { --atlas-cover: .62; }
.v3-breakthrough { --atlas-cover: .58; --atlas-pos: 78% 90%; }
.v3-card { --atlas-cover: .45; --atlas-pos: 61% 73%; --atlas-size: 960px 960px; }
.v3-action-dock span { --atlas-cover: .5; --atlas-pos: 49% 88%; --atlas-size: 760px 760px; }
.v3-preview { --atlas-cover: .76; --atlas-pos: 86% 7%; }
.v3-grid { --atlas-cover: .72; --atlas-pos: 84% 24%; }
.v3-cell { --atlas-cover: .56; --atlas-pos: 48% 88%; --atlas-size: 900px 900px; }
.v3-terminal-head { --atlas-cover: .42; --atlas-pos: 83% 17%; }
.v3-terminal { --atlas-cover: .82; --atlas-pos: 85% 31%; }
.v3-rebirth-btn,
.v3-ascend-box,
.v3-ascend-node,
.v3-do-rebirth { --atlas-cover: .68; --atlas-pos: 74% 83%; }
.v3-incite-box,
.v3-mg-box { --atlas-cover: .72; --atlas-pos: 57% 89%; }
.v3-debug,
.v3-debug button,
.v3-debug input { --atlas-cover: .78; --atlas-pos: 38% 70%; --atlas-size: 900px 900px; }

@media (max-width: 1280px) {
  .v3 {
    grid-template-columns: 260px minmax(330px, 1fr) 250px;
    gap: 12px;
    padding-left: 118px;
    padding-right: 118px;
  }
  .v3::after { inset: 66px 116px 72px; }
  .v3-shader {
    inset: 66px 116px 72px;
    width: calc(100% - 232px);
    height: calc(100% - 138px);
  }
  .v3-action-dock { grid-template-columns: repeat(5, 56px); }
  .v3-action-dock span { height: 50px; font-size: 24px; }
}

@media (max-width: 760px) {
  .v3 {
    display: block;
    padding: 70px 16px 30px;
    overflow-x: hidden;
    overflow-y: auto;
  }
  .v3::before {
    inset: 6px;
    border-radius: 34px;
  }
  .v3::after {
    inset: 70px 16px 30px;
    border-radius: 22px;
  }
  .v3-shader {
    inset: 70px 16px 30px;
    width: calc(100% - 32px);
    height: calc(100% - 100px);
    border-radius: 22px;
  }
  .v3-hardware {
    z-index: 1;
    width: 96px;
    opacity: 0.24;
  }
  .v3-hardware-left { left: -8px; }
  .v3-hardware-right { right: -12px; }
  .v3-status-led { top: 92px; left: 58px; }
  .v3-dpad {
    left: 8px;
    top: 46%;
    transform: translateY(-50%) scale(0.74);
    transform-origin: left center;
  }
  .v3-round-button {
    right: 18px;
    top: 42%;
    width: 58px;
    height: 58px;
  }
  .v3-round-button.small {
    top: calc(42% + 76px);
    right: 28px;
    width: 50px;
    height: 50px;
  }
  .v3-side,
  .v3-main,
  .v3-right {
    z-index: 2;
    width: 100%;
    margin-bottom: 12px;
    border: 1px solid rgba(185, 240, 92, 0.24);
    border-radius: 18px;
  }
  .v3-side {
    display: block;
    padding: 16px 14px;
  }
  .v3-scroll {
    flex: 0 0 auto;
    overflow: visible;
    padding-right: 0;
  }
  .v3-main {
    min-height: 500px;
  }
  .v3-node-cloud {
    inset: 50px 18px 112px;
  }
  .v3-node-cloud span {
    width: 38px;
    height: 34px;
    background:
      linear-gradient(var(--accent), var(--accent)) 50% 10px / 18px 11px no-repeat,
      linear-gradient(var(--accent), var(--accent)) 50% 25px / 22px 3px no-repeat,
      rgba(5, 12, 3, 0.82);
  }
  .v3-node-cloud .danger {
    background:
      linear-gradient(var(--red), var(--red)) 50% 10px / 18px 11px no-repeat,
      linear-gradient(var(--red), var(--red)) 50% 25px / 22px 3px no-repeat,
      rgba(20, 5, 3, 0.82);
  }
  .v3-node-cloud .warn {
    background:
      linear-gradient(var(--amber), var(--amber)) 50% 10px / 18px 11px no-repeat,
      linear-gradient(var(--amber), var(--amber)) 50% 25px / 22px 3px no-repeat,
      rgba(22, 14, 3, 0.82);
  }
  .v3-core {
    top: 46%;
    width: 218px;
    height: 194px;
  }
  .v3-core-ring::before {
    top: -58px;
    height: 58px;
    box-shadow:
      -78px 92px 0 rgba(185, 240, 92, 0.32),
      78px 92px 0 rgba(185, 240, 92, 0.32),
      -112px 36px 0 rgba(224, 83, 50, 0.48),
      112px 36px 0 rgba(224, 83, 50, 0.48);
  }
  .v3-core-ring::after {
    left: -92px;
    width: 92px;
    box-shadow: 292px 0 0 rgba(185, 240, 92, 0.36);
  }
  .v3-core-eye {
    width: 142px;
    height: 70px;
  }
  .v3-action-dock {
    bottom: 18px;
    grid-template-columns: repeat(5, 44px);
    gap: 6px;
  }
  .v3-action-dock span {
    height: 42px;
    font-size: 21px;
  }
  .v3-hint {
    bottom: 70px;
    width: calc(100% - 32px);
    text-align: center;
    font-size: 11px;
    letter-spacing: 0;
  }
  .v3-right {
    min-height: 360px;
  }
  .v3-preview {
    padding: 14px;
  }
  .v3-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
    padding: 8px;
  }
  .v3-cell {
    min-height: 48px;
  }
  .v3-cell-name {
    max-width: 48px;
    font-size: 9px;
  }
  .v3-terminal {
    max-height: 230px;
  }
  .v3-debug-btn {
    top: 18px;
    right: 22px;
  }
  .v3-debug {
    top: 58px;
    right: 14px;
    width: min(278px, calc(100vw - 28px));
  }
  .v3-incite-box {
    max-width: calc(100vw - 40px);
    padding: 26px 22px;
  }
  .v3-incite-text {
    font-size: 17px;
  }
  .v3-ascend-box {
    width: calc(100vw - 28px);
    max-height: 86vh;
    padding: 18px;
  }
  .v3-ascend-cols {
    grid-template-columns: 1fr;
  }
  .v3-ascend-foot {
    align-items: stretch;
    flex-direction: column;
  }
}
`;
