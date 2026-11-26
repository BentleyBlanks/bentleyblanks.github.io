const number = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 3 });
const surface = [
  ["底色", "map", "color", "RGB"],
  ["金属度", "metalnessMap", "metalness", "B"],
  ["粗糙度", "roughnessMap", "roughness", "G"],
  ["法线", "normalMap", "normalScale", "RGB"],
  ["环境遮蔽", "aoMap", "aoMapIntensity", "R"],
];
const textureSlots = {
  bumpMap: "凹凸 · R",
  displacementMap: "位移 · R",
  lightMap: "光照 · RGB",
  envMap: "环境反射",
  clearcoatNormalMap: "清漆法线 · RGB",
  specularColorMap: "镜面反射颜色 · RGB",
};
const normalized = new Set(["metalness", "roughness", "opacity", "clearcoat", "clearcoatRoughness", "alphaTest"]);
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
    const parts = groups.map((group) => {
      const start = Math.max(range.start, group.start);
      const end = Math.min(count, range.start + range.count, group.start + group.count);
      return {
        object, start, count: Math.max(0, end - start), slot: group.materialIndex,
        material: Array.isArray(material) ? material[group.materialIndex] : material,
      };
    }).filter((part) => part.count > 0);
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
  if (preview) {
    const thumbnail = Element(frame, "img");
    thumbnail.src = preview;
    thumbnail.alt = "";
  }
}

function DrawProperty(parent, label, texture, value, mapKey, valueKey, channel) {
  const row = Element(parent, "div", "", "material-property");
  const term = Element(row, "dt");
  if (texture) DrawTextureThumb(term, texture, texture.image);
  const info = Element(term, "span", "", "material-property-info");
  const heading = Element(info, "span", "", "material-property-title");
  Element(heading, "span", label, "material-property-label");
  if (texture) {
    const image = texture.image;
    const source = image?.currentSrc || image?.src;
    const filename = texture.name || (source && !/^(blob|data):/.test(source) ? source.split(/[?#]/)[0].split("/").at(-1) : "");
    const width = image?.naturalWidth || image?.width;
    const height = image?.naturalHeight || image?.height;
    if (filename) Element(info, "span", filename, "texture-name");
    const metadata = [
      width && height && `${width} × ${height}`,
      texture.colorSpace === "srgb" ? "sRGB" : "线性",
      Number.isInteger(texture.channel) && `UV${texture.channel}`,
    ].filter(Boolean).join(" · ");
    if (channel && channel.length <= 3) Element(heading, "small", channel, "texture-channel");
    Element(info, "small", metadata, "texture-metadata");
    if (channel?.length > 3) Element(info, "small", channel, "texture-metadata");
    term.title = [mapKey, filename, metadata, channel].filter(Boolean).join("\n");
  }
  const field = Element(row, "dd", "", "material-value");
  if (value == null) return;
  if (value.isColor) {
    const color = `#${value.getHexString().toUpperCase()}`;
    field.title = `${color} · 线性 RGB ${value.toArray().map(number.format).join(" / ")}`;
    field.setAttribute("aria-label", color);
    const swatch = Element(field, "span", "", "material-color");
    swatch.style.backgroundColor = color;
  } else {
    Element(field, "span", value.isVector2 ? value.toArray().map(number.format).join(" × ") : number.format(value));
    if (normalized.has(valueKey)) {
      const track = Element(field, "span", "", "material-meter");
      track.setAttribute("aria-hidden", "true");
      track.style.setProperty("--amount", `${100 * Math.max(0, Math.min(1, value))}%`);
    }
  }
}

function DrawMaterial(parent, material, stage) {
  const preview = Element(parent, "div", "", "material-preview");
  const canvas = Element(preview, "canvas");
  canvas.width = canvas.height = 144;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "当前材质球");
  const meta = Element(preview, "div", "", "material-preview-meta");
  Element(meta, "strong", material.isMeshPhysicalMaterial ? "PBR 物理材质"
    : material.isMeshStandardMaterial ? "PBR 标准材质" : material.type).title = material.type;
  Element(meta, "span", [
    material.transparent ? "透明" : material.alphaTest > 0 ? "裁切" : "不透明",
    ["正面", "背面", "双面"][material.side],
  ].filter(Boolean).join(" · "));
  stage.PreviewMaterial(material, canvas);

  const extra = [
    ["自发光", "emissiveMap", "emissiveIntensity", "RGB", material.emissive?.getHex() > 0],
    ["不透明度", "alphaMap", "opacity", "G", material.transparent],
    ["裁切阈值", null, "alphaTest", null, material.alphaTest > 0],
    ["镜面反射强度", "specularIntensityMap", "specularIntensity", "A", material.specularIntensity != null],
    ["清漆", "clearcoatMap", "clearcoat", "R", material.clearcoat > 0],
    ["清漆粗糙度", "clearcoatRoughnessMap", "clearcoatRoughness", "G", material.clearcoat > 0],
  ];
  const parameters = Element(parent, "dl", "", "inspector-metrics material-metrics");
  const properties = Element(parent, "dl", "", "material-properties");
  const orm = material.userData.ormUniforms;
  const packedOrm = (orm?.ao || orm?.metalness) && material.roughnessMap;
  for (const [label, mapKey, valueKey, channel] of surface) {
    const texture = packedOrm && mapKey === "roughnessMap" ? null : material[mapKey];
    if (mapKey === "normalMap" && !texture) continue;
    if (mapKey === "aoMap" && !texture && !orm?.ao) continue;
    if (!texture && material[valueKey] == null) continue;
    const value = mapKey === "aoMap" && orm?.ao ? orm.aoIntensity.value : material[valueKey];
    const scalar = typeof value === "number";
    if (scalar) Field(parameters, label, number.format(value));
    if (texture || !scalar) DrawProperty(properties, label, texture, scalar ? null : value, mapKey, valueKey, channel);
  }
  if (packedOrm) {
    const channels = [orm.ao && "R 遮蔽", "G 粗糙度", orm.metalness && "B 金属度"].filter(Boolean).join(" · ");
    DrawProperty(properties, "ORM 贴图", packedOrm, null, "roughnessMap", null, channels);
  }
  const usedMaps = new Set([...surface, ...extra].map(([, slot]) => slot));
  const otherTextures = Object.entries(material).filter(([key, value]) => value?.isTexture && !usedMaps.has(key));
  const extras = extra.filter(([, slot, , , visible]) => material[slot] || visible);
  if (extras.length || otherTextures.length) {
    const advanced = Element(parent, "details", "", "material-extra");
    Element(advanced, "summary", "其他属性");
    const fields = Element(advanced, "dl", "", "material-properties");
    for (const [label, mapKey, valueKey, channel] of extras) {
      DrawProperty(fields, label, material[mapKey], material[valueKey], mapKey, valueKey, channel);
    }
    for (const [key, texture] of otherTextures) {
      DrawProperty(fields, textureSlots[key] || key, texture, null, key);
    }
  }
}

export function ShowWeaponModelInspector(container, model, stage) {
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
    DrawMaterial(materialPanel, materials[materialPicker.value], stage);
  };
  const UpdateMesh = () => {
    stage.SelectPart(null);
    meshPanel.replaceChildren();
    const mesh = meshes[meshPicker.value];
    meshPicker.title = mesh.name;
    const fields = Element(meshPanel, "dl", "", "inspector-metrics mesh-metrics");
    Field(fields, "顶点", number.format(mesh.vertices));
    Field(fields, "三角面", number.format(mesh.parts.reduce((sum, part) => sum + part.count / 3, 0)));
    const heading = Element(meshPanel, "h4", "", "texture-heading");
    Element(heading, "span", "子网格");
    Element(heading, "small", String(mesh.parts.length));
    const slots = Element(meshPanel, "ol", "", "mesh-slots");
    mesh.parts.forEach((part, index) => {
      const slot = Element(slots, "li");
      const materialIndex = materials.indexOf(part.material);
      const button = Element(slot, "button", "", "mesh-slot");
      button.type = "button";
      button.setAttribute("aria-pressed", "false");
      button.title = `材质槽 ${part.slot} · ${number.format(part.count / 3)} 三角面 · ${names[materialIndex]}`;
      Element(button, "small", String(index));
      Element(button, "span", names[materialIndex]);
      Element(button, "small", number.format(part.count / 3));
      button.addEventListener("click", () => {
        const selecting = button.getAttribute("aria-pressed") === "false";
        slots.querySelector('[aria-pressed="true"]')?.setAttribute("aria-pressed", "false");
        button.setAttribute("aria-pressed", String(selecting));
        stage.SelectPart(selecting ? part : null);
        if (selecting) {
          if (Number(materialPicker.value) !== materialIndex) {
            materialPicker.value = materialIndex;
            UpdateMaterial();
          }
          materialSection.parentElement.open = true;
        }
      });
    });
  };
  meshPicker.addEventListener("change", UpdateMesh);
  materialPicker.addEventListener("change", UpdateMaterial);
  UpdateMesh();
  UpdateMaterial();
}
