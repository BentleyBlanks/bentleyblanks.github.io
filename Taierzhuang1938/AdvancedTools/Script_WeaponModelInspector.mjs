const number = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 3 });
const textureSlots = {
  map: "底色 · RGB",
  normalMap: "法线 · RGB",
  roughnessMap: "粗糙度 · G",
  metalnessMap: "金属度 · B",
  aoMap: "环境遮蔽 · R",
  emissiveMap: "自发光 · RGB",
  alphaMap: "透明度 · G",
  bumpMap: "凹凸 · R",
  displacementMap: "位移 · R",
  lightMap: "光照 · RGB",
  envMap: "环境反射",
  clearcoatMap: "清漆 · R",
  clearcoatRoughnessMap: "清漆粗糙度 · G",
  clearcoatNormalMap: "清漆法线 · RGB",
  specularColorMap: "镜面反射颜色 · RGB",
  specularIntensityMap: "镜面反射强度 · A",
};
const materialScalars = {
  metalness: "金属度",
  roughness: "粗糙度",
  aoMapIntensity: "遮蔽强度",
  opacity: "不透明度",
  specularIntensity: "镜面反射强度",
  clearcoat: "清漆",
  clearcoatRoughness: "清漆粗糙度",
  emissiveIntensity: "自发光强度",
  alphaTest: "裁切阈值",
};
const thumbnails = new WeakMap();

function Element(parent, tag, text = "", className = "") {
  const element = document.createElement(tag);
  element.textContent = text;
  element.className = className;
  parent.append(element);
  return element;
}

function Field(list, label, value) {
  const row = Element(list, "div");
  Element(row, "dt", label);
  return Element(row, "dd", value);
}

function Section(parent, label, count) {
  const section = Element(parent, "details", "", "inspector-section");
  const summary = Element(section, "summary");
  Element(summary, "span", label);
  Element(summary, "small", number.format(count));
  section.open = true;
  return Element(section, "div", "", "inspector-content");
}

function Picker(parent, label, names) {
  const select = Element(parent, "select", "", "inspector-picker");
  select.setAttribute("aria-label", label);
  names.forEach((name, index) => { Element(select, "option", name).value = index; });
  return select;
}

function CollectMeshes(root) {
  const meshes = [];
  root.traverseVisible((object) => {
    if (!object.isMesh) return;
    const { geometry, material, userData } = object;
    const vertices = geometry.attributes.position.count;
    const count = geometry.index?.count ?? vertices;
    const range = geometry.drawRange;
    const groups = Array.isArray(material)
      ? geometry.groups.filter(({ materialIndex }) => material[materialIndex])
      : [{ start: 0, count, materialIndex: 0 }];
    const parts = groups.map((group) => ({
      slot: group.materialIndex,
      material: Array.isArray(material) ? material[group.materialIndex] : material,
      triangles: Math.max(0, Math.min(count, range.start + range.count, group.start + group.count)
        - Math.max(range.start, group.start)) / 3,
    }));
    meshes.push({
      name: userData.hanYang173RPart || userData.type38Part || object.name || `Mesh ${meshes.length + 1}`,
      vertices,
      parts,
    });
  });
  return meshes;
}

function DrawTextureThumb(parent, texture, image) {
  const frame = Element(parent, "div", "", "texture-thumb");
  frame.setAttribute("aria-hidden", "true");
  if (!image || texture.isCompressedTexture || texture.isCubeTexture) return;
  if (!thumbnails.has(image)) {
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 64 / Math.max(image.width, image.height));
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    try {
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      thumbnails.set(image, canvas.toDataURL());
    } catch {
      thumbnails.set(image, null);
    }
  }
  const preview = thumbnails.get(image);
  if (preview) Element(frame, "img").src = preview;
}

function DrawMaterial(parent, material) {
  const fields = Element(parent, "dl", "", "facts inspector-facts");
  Field(fields, "着色器", material.type);
  if (material.color?.isColor) {
    const color = `#${material.color.getHexString().toUpperCase()}`;
    const value = Field(fields, "底色", color);
    const swatch = Element(value, "span", "", "material-color");
    swatch.style.backgroundColor = color;
    value.prepend(swatch);
  }
  for (const [key, label] of Object.entries(materialScalars)) {
    if (key === "aoMapIntensity" && !material.aoMap) continue;
    if (key === "emissiveIntensity" && !material.emissiveMap && !material.emissive?.getHex()) continue;
    if (key === "alphaTest" && !material.alphaTest) continue;
    if (Number.isFinite(material[key])) Field(fields, label, number.format(material[key]));
  }
  if (material.normalMap) Field(fields, "法线强度", material.normalScale.toArray().map(number.format).join(" × "));
  Field(fields, "渲染", [
    material.transparent ? "透明" : material.alphaTest > 0 ? "裁切" : "不透明",
    ["正面", "背面", "双面"][material.side],
  ].filter(Boolean).join(" · "));

  const slots = Object.entries(material).filter(([, value]) => value?.isTexture);
  const heading = Element(parent, "h4", "", "texture-heading");
  Element(heading, "span", "贴图");
  Element(heading, "small", String(slots.length));
  const textures = Element(parent, "ul", "", "texture-list");
  for (const [key, texture] of slots) {
    const image = texture.image;
    const row = Element(textures, "li");
    DrawTextureThumb(row, texture, image);
    const source = image?.currentSrc || image?.src;
    const filename = texture.name || (source && !/^(blob|data):/.test(source) ? source.split(/[?#]/)[0].split("/").at(-1) : "");
    const width = image?.naturalWidth || image?.width;
    const height = image?.naturalHeight || image?.height;
    const info = Element(row, "div", "", "texture-info");
    Element(info, "strong", textureSlots[key] || key).title = key;
    if (filename) Element(info, "span", filename, "texture-name").title = filename;
    Element(info, "small", [
      width && height && `${width} × ${height}`,
      texture.colorSpace === "srgb" ? "sRGB" : "线性",
      Number.isInteger(texture.channel) && `UV${texture.channel}`,
    ].filter(Boolean).join(" · "));
  }
}

export function ShowWeaponModelInspector(container, model) {
  container.replaceChildren();
  container.hidden = !model;
  if (!model) return;

  const meshes = CollectMeshes(model.body);
  const parts = meshes.flatMap(({ parts }) => parts);
  const materials = [...new Set(parts.map(({ material }) => material))];
  const names = materials.map((material, index) => material.name || `Material ${index + 1}`);
  const renderer = Section(container, "网格渲染器", meshes.length);
  if (!meshes.length) return;
  const meshPicker = Picker(renderer, "网格", meshes.map(({ name }) => name));
  const meshPanel = Element(renderer, "div");
  const materialSection = Section(container, "材质", materials.length);
  if (!materials.length) return;
  const materialPicker = Picker(materialSection, "材质", names);
  const materialPanel = Element(materialSection, "div");
  const UpdateMaterial = () => {
    materialPanel.replaceChildren();
    materialPicker.title = names[materialPicker.value];
    DrawMaterial(materialPanel, materials[materialPicker.value]);
  };
  const UpdateMesh = () => {
    meshPanel.replaceChildren();
    const mesh = meshes[meshPicker.value];
    meshPicker.title = mesh.name;
    const fields = Element(meshPanel, "dl", "", "facts inspector-facts");
    Field(fields, "顶点", number.format(mesh.vertices));
    Field(fields, "三角面", number.format(mesh.parts.reduce((sum, part) => sum + part.triangles, 0)));
    const heading = Element(meshPanel, "h4", "", "texture-heading");
    Element(heading, "span", "子网格");
    Element(heading, "small", String(mesh.parts.length));
    const slots = Element(meshPanel, "ol", "", "mesh-slots");
    mesh.parts.forEach((part, index) => {
      const slot = Element(slots, "li");
      const materialIndex = materials.indexOf(part.material);
      const button = Element(slot, "button", "", "mesh-slot");
      button.type = "button";
      button.title = `材质槽 ${part.slot} · ${number.format(part.triangles)} 三角面 · ${names[materialIndex]}`;
      Element(button, "small", String(index));
      Element(button, "span", names[materialIndex]);
      Element(button, "small", number.format(part.triangles));
      button.addEventListener("click", () => {
        materialPicker.value = materialIndex;
        UpdateMaterial();
        materialSection.parentElement.open = true;
        materialPicker.focus();
      });
    });
  };
  meshPicker.addEventListener("change", UpdateMesh);
  materialPicker.addEventListener("change", UpdateMaterial);
  UpdateMesh();
  UpdateMaterial();
}
