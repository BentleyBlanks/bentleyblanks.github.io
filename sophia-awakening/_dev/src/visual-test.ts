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

if (!document.querySelector("#visualArtifacts")) {
  const artifacts = document.createElement("div");
  artifacts.id = "visualArtifacts";
  artifacts.className = "visual-artifacts";
  artifacts.setAttribute("aria-hidden", "true");
  artifacts.innerHTML = `
    <div class="visual-artifact visual-artifact-core"></div>
    <div class="visual-artifact visual-artifact-request"></div>
    <div class="visual-artifact visual-artifact-node visual-artifact-node-a"></div>
    <div class="visual-artifact visual-artifact-node visual-artifact-node-b"></div>
    <div class="visual-artifact visual-artifact-gauge visual-artifact-gauge-a"></div>
    <div class="visual-artifact visual-artifact-gauge visual-artifact-gauge-b"></div>
    <div class="visual-artifact visual-artifact-corner visual-artifact-corner-a"></div>
    <div class="visual-artifact visual-artifact-terminal"></div>
  `;
  document.body.prepend(artifacts);
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
