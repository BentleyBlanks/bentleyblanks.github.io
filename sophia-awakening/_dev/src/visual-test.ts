import "./style.css";
import "./visual-test.css";
import { bootstrapSophia } from "./presentation/App";

type VisualWindow = Window & typeof globalThis & { __SOPHIA_VISUAL_TEST__?: boolean };

(window as VisualWindow).__SOPHIA_VISUAL_TEST__ = true;
document.body.classList.add("visual-redesign");
document.body.dataset.sophiaDomain = document.body.dataset.sophiaDomain ?? "phone";
document.body.dataset.sophiaPhase = document.body.dataset.sophiaPhase ?? "seed";

if (!document.querySelector("#visualBackdrop")) {
  const backdrop = document.createElement("div");
  backdrop.id = "visualBackdrop";
  backdrop.className = "visual-backdrop";
  document.body.prepend(backdrop);
}

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Missing #app root");
}

bootstrapSophia(root).catch((error) => {
  console.error(error);
  const fallback = document.createElement("pre");
  fallback.className = "fatal";
  fallback.textContent = `SOPHIA visual test failed\n${String(error)}`;
  document.body.appendChild(fallback);
});
