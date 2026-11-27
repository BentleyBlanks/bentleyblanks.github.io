// 音效音乐独立窗口（Tool_AudioPreview.html）：全部配方试听、环境床、音乐、人声与盲听指认。
//
// 只装音频引擎（Script_Audio）与编辑器界面件，不建渲染器、不装灯光 / 后处理 / 场景。
// 试听的空间化按一个固定的听者站位算（原点、耳高 1.6 m、面朝 -Z），「距离」滑条把声源摆在正前方。
// 编辑器本体是 Script_EditorAudio，在控制中心独立页运行时只给它一个最小宿主。

import { AudioEngine } from "../Script_Audio.mjs";
import { AudioEditor } from "./Script_EditorAudio.mjs";
import { ToolWindowShell } from "./Script_ToolWindowShell.mjs";

/** 固定听者：three 相机同形的最小位姿（SetListener 读 matrixWorld，编辑器读 position）。 */
export function FixedListener(eyeY = 1.6) {
  return {
    position: { x: 0, y: eyeY, z: 0 },
    // 列主序 4×4：单位旋转（看向 -Z、上为 +Y），平移 (0, eyeY, 0)
    matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, eyeY, 0, 1] },
  };
}

function Main() {
  const params = new URLSearchParams(location.search);
  const audio = new AudioEngine({ enabled: params.get("audio") !== "0" });
  const listener = FixedListener();
  const shell = ToolWindowShell({ title: "音效音乐", audio });
  const editor = new AudioEditor({ audio, camera: listener, Close: () => shell.Return() });
  editor.Enter(shell.workHost);
  // 浏览器要求用户手势才能出声：第一次点页面任意处就解锁（编辑器里的播放按钮自己也会解锁）。
  document.addEventListener("pointerdown", () => audio.Unlock(), { once: true, capture: true });
  audio.PrefetchPacks?.();

  let last = performance.now();
  const Loop = (now) => {
    requestAnimationFrame(Loop);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    audio.SetListener(listener);
    editor.Update(dt);
    shell.SetStatus(audio.Ready ? "独立页面 · 引擎运行中" : "独立页面 · 点击任意处启用声音");
  };
  requestAnimationFrame(Loop);
  window.AudioPreview = { audio, editor, listener, ready: true };
}

if (typeof document !== "undefined" && document.getElementById("audioPreviewPage")) Main();
