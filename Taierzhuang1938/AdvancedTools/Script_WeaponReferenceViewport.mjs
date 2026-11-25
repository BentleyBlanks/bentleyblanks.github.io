const ById = (id) => document.getElementById(id);
const Clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const MIN_ZOOM = .25;
const MAX_ZOOM = 16;
const STEP = 1.25;

export function BindWeaponReferenceViewport() {
  const layoutButtons = [...document.querySelectorAll("[data-layout]")];
  const viewports = ById("inspectionViews");
  const pane = ById("referencePane");
  const view = ById("referenceView");
  const empty = ById("referenceEmpty");
  const info = ById("referenceInfo");
  const add = ById("addReferences");
  const input = ById("referenceFiles");
  const list = ById("referenceList");
  const remove = ById("removeReference");
  const zoomIn = ById("referenceZoomIn");
  const zoomOut = ById("referenceZoomOut");
  const fit = ById("referenceFit");
  const status = ById("referenceStatus");
  const entries = [];
  let active = null;
  let drag = null;

  function Draw() {
    empty.hidden = !!active;
    info.hidden = remove.hidden = !active;
    fit.disabled = !active;
    zoomIn.disabled = !active || active.zoom >= MAX_ZOOM;
    zoomOut.disabled = !active || active.zoom <= MIN_ZOOM;
    if (!active || pane.hidden) return;
    const { image, zoom } = active;
    const availableWidth = view.clientWidth;
    const availableHeight = view.clientHeight;
    const scale = Math.max(.001, Math.min(
      (availableWidth - 16) / image.naturalWidth,
      (availableHeight - 16) / image.naturalHeight,
    )) * zoom;
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    const maxX = Math.max(0, (width - availableWidth) / 2);
    const maxY = Math.max(0, (height - availableHeight) / 2);
    active.x = Clamp(active.x, -maxX, maxX);
    active.y = Clamp(active.y, -maxY, maxY);
    image.style.width = `${width}px`;
    image.style.height = `${height}px`;
    image.style.left = `calc(50% + ${active.x}px)`;
    image.style.top = `calc(50% + ${active.y}px)`;
    view.classList.toggle("can-pan", maxX > 0 || maxY > 0);
    info.textContent = `${image.naturalWidth} × ${image.naturalHeight}  ·  ${Math.round(scale * 100)}%`;
  }

  function Select(entry) {
    active?.image.remove();
    active = entry;
    for (const item of entries) item.button.setAttribute("aria-pressed", String(item === entry));
    if (entry) {
      view.prepend(entry.image);
      const strip = list.getBoundingClientRect();
      const thumb = entry.button.getBoundingClientRect();
      list.scrollLeft += Math.max(0, thumb.right - strip.right) + Math.min(0, thumb.left - strip.left);
    } else {
      view.classList.remove("can-pan");
    }
    Draw();
  }

  function Zoom(factor, offsetX = 0, offsetY = 0) {
    if (!active) return;
    const next = Clamp(active.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const ratio = next / active.zoom;
    active.x = offsetX + (active.x - offsetX) * ratio;
    active.y = offsetY + (active.y - offsetY) * ratio;
    active.zoom = next;
    Draw();
  }

  function Fit() {
    if (!active) return;
    active.zoom = 1;
    active.x = active.y = 0;
    Draw();
  }

  async function AddFiles(files) {
    const decoded = await Promise.all(files.map(async (file) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.alt = file.name;
      image.draggable = false;
      image.src = url;
      try {
        await image.decode();
        return { image, url, zoom: 1, x: 0, y: 0 };
      } catch {
        URL.revokeObjectURL(url);
        return null;
      }
    }));
    const images = decoded.filter(Boolean);
    for (const entry of images) {
      const button = document.createElement("button");
      const thumbnail = new Image();
      thumbnail.alt = "";
      thumbnail.src = entry.url;
      button.type = "button";
      button.title = entry.image.alt;
      button.setAttribute("aria-label", entry.image.alt);
      button.setAttribute("aria-pressed", "false");
      button.append(thumbnail);
      button.addEventListener("click", () => Select(entry));
      entry.button = button;
      list.append(button);
      entries.push(entry);
    }
    if (!active && images.length) Select(images[0]);
    const failures = files.length - images.length;
    status.hidden = !failures;
    status.textContent = failures ? `${failures} 张图片无法读取` : "";
  }

  for (const button of layoutButtons) {
    button.addEventListener("click", () => {
      const comparing = button.dataset.layout === "split";
      for (const item of layoutButtons) item.setAttribute("aria-pressed", String(item === button));
      pane.hidden = !comparing;
      viewports.classList.toggle("is-comparing", comparing);
      Draw();
    });
  }
  add.addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    AddFiles([...input.files]);
    input.value = "";
  });
  pane.addEventListener("dragover", (event) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  });
  pane.addEventListener("drop", (event) => {
    if (!event.dataTransfer.files.length) return;
    event.preventDefault();
    AddFiles([...event.dataTransfer.files]);
  });
  remove.addEventListener("click", () => {
    const index = entries.indexOf(active);
    const [removed] = entries.splice(index, 1);
    removed.button.remove();
    Select(entries[index] ?? entries.at(-1) ?? null);
    URL.revokeObjectURL(removed.url);
    (active ? remove : add).focus();
  });
  zoomIn.addEventListener("click", () => Zoom(STEP));
  zoomOut.addEventListener("click", () => Zoom(1 / STEP));
  fit.addEventListener("click", Fit);
  view.addEventListener("wheel", (event) => {
    if (!active || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const rect = view.getBoundingClientRect();
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
    Zoom(Math.exp(-pixels * .0014), event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2);
  }, { passive: false });
  view.addEventListener("keydown", (event) => {
    if (!active || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "+" || event.key === "=") Zoom(STEP);
    else if (event.key === "-") Zoom(1 / STEP);
    else if (event.key === "Home") Fit();
    else return;
    event.preventDefault();
  });
  view.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || event.button !== 0 || !view.classList.contains("can-pan")) return;
    view.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  view.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.id || !active) return;
    active.x += event.clientX - drag.x;
    active.y += event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    Draw();
  });
  view.addEventListener("lostpointercapture", () => { drag = null; });
  new ResizeObserver(Draw).observe(view);
  Draw();
}
